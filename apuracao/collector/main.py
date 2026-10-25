"""Coletor incremental do 2º turno.

Ciclo: EA14 (BR -ab) -> UFs com marca nova -> EA15 (UF -ab) + EA20 da UF -> municípios com marca nova -> EA20 municipal.
URLs municipais só para códigos presentes no EA12. Tudo que chega é gravado em disco antes de qualquer outra coisa.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import time
from pathlib import Path

from apuracao import alertas
from apuracao.config import settings
from apuracao.store import db
from apuracao.store.raw import RawStore
from apuracao.tse import parse, urls
from apuracao.tse.client import TSEClient

log = logging.getLogger("coletor")


class Coletor:
    def __init__(self, ele: str | None = None):
        self.s = settings()
        self.ele = ele or self.s.eleicao_alvo
        self.store = RawStore(self.s.raw_dir, self.ele)
        self.cli = TSEClient(rps=self.s.rps, concurrency=10, on_alert=alertas.alertar)
        self.muns: dict[str, set[str]] = {}          # uf -> códigos TSE válidos (EA12)
        self.uf_marca: dict[str, str] = {}
        self.mun_marca: dict[tuple[str, str], str] = {}
        self.ultimo_tse: str = ""
        self.ultimo_idg: str = ""
        self.ultima_mudanca: float | None = None
        self.ciclos = 0
        self.stop = asyncio.Event()
        self.pendentes: set[str] = set()   # UFs com município ainda defasado na CDN
        self.marcas_path = self.s.data_dir / "state" / f"coletor_marcas_{self.ele}.json"
        self.marcas_path.parent.mkdir(parents=True, exist_ok=True)

    # ---------- utilidades ----------
    def salvar(self, url: str, content: bytes) -> dict:
        ch = urls.chave(url)
        self.store.save(ch, content)
        try:
            d = json.loads(content)
        except Exception:
            return {}
        db.salvar_snapshot(self.ele, ch, str(d.get("idg", "")), f"{d.get('dt', '')} {d.get('ht', '')}".strip(), content)
        return d

    def status(self, extra: dict | None = None) -> None:
        p = self.s.data_dir / "state" / "coletor.json"
        p.parent.mkdir(parents=True, exist_ok=True)
        st = {
            "eleicao": self.ele, "ultimo_ciclo": time.time(), "ciclos": self.ciclos,
            "requisicoes": self.cli.n_requests, "erros": self.cli.n_errors,
            "urls_bloqueadas": len(self.cli.blocked), "ultimo_idg": self.ultimo_idg,
            "atualizado_tse": self.ultimo_tse, "ultima_mudanca": self.ultima_mudanca,
            "ultimo_ok_tse": self.cli.last_ok,
        }
        if extra:
            st.update(extra)
        tmp = p.with_suffix(".tmp")
        tmp.write_text(json.dumps(st, ensure_ascii=False))
        os.replace(tmp, p)

    # ---------- inicialização ----------
    async def carregar_municipios(self) -> None:
        u = urls.config_mun(self.ele)
        cached = self.store.read_latest(urls.chave(u))
        r = await self.cli.get(u, conditional=False)
        content = r.content if r.status == 200 else cached
        if content is None:
            raise RuntimeError(f"EA12 indisponível: {u} ({r.status})")
        if r.status == 200:
            self.salvar(u, content)
        for m in parse.municipios(parse.load(content)):
            self.muns.setdefault(m.uf, set()).add(m.cd_tse)
        log.info("EA12: %d municípios em %d UFs", sum(map(len, self.muns.values())), len(self.muns))
        # marcas já processadas (reinício sem rebaixar tudo). A marca é a do EA15, não a do EA20
        # (o EA20 municipal traz dt/ht próprios, diferentes do acompanhamento).
        try:
            d = json.loads(self.marcas_path.read_text())
            if d.get("eleicao") == self.ele:
                self.mun_marca = {tuple(k.split(":")): v for k, v in d["mun"].items()}
                self.uf_marca = d.get("uf", {})
            log.info("%d marcas municipais restauradas", len(self.mun_marca))
        except Exception:
            pass

    def salvar_marcas(self) -> None:
        tmp = self.marcas_path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"eleicao": self.ele, "uf": self.uf_marca,
                                   "mun": {f"{k[0]}:{k[1]}": v for k, v in self.mun_marca.items()}}))
        os.replace(tmp, self.marcas_path)

    async def baixar_fotos(self) -> None:
        out = self.s.public_dir / "fotos"
        out.mkdir(parents=True, exist_ok=True)
        c = self.store.read_latest(urls.chave(urls.resultado(self.ele, self.s.cargo, "br")))
        if not c:
            return
        res = parse.resultado(parse.load(c))
        for cand in self.s.candidatos:
            dest = out / f"{cand['n']}.jpeg"
            sq = res.sqcand.get(cand["n"])
            if dest.exists() or not sq:
                continue
            r = await self.cli.get(urls.foto(self.ele, sq), conditional=False, retries=1)
            if r.status == 200 and r.content:
                dest.write_bytes(r.content)
                log.info("foto %s salva", cand["n"])

    # ---------- ciclo ----------
    async def ciclo(self) -> None:
        self.ciclos += 1
        u_ab = urls.ab(self.ele, "br")
        r = await self.cli.get(u_ab)
        if r.status == 200:
            d = self.salvar(u_ab, r.content)
            linhas = parse.acompanhamento(d)
        elif r.not_modified:
            c = self.store.read_latest(urls.chave(u_ab))
            linhas = parse.acompanhamento(parse.load(c)) if c else []
        else:
            log.warning("EA14 falhou (%s)", r.status)
            return
        ufs_alt = [a.cdabr for a in linhas
                   if a.tpabr == "uf" and a.cdabr in self.muns and self.uf_marca.get(a.cdabr) != a.marca]
        ufs_alt = sorted(set(ufs_alt) | self.pendentes)
        self.pendentes = set()
        marcas = {a.cdabr: a.marca for a in linhas}
        if not ufs_alt and r.not_modified:
            return

        fila: list[tuple] = []

        async def processar_uf(uf: str) -> None:
            u15 = urls.ab(self.ele, uf)
            r15 = await self.cli.get(u15)
            if r15.status == 200:
                d15 = self.salvar(u15, r15.content)
            elif r15.not_modified:
                c = self.store.read_latest(urls.chave(u15))
                d15 = parse.load(c) if c else {}
            else:
                return
            for a in parse.acompanhamento(d15):
                if a.tpabr != "mun":
                    continue
                cd = str(a.cdabr).zfill(5)
                if cd not in self.muns.get(uf, ()):
                    continue  # nunca montar URL fora do EA12
                if a.secoes_tot == 0 and a.andamento != "f" and (uf, cd) not in self.mun_marca:
                    continue
                if self.mun_marca.get((uf, cd)) != a.marca:
                    fila.append((uf, cd, a.marca, a.secoes_tot, a.andamento))
            u20 = urls.resultado(self.ele, self.s.cargo, uf)
            r20 = await self.cli.get(u20)
            if r20.status == 200:
                self.salvar(u20, r20.content)
            # só marca a UF como processada se o EA15 veio novo ou já refletia tudo
            if r15.status == 200 or r15.not_modified:
                self.uf_marca[uf] = marcas.get(uf, "")

        await asyncio.gather(*(processar_uf(uf) for uf in ufs_alt))

        async def baixar_mun(uf: str, cd: str, esperado: str, st15: int, and15: str) -> None:
            u = urls.resultado(self.ele, self.s.cargo, uf, cd)
            rr = await self.cli.get(u)
            if rr.status == 200:
                content = rr.content
                self.salvar(u, content)
            elif rr.not_modified:
                content = self.store.read_latest(urls.chave(u))
            else:
                return
            if not content:
                return
            res = parse.resultado(parse.load(content))
            if res.secoes_tot >= st15 and (res.andamento == and15 or res.andamento == "f"):
                self.mun_marca[(uf, cd)] = esperado
            else:
                self.pendentes.add(uf)   # CDN ainda com versão antiga: revisitar no próximo ciclo

        if fila:
            log.info("%d UFs alteradas, %d municípios na fila", len(ufs_alt), len(fila))
            await asyncio.gather(*(baixar_mun(*item) for item in fila))
            self.ultima_mudanca = time.time()

        u_br = urls.resultado(self.ele, self.s.cargo, "br")
        rb = await self.cli.get(u_br)
        if rb.status == 200:
            d = self.salvar(u_br, rb.content)
            self.ultimo_idg = str(d.get("idg", ""))
            self.ultimo_tse = f"{d.get('dt', '')} {d.get('ht', '')}".strip()
            self.ultima_mudanca = time.time()
        await self.validar_somas(ufs_alt)

    async def validar_somas(self, ufs: list[str]) -> None:
        """Soma dos municípios bate com o arquivo da UF (tolerância para defasagem da CDN)."""
        for uf in ufs:
            c = self.store.read_latest(urls.chave(urls.resultado(self.ele, self.s.cargo, uf)))
            if not c:
                continue
            ruf = parse.resultado(parse.load(c))
            tot = 0
            for cd in self.muns.get(uf, ()):
                cm = self.store.read_latest(urls.chave(urls.resultado(self.ele, self.s.cargo, uf, cd)))
                if cm:
                    tot += parse.resultado(parse.load(cm)).validos
            if ruf.validos and abs(tot - ruf.validos) > max(5000, 0.02 * ruf.validos):
                alertas.alertar(f"Soma dos municípios de {uf.upper()} ({tot}) difere do arquivo da UF ({ruf.validos})",
                                chave=f"soma-{uf}")

    async def run(self) -> None:
        await self.carregar_municipios()
        fotos_ok = False
        while not self.stop.is_set():
            t0 = time.monotonic()
            try:
                await self.ciclo()
                if not fotos_ok:
                    await self.baixar_fotos()
                    fotos_ok = True
            except Exception as e:  # o coletor nunca pode morrer
                log.exception("erro no ciclo: %s", e)
                alertas.alertar(f"Erro no ciclo do coletor: {e}", chave="ciclo")
            self.status()
            try:
                self.salvar_marcas()
            except Exception as e:
                log.warning("falha ao salvar marcas: %s", e)
            dt = time.monotonic() - t0
            try:
                await asyncio.wait_for(self.stop.wait(), timeout=max(1.0, self.s.poll_s - dt))
            except asyncio.TimeoutError:
                pass
        await self.cli.close()


def main() -> None:
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(name)s %(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    c = Coletor()
    loop = asyncio.new_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, c.stop.set)
        except NotImplementedError:
            pass
    loop.run_until_complete(c.run())


if __name__ == "__main__":
    main()
