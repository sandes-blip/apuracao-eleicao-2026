"""Carga da base histórica: EA12 + EA20 de todos os municípios do 1º turno -> data/base/base_1turno.parquet."""
from __future__ import annotations

import asyncio
import logging
import math
import sys

import pandas as pd

from apuracao.config import settings
from apuracao.store.raw import RawStore
from apuracao.tse import parse, urls
from apuracao.tse.client import TSEClient

log = logging.getLogger("carga")


def porte(eleitorado: int) -> str:
    if eleitorado <= 10_000:
        return "ate10k"
    if eleitorado <= 50_000:
        return "10a50k"
    if eleitorado <= 200_000:
        return "50a200k"
    if eleitorado <= 1_000_000:
        return "200ka1m"
    return "acima1m"


async def baixar_municipios(cli: TSEClient, store: RawStore, ele: str) -> list[parse.Municipio]:
    u = urls.config_mun(ele)
    r = await cli.get(u, conditional=False)
    if r.status != 200:
        raise RuntimeError(f"EA12 indisponível ({r.status}) {u}")
    store.save(urls.chave(u), r.content)
    return parse.municipios(parse.load(r.content))


async def carga(ele: str | None = None, out_name: str = "base_1turno") -> pd.DataFrame:
    s = settings()
    ele = ele or s.eleicao_base
    store = RawStore(s.raw_dir, ele)
    cli = TSEClient(rps=s.rps, concurrency=10)
    try:
        muns = await baixar_municipios(cli, store, ele)
        log.info("%d municípios no EA12 de %s", len(muns), ele)
        # BR e UFs (validação)
        ufs = sorted({m.uf for m in muns})
        for uf in ["br", *ufs]:
            u = urls.resultado(ele, s.cargo, uf)
            r = await cli.get(u, conditional=False)
            if r.status == 200:
                store.save(urls.chave(u), r.content)

        rows: list[dict] = []
        done = 0

        async def one(m: parse.Municipio):
            nonlocal done
            u = urls.resultado(ele, s.cargo, m.uf, m.cd_tse)
            ch = urls.chave(u)
            content = store.read_latest(ch)
            if content is None:
                r = await cli.get(u, conditional=False)
                if r.status != 200:
                    log.warning("falhou %s (%s)", u, r.status)
                    return
                content = r.content
                store.save(ch, content)
            res = parse.resultado(parse.load(content))
            row = {
                "cd_tse": m.cd_tse, "cd_ibge": m.cd_ibge, "nome": m.nome, "uf": m.uf,
                "regiao": s.uf_regiao.get(m.uf, "EXT"), "capital": m.capital,
                "eleitorado": res.eleitorado, "comparecimento": res.comparecimento, "abstencao": res.abstencao,
                "validos": res.validos, "brancos": res.brancos, "nulos": res.nulos,
                "secoes": res.secoes_total, "and": res.andamento,
            }
            for n, v in res.votos.items():
                row[f"v{n}"] = v
            rows.append(row)
            done += 1
            if done % 500 == 0:
                log.info("%d/%d municípios", done, len(muns))

        await asyncio.gather(*(one(m) for m in muns))
    finally:
        await cli.close()

    df = pd.DataFrame(rows).fillna(0)
    a, b = f"v{s.cand_a}", f"v{s.cand_b}"
    vcols = [c for c in df.columns if c.startswith("v") and c[1:].isdigit()]
    for c in vcols:
        df[c] = df[c].astype(int)
    df["votos_a"] = df[a]
    df["votos_b"] = df[b]
    df["votos_outros"] = df["validos"] - df["votos_a"] - df["votos_b"]
    df["share2_a"] = df["votos_a"] / (df["votos_a"] + df["votos_b"]).where(lambda x: x > 0)
    df["taxa_comparecimento"] = df["comparecimento"] / df["eleitorado"].where(lambda x: x > 0)
    df["taxa_validos"] = df["validos"] / df["comparecimento"].where(lambda x: x > 0)
    df["porte"] = df["eleitorado"].map(porte)
    df = df.sort_values(["uf", "cd_tse"]).reset_index(drop=True)
    s.base_dir.mkdir(parents=True, exist_ok=True)
    df.to_parquet(s.base_dir / f"{out_name}.parquet", index=False)
    df.drop(columns=[]).to_csv(s.base_dir / f"{out_name}.csv", index=False)
    log.info("base salva: %d municípios, válidos=%d", len(df), df["validos"].sum())
    return df


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    ele = sys.argv[1] if len(sys.argv) > 1 else None
    asyncio.run(carga(ele))
