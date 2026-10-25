"""Detecção de eventos (briefing 7.10). Cada evento único é emitido uma vez (chaves persistidas)."""
from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

from apuracao.config import settings
from apuracao.engine.agregar import NOMES_REGIAO, NOMES_UF


def _fmt_pct(x: float) -> str:
    return f"{x:.1f}".replace(".", ",")


class Detector:
    def __init__(self, path: Path | None = None):
        s = settings()
        self.path = path or (s.data_dir / "state" / "eventos_state.json")
        self.emitidos: set[str] = set()
        self.prev: dict = {}
        self.prob_hist: list[tuple[float, float]] = []
        if self.path.exists():
            try:
                d = json.loads(self.path.read_text())
                self.emitidos = set(d.get("emitidos", []))
                self.prev = d.get("prev", {})
                self.prob_hist = [tuple(x) for x in d.get("prob_hist", [])]
            except Exception:
                pass

    def salvar(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps({"emitidos": sorted(self.emitidos), "prev": self.prev,
                                         "prob_hist": self.prob_hist[-200:]}))

    def detectar(self, calc: dict, status: str, now: float | None = None) -> list[dict]:
        s = settings()
        A, B = s.cand_a, s.cand_b
        nome = {c["n"]: c["nome"] for c in s.candidatos}
        now = now or time.time()
        ev: list[dict] = []
        ap, pj = calc["apuracao"], calc["projecao"]

        def emit(tipo, texto, abr="br", chave=None):
            if chave:
                if chave in self.emitidos:
                    return
                self.emitidos.add(chave)
            ev.append({"momento": calc["gerado_em"], "tipo": tipo, "texto": texto, "abrangencia": abr})

        # virada no placar oficial
        lider = ap.get("lider")
        if lider and self.prev.get("lider") and lider != self.prev["lider"]:
            emit("virada_oficial", f"Virada no placar oficial: {nome[lider]} passa à frente com "
                 f"{_fmt_pct(ap['pct'][lider])}% dos votos válidos e {_fmt_pct(ap['pct_secoes'])}% das seções apuradas.")
        if lider:
            self.prev["lider"] = lider
        # virada projetada
        if pj["disponivel"]:
            lp = A if pj["p2"]["pct"][A] > 50 else B
            if self.prev.get("lider_proj") and lp != self.prev["lider_proj"]:
                emit("virada_projetada", f"A projeção passou a indicar {nome[lp]} à frente, com "
                     f"{_fmt_pct(pj['p2']['pct'][lp])}% projetado.")
            self.prev["lider_proj"] = lp
            # probabilidade
            pa = pj["p2"]["prob"][A]
            self.prob_hist.append((now, pa))
            self.prob_hist = [x for x in self.prob_hist if now - x[0] <= 900]
            antigos = [x for x in self.prob_hist if now - x[0] >= 540]
            if antigos and abs(pa - antigos[0][1]) > 0.10:
                k = f"prob-{int(now // 600)}"
                emit("mudanca_probabilidade", f"A probabilidade estimada para {nome[A]} variou de "
                     f"{_fmt_pct(100 * antigos[0][1])}% para {_fmt_pct(100 * pa)}% em cerca de 10 minutos.", chave=k)
            if pj["confianca"] == "alta" and self.prev.get("conf") != "alta":
                emit("confianca_alta", "O nível de confiança da projeção passou para Alta.", chave="conf-alta")
            self.prev["conf"] = pj["confianca"]
        # definido pelo TSE
        if ap.get("definido_tse") and ap.get("eleito"):
            emit("definido_tse", f"O TSE indica {nome[ap['eleito']]} como eleito.", chave="definido")
        # fonte parada
        if status == "parado":
            emit("fonte_parada", "Dados oficiais do TSE sem atualização há mais de 5 minutos.",
                 chave=f"parado-{int(now // 1800)}")
        # marcos
        for marco in (25, 50, 75, 90, 100):
            if (ap.get("pct_secoes") or 0) >= marco:
                emit("marco_apuracao", f"Brasil atingiu {marco}% das seções apuradas.", chave=f"br-{marco}")
        ufs = {u["codigo"]: u for u in calc["ufs"]}
        for uf in s.cfg.get("grandes_colegios", []):
            u = ufs.get(uf)
            if not u:
                continue
            for marco in (50, 90, 100):
                if (u.get("pct_secoes") or 0) >= marco:
                    emit("marco_apuracao", f"{NOMES_UF[uf]} atingiu {marco}% das seções apuradas.", uf, chave=f"{uf}-{marco}")
        # UF fora do padrão e comparecimento atípico
        regs = {r["codigo"]: r for r in calc["regioes"]}
        sw = [u["swing_pp"] for u in calc["ufs"] if u.get("swing_pp") is not None and (u.get("pct_secoes") or 0) >= 20]
        sd = max(float(np.std(sw)) if len(sw) >= 5 else 0.0, 1.0)
        for u in calc["ufs"]:
            if (u.get("pct_secoes") or 0) < 20 or u["codigo"] == "zz":
                continue
            r = regs.get(u["regiao"], {})
            if u.get("swing_pp") is not None and r.get("swing_pp") is not None and abs(u["swing_pp"] - r["swing_pp"]) > 2 * sd:
                emit("uf_fora_padrao", f"{u['nome']}: variação em relação ao 1º turno ({_fmt_pct(u['swing_pp'])} p.p.) "
                     f"destoa da região {NOMES_REGIAO[u['regiao']]} ({_fmt_pct(r['swing_pp'])} p.p.).", u["codigo"],
                     chave=f"ufpad-{u['codigo']}")
            if u.get("pct_comparecimento") and u.get("pct_comparecimento_1t") and \
                    abs(u["pct_comparecimento"] - u["pct_comparecimento_1t"]) > 5:
                emit("comparecimento_atipico", f"{u['nome']}: comparecimento de {_fmt_pct(u['pct_comparecimento'])}% "
                     f"contra {_fmt_pct(u['pct_comparecimento_1t'])}% no 1º turno.", u["codigo"], chave=f"comp-{u['codigo']}")
        # município fora do padrão
        mu = calc["municipios"]
        cont = mu[(mu["a"] + mu["b"]) > 0]
        if len(cont) > 100:
            sdr = float(np.std(cont["resid"]))
            big = cont[((cont["a"] + cont["b"]) > 10_000) & (cont["resid"].abs() > 3 * max(sdr, 0.05))]
            for row in big.head(5).itertuples():
                emit("municipio_fora_padrao", f"{row.nome} ({row.uf.upper()}): resultado destoa do esperado pelo padrão "
                     f"do 1º turno e da região ({_fmt_pct(row.swing_pp)} p.p. de variação).", row.cd, chave=f"mun-{row.cd}")
        self.salvar()
        return ev
