"""Processo `motor`: lê o estado coletado, projeta, detecta eventos, gera análise de IA e publica os JSON estáticos."""
from __future__ import annotations

import json
import logging
import os
import signal
import threading
import time
from dataclasses import fields
from datetime import datetime
from pathlib import Path

from apuracao.config import settings
from apuracao.engine import agregar, ia
from apuracao.engine.agregar import AVISO, BRT, agora_iso, municipio_json, municipios_compacto
from apuracao.engine.eventos import Detector
from apuracao.engine.modelo import Params
from apuracao.engine.state import fonte_latest, montar_estado
from apuracao.store import db
from apuracao.tse import urls

log = logging.getLogger("motor")


def carregar_params() -> Params:
    p = Params()
    s = settings()
    for path in [os.getenv("PARAMS_FILE"), str(Path(__file__).resolve().parents[2] / "backtest" / "params_calibrados.json")]:
        if path and Path(path).exists():
            try:
                d = json.loads(Path(path).read_text())
                d = d.get("params", d)
                validos = {f.name for f in fields(Params)}
                for k, v in d.items():
                    if k in validos:
                        setattr(p, k, type(getattr(p, k))(v) if getattr(p, k) is not None else v)
                log.info("parâmetros calibrados carregados de %s", path)
                break
            except Exception as e:
                log.warning("falha ao ler %s: %s", path, e)
    p.n_sim = int(os.getenv("N_SIM", p.n_sim))
    return p


def escrever(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    os.replace(tmp, path)


def ler(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


class Motor:
    def __init__(self):
        self.s = settings()
        self.pub = self.s.public_dir
        self.state_dir = self.s.data_dir / "state"
        self.params = carregar_params()
        self.det = Detector()
        self.timeline = ler(self.state_dir / "timeline.json", {"br": [], "uf": {}, "regiao": {}})
        self.historico = ler(self.pub / "ia" / "historico.json", {"analises": []})
        self.eventos = ler(self.pub / "eventos.json", {"eventos": []})
        self.replay_idx = ler(self.pub / "replay" / self.s.eleicao_alvo / "index.json",
                              {"eleicao": self.s.eleicao_alvo, "titulo": f"{self.s.cfg['titulo']} (ao vivo)", "momentos": []})
        self.ultima_assinatura = None
        self.ultimo_calc_t = 0.0
        self.calc = None
        self.ia_t = 0.0
        self.ia_rodando = False
        self.eventos_pend: list[dict] = []
        self.ia_conf_prev = None
        self.ia_lider_prev = None
        self.ia_lider_proj_prev = None
        self.min_recalc = float(os.getenv("MIN_RECALC_S", "45"))
        self.get = fonte_latest(self.s.eleicao_alvo)
        self.stop = threading.Event()
        self.duracao = None
        self.kappa_base = self.params.kappa
        # validação fora da amostra: previsão feita ANTES de o município reportar x resultado quando chega
        self.oos = ler(self.state_dir / "fora_amostra.json", {"previsto": {}, "erros": []})

    # ---------- status ----------
    def coletor_status(self) -> dict:
        return ler(self.state_dir / "coletor.json", {})

    def status_atual(self, calc) -> str:
        if calc is None:
            return "aguardando"
        ap = calc["apuracao"]
        if calc.get("and_br") == "f" or ap.get("definido_tse") and (ap.get("pct_secoes") or 0) >= 100:
            return "final"
        if (ap.get("pct_secoes") or 0) <= 0:
            return "aguardando"
        col = self.coletor_status()
        ult = col.get("ultima_mudanca") or 0
        ok = col.get("ultimo_ok_tse") or 0
        if time.time() - max(ult, 0) > 300 or time.time() - ok > 300:
            return "parado"
        return "ao_vivo"

    def assinatura(self) -> str:
        col = self.coletor_status()
        try:
            mt = (self.s.raw_dir / self.s.eleicao_alvo / "index.jsonl").stat().st_mtime
        except FileNotFoundError:
            mt = 0
        return f"{col.get('ultimo_idg')}|{mt}"

    # ---------- ciclo ----------
    def ciclo(self, force: bool = False) -> None:
        sig = self.assinatura()
        if not force and sig == self.ultima_assinatura and self.calc is not None:
            self.publicar_status()
            return
        if not force and time.time() - self.ultimo_calc_t < self.min_recalc and self.calc is not None:
            self.publicar_status()
            return
        t0 = time.time()
        est = montar_estado(self.get, self.s.eleicao_alvo)
        calc = agregar.calcular(est, self.params)
        self.validar_fora_amostra(calc)
        self.duracao = time.time() - t0
        self.ultima_assinatura = sig
        self.ultimo_calc_t = time.time()
        status = self.status_atual(calc)
        novos = self.det.detectar(calc, status)
        for e in novos:
            db.salvar_evento(e["momento"], e["tipo"], e["abrangencia"], e["texto"])
        self.eventos["eventos"] = (novos[::-1] + self.eventos["eventos"])[:500]
        self.eventos_pend += novos
        self.calc = calc
        self.atualizar_timeline(calc)
        self.publicar(calc, status)
        self.talvez_ia(calc, novos)
        log.info("ciclo: %.1f%% seções, P0 %s, P2 %s (%s), %.1fs", calc["apuracao"]["pct_secoes"] or 0,
                 calc["apuracao"]["pct"], calc["projecao"]["p2"]["pct"], calc["projecao"]["confianca"], self.duracao)

    def validar_fora_amostra(self, calc) -> None:
        """Compara a previsão de cada município (feita quando ele ainda não tinha votos) com o resultado quando ele passa
        de 50% apurado. Se o erro observado superar o esperado pelo modelo, alarga a incerteza (kappa entre 1 e 1,6)."""
        import numpy as np
        mu = calc["municipios"]
        prev = self.oos["previsto"]
        for row in mu.itertuples(index=False):
            if row.status == "nao_iniciada":
                if row.proj_a == row.proj_a:  # não-NaN
                    prev[row.cd] = row.proj_a
            elif row.cd in prev and row.pct_secoes >= 50 and (row.a + row.b) >= 1000:
                p_prev = min(max(prev.pop(row.cd) / 100, 1e-3), 1 - 1e-3)
                p_obs = min(max(row.a / (row.a + row.b), 1e-3), 1 - 1e-3)
                err = float(np.log(p_obs / (1 - p_obs)) - np.log(p_prev / (1 - p_prev)))
                self.oos["erros"].append([row.cd, round(err, 4), int(row.a + row.b)])
        erros = self.oos["erros"][-2000:]
        self.oos["erros"] = erros
        info = {"n": len(erros)}
        if len(erros) >= 30:
            recentes = erros[-300:]
            e = np.array([x[1] for x in recentes])
            w = np.array([x[2] for x in recentes], dtype=float)
            vies = float(np.average(e, weights=w))
            n_eff = float(w.sum() ** 2 / (w ** 2).sum())
            sig_nat = float(calc["proj"]["modelo"].get("sig_nat", 0.02))
            # erro sistemático dos que acabaram de chegar vs. o choque nacional que o modelo assume
            esperado = float(np.sqrt(sig_nat ** 2 + self.params.s_mun ** 2 / max(n_eff, 1)))
            razao = abs(vies) / esperado
            alvo = float(np.clip(self.kappa_base * max(1.0, razao / 2), self.kappa_base, 1.6 * self.kappa_base))
            self.params.kappa = 0.7 * self.params.kappa + 0.3 * alvo   # suavizado
            info.update({"vies_logit": round(vies, 4), "vies_pp": round(25 * vies, 2), "n_eff": round(n_eff, 1),
                         "razao": round(razao, 3), "kappa": round(self.params.kappa, 3),
                         "erro_medio_pp": round(25 * float(np.mean(np.abs(np.array([x[1] for x in erros])))), 2)})
        calc["projecao"]["modelo"]["fora_da_amostra"] = info
        escrever(self.state_dir / "fora_amostra.json", self.oos)

    def atualizar_timeline(self, calc) -> None:
        A = self.s.cand_a
        pj = calc["projecao"]
        disp = pj["disponivel"]

        def ponto(area_pct_sec, pct, p1, p2, ic, prob, conf):
            return {"momento": calc["gerado_em"], "pct_secoes": area_pct_sec, "pct": pct,
                    "p1": {A: p1} if disp and p1 is not None else None,
                    "p2": {A: p2} if disp and p2 is not None else None,
                    "ic95": {A: ic} if disp and ic else None, "prob": {A: prob} if disp and prob is not None else None,
                    "confianca": conf}

        ap = calc["apuracao"]
        if (ap["pct_secoes"] or 0) <= 0:
            return
        tl = self.timeline
        pt = ponto(ap["pct_secoes"], ap["pct"], pj["p1"]["pct"][A], pj["p2"]["pct"][A], pj["p2"]["ic95"][A],
                   pj["p2"]["prob"][A], pj["confianca"])
        if not tl["br"] or tl["br"][-1]["pct_secoes"] != pt["pct_secoes"] or tl["br"][-1]["pct"] != pt["pct"]:
            tl["br"].append(pt)
            db.salvar_serie(calc["gerado_em"], "br", {"pct_secoes": ap["pct_secoes"], "pct_a": ap["pct"][A],
                                                      "pct_b": ap["pct"][self.s.cand_b], "p1_a": pj["p1"]["pct"][A],
                                                      "p2_a": pj["p2"]["pct"][A], "ic_inf": pj["p2"]["ic95"][A][0],
                                                      "ic_sup": pj["p2"]["ic95"][A][1], "prob_a": pj["p2"]["prob"][A],
                                                      "prob_b": pj["p2"]["prob"][self.s.cand_b]})
        for chave, lista in (("uf", calc["ufs"]), ("regiao", calc["regioes"])):
            for u in lista:
                if (u["pct_secoes"] or 0) <= 0:
                    continue
                pr = u.get("proj", {})
                p1 = (u.get("proj_p1") or {}).get(A)
                pu = ponto(u["pct_secoes"], u["pct"], p1, pr.get("pct", {}).get(A), pr.get("ic95", {}).get(A),
                           pr.get("prob", {}).get(A), pj["confianca"])
                arr = tl[chave].setdefault(u["codigo"], [])
                if not arr or arr[-1]["pct_secoes"] != pu["pct_secoes"] or arr[-1]["pct"] != pu["pct"]:
                    arr.append(pu)
        escrever(self.state_dir / "timeline.json", tl)

    # ---------- publicação ----------
    def br_json(self, calc, status) -> dict:
        s = self.s
        cands = [{"n": c["n"], "nome": c["nome"], "partido": c["partido"], "cor": c["cor"],
                  "foto": f"/data/fotos/{c['n']}.jpeg"} for c in s.candidatos]
        ia_atual = self.historico["analises"][0] if self.historico["analises"] else None
        return {
            "gerado_em": calc["gerado_em"], "eleicao": s.eleicao_alvo, "titulo": s.cfg["titulo"], "status": status,
            "atualizado_tse": calc["atualizado_tse"], "candidatos": cands, "apuracao": calc["apuracao"],
            "projecao": calc["projecao"], "regioes": calc["regioes"], "ufs": calc["ufs"], "ia": ia_atual,
            "eventos_recentes": self.eventos["eventos"][:10], "aviso": AVISO,
        }

    def publicar(self, calc, status) -> None:
        pub = self.pub
        br = self.br_json(calc, status)
        escrever(pub / "latest" / "br.json", br)
        muns = calc["municipios"]
        ufs_by = {u["codigo"]: u for u in calc["ufs"]}
        for uf, grupo in muns.groupby("uf"):
            lista = [municipio_json(r) for r in grupo.itertuples(index=False)]
            u = ufs_by.get(uf, {})
            escrever(pub / "latest" / "uf" / f"{uf}.json", {"gerado_em": calc["gerado_em"], "uf": uf,
                                                            "nome": u.get("nome"), "regiao": u.get("regiao"),
                                                            "resumo": u, "municipios": lista})
        comp = municipios_compacto(muns, calc["gerado_em"])
        escrever(pub / "latest" / "municipios.json", comp)
        tl = self.timeline
        escrever(pub / "timeline" / "br.json", {"pontos": tl["br"]})
        for uf, arr in tl["uf"].items():
            escrever(pub / "timeline" / "uf" / f"{uf}.json", {"pontos": arr})
        for r, arr in tl["regiao"].items():
            escrever(pub / "timeline" / "regiao" / f"{r}.json", {"pontos": arr})
        escrever(pub / "eventos.json", self.eventos)
        escrever(pub / "ia" / "historico.json", self.historico)
        # replay: um momento por ciclo com mudança
        if (calc["apuracao"]["pct_secoes"] or 0) > 0:
            mid = datetime.now(BRT).strftime("%Y%m%dT%H%M%S")
            escrever(pub / "replay" / self.s.eleicao_alvo / f"{mid}.json", {"br": br, "municipios": comp})
            self.replay_idx["momentos"].append({"id": mid, "momento": calc["gerado_em"],
                                                "pct_secoes": calc["apuracao"]["pct_secoes"]})
            escrever(pub / "replay" / self.s.eleicao_alvo / "index.json", self.replay_idx)
        self.publicar_replay_index()
        self.publicar_status(status)

    def publicar_replay_index(self) -> None:
        eleicoes = [{"id": self.s.eleicao_alvo, "titulo": f"{self.s.cfg['titulo']} (ao vivo)"}]
        if (self.pub / "replay" / "2022" / "index.json").exists():
            eleicoes.append({"id": "2022", "titulo": "2º turno 2022 (simulação)"})
        escrever(self.pub / "replay" / "index.json", {"eleicoes": eleicoes})

    def publicar_status(self, status: str | None = None) -> None:
        col = self.coletor_status()
        status = status or self.status_atual(self.calc)
        seg = None
        if col.get("ultima_mudanca"):
            seg = int(time.time() - col["ultima_mudanca"])
        alertas = []
        try:
            linhas = (self.state_dir / "alertas.jsonl").read_text(encoding="utf-8").splitlines()[-5:]
            alertas = [json.loads(x)["msg"] for x in linhas if time.time() - json.loads(x)["t"] < 3600]
        except Exception:
            pass
        escrever(self.pub / "status.json", {
            "gerado_em": agora_iso(), "status": status,
            "atualizado_tse": col.get("atualizado_tse") or (self.calc or {}).get("atualizado_tse", ""),
            "segundos_desde_tse": seg,
            "coletor": {"ultimo_ciclo": datetime.fromtimestamp(col["ultimo_ciclo"], BRT).isoformat(timespec="seconds")
                        if col.get("ultimo_ciclo") else None,
                        "requisicoes": col.get("requisicoes"), "erros": col.get("erros"),
                        "urls_bloqueadas": col.get("urls_bloqueadas"), "ultimo_idg": col.get("ultimo_idg")},
            "motor": {"ultimo_calculo": datetime.fromtimestamp(self.ultimo_calc_t, BRT).isoformat(timespec="seconds")
                      if self.ultimo_calc_t else None, "duracao_s": round(self.duracao, 2) if self.duracao else None},
            "alertas": alertas,
        })
        if status == "parado" and self.calc is not None:
            from apuracao import alertas as al
            al.alertar("Coletor/TSE sem atualização há mais de 5 minutos durante a apuração.", chave="parado")

    # ---------- IA ----------
    def talvez_ia(self, calc, novos) -> None:
        if self.ia_rodando:
            return
        ap, pj = calc["apuracao"], calc["projecao"]
        if (ap["pct_secoes"] or 0) <= 0 and self.historico["analises"]:
            return
        agora = time.time()
        gatilho = any(e["tipo"] in ("virada_oficial", "virada_projetada", "confianca_alta", "definido_tse") for e in novos)
        vencido = agora - self.ia_t >= self.s.ia_intervalo_s
        if not (vencido or (gatilho and agora - self.ia_t >= 180)):
            return
        if (ap["pct_secoes"] or 0) <= 0 and self.historico["analises"]:
            return
        self.ia_rodando = True
        self.ia_t = agora
        eventos = self.eventos_pend
        self.eventos_pend = []
        anterior = self.historico["analises"][0] if self.historico["analises"] else None

        def run():
            try:
                analise, reg = ia.gerar_analise(calc, eventos, anterior)
                self.historico["analises"].insert(0, analise)
                self.historico["analises"] = self.historico["analises"][:300]
                log_path = self.state_dir / "ia_log.jsonl"
                with open(log_path, "a", encoding="utf-8") as f:
                    f.write(json.dumps({"momento": calc["gerado_em"], **reg, "publicada": analise}, ensure_ascii=False) + "\n")
                escrever(self.pub / "ia" / "historico.json", self.historico)
                if self.calc is not None:
                    escrever(self.pub / "latest" / "br.json", self.br_json(self.calc, self.status_atual(self.calc)))
                log.info("análise publicada (%s): %s", analise.get("origem"), analise.get("titulo"))
            except Exception as e:
                log.exception("erro na IA: %s", e)
            finally:
                self.ia_rodando = False

        threading.Thread(target=run, daemon=True).start()

    def run(self) -> None:
        while not self.stop.is_set():
            try:
                self.ciclo(force=self.calc is None)
            except Exception as e:
                log.exception("erro no ciclo do motor: %s", e)
                from apuracao import alertas
                alertas.alertar(f"Erro no motor: {e}", chave="motor")
            self.stop.wait(float(os.getenv("MOTOR_POLL_S", "10")))


def main() -> None:
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(name)s %(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    m = Motor()
    signal.signal(signal.SIGTERM, lambda *_: m.stop.set())
    signal.signal(signal.SIGINT, lambda *_: m.stop.set())
    m.run()


if __name__ == "__main__":
    main()
