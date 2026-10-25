"""Monta o estado atual (um DataFrame por município) a partir da base do 1º turno e dos arquivos do 2º turno."""
from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd

from apuracao.config import settings
from apuracao.tse import parse, urls

Getter = Callable[[str], bytes | None]


def fonte_latest(ele: str) -> Getter:
    root = settings().raw_dir / ele / "latest"
    cache: dict[str, tuple[float, bytes]] = {}

    def get(chave: str) -> bytes | None:
        pth = root / f"{chave}.json"
        try:
            mt = pth.stat().st_mtime
        except FileNotFoundError:
            return None
        hit = cache.get(chave)
        if hit and hit[0] == mt:
            return hit[1]
        c = pth.read_bytes()
        cache[chave] = (mt, c)
        return c

    return get


_base_cache: dict[str, pd.DataFrame] = {}


def carregar_base(nome: str = "base_1turno") -> pd.DataFrame:
    if nome in _base_cache:
        return _base_cache[nome]
    s = settings()
    df = pd.read_parquet(s.base_dir / f"{nome}.parquet")
    df["cd_tse"] = df["cd_tse"].astype(str).str.zfill(5)
    _base_cache[nome] = df
    return df


def preparar_base(base: pd.DataFrame, cand_a: str, cand_b: str, cov_cands: list[str]) -> pd.DataFrame:
    b = base.copy()
    b["a1"] = b[f"v{cand_a}"].astype(float)
    b["b1"] = b[f"v{cand_b}"].astype(float)
    b["validos_1t"] = b["validos"].astype(float)
    tot2 = b["a1"] + b["b1"]
    b["p0"] = np.where(tot2 > 0, (b["a1"] + 0.5) / (tot2 + 1.0), np.nan)
    soma_k = 0
    for c in cov_cands:
        col = f"v{c}"
        v = b[col].astype(float) if col in b else 0.0
        b[f"o_{c}"] = np.where(b["validos_1t"] > 0, v / b["validos_1t"].clip(lower=1), 0.0)
        soma_k = soma_k + v
    b["o_resto"] = np.where(b["validos_1t"] > 0, (b["validos_1t"] - tot2 - soma_k) / b["validos_1t"].clip(lower=1), 0.0)
    b["bn_1t"] = np.where(b["comparecimento"] > 0, (b["brancos"] + b["nulos"]) / b["comparecimento"].clip(lower=1), 0.05)
    b["t_1t"] = np.where(b["eleitorado"] > 0, b["comparecimento"] / b["eleitorado"].clip(lower=1), np.nan)
    b["v_1t"] = np.where(b["comparecimento"] > 0, b["validos"] / b["comparecimento"].clip(lower=1), np.nan)
    b["log_eleit"] = np.log(b["eleitorado"].clip(lower=50))
    b["capital_f"] = b["capital"].astype(float)
    return b


def _uf_ab_te(get: Getter, ele: str, uf: str) -> dict[str, tuple[int, int, int]]:
    c = get(urls.chave(urls.ab(ele, uf)))
    if not c:
        return {}
    out = {}
    for a in parse.acompanhamento(parse.load(c)):
        if a.tpabr == "mun":
            out[str(a.cdabr).zfill(5)] = (a.eleitorado, a.eleitorado_apurado, a.secoes_tot)
    return out


@dataclass
class Estado:
    m: pd.DataFrame                 # por município
    br: parse.Resultado | None      # arquivo Brasil (placar oficial)
    ufs: dict[str, parse.Resultado]
    ab_br: list[parse.Andamento]


def montar_estado(get: Getter | None = None, ele: str | None = None, muns: list[parse.Municipio] | None = None,
                  base: pd.DataFrame | None = None) -> Estado:
    s = settings()
    ele = ele or s.eleicao_alvo
    get = get or fonte_latest(ele)
    cov = s.cfg.get("covariaveis_1t", [])
    if base is None:
        base = carregar_base()
    b = preparar_base(base, s.cand_a, s.cand_b, cov)
    if muns is None:
        c = get(urls.chave(urls.config_mun(ele)))
        muns = parse.municipios(parse.load(c)) if c else [
            parse.Municipio(r.cd_tse, r.cd_ibge, r.nome, r.uf, bool(r.capital), []) for r in base.itertuples()]
    ufs_set = sorted({mu.uf for mu in muns})
    te_ab: dict[str, tuple[int, int, int]] = {}
    for uf in ufs_set:
        for cd, v in _uf_ab_te(get, ele, uf).items():
            te_ab[f"{uf}{cd}"] = v

    rows = []
    for mu in muns:
        ch = urls.chave(urls.resultado(ele, s.cargo, mu.uf, mu.cd_tse))
        c = get(ch)
        row = {"uf": mu.uf, "cd_tse": mu.cd_tse, "cd_ibge_2t": mu.cd_ibge, "nome_2t": mu.nome, "capital_2t": mu.capital}
        if c:
            r = parse.resultado(parse.load(c))
            row.update(te=r.eleitorado, est=r.eleitorado_apurado, st=r.secoes_tot, ts=r.secoes_total,
                       comp=r.comparecimento, abst=r.abstencao, vv=r.validos, vbr=r.brancos, vnu=r.nulos,
                       a=r.votos.get(s.cand_a, 0), b=r.votos.get(s.cand_b, 0), andamento=r.andamento,
                       dt=f"{r.dt} {r.ht}".strip())
        else:
            te, est, st = te_ab.get(f"{mu.uf}{mu.cd_tse}", (0, 0, 0))
            row.update(te=te, est=0, st=0, ts=0, comp=0, abst=0, vv=0, vbr=0, vnu=0, a=0, b=0, andamento="n", dt="")
        rows.append(row)
    cur = pd.DataFrame(rows)
    m = cur.merge(b, on=["uf", "cd_tse"], how="left", suffixes=("", "_1t"))
    m["regiao"] = m["uf"].map(s.uf_regiao).fillna("EXT")
    m["nome"] = m["nome"].fillna(m["nome_2t"])
    m["cd_ibge"] = m["cd_ibge"].fillna(m["cd_ibge_2t"]).astype(str)
    m["capital"] = m["capital"].fillna(m["capital_2t"]).astype(bool)
    m["capital_f"] = m["capital"].astype(float)
    # municípios sem base (ex.: nova cidade no exterior): média da UF
    for col in ["p0", "t_1t", "v_1t", "bn_1t", "o_resto", *[f"o_{c}" for c in cov]]:
        m[col] = m[col].fillna(m.groupby("uf")[col].transform("mean")).fillna(m[col].mean())
    for col in ["a1", "b1", "validos_1t", "eleitorado", "comparecimento", "validos", "brancos", "nulos"]:
        m[col] = m[col].fillna(0.0)
    m["te"] = np.where(m["te"] > 0, m["te"], m["eleitorado"])
    m["log_eleit"] = np.log(m["te"].clip(lower=50))
    m["lp0"] = np.log(m["p0"].clip(1e-4, 1 - 1e-4) / (1 - m["p0"].clip(1e-4, 1 - 1e-4)))
    m["porte"] = m["te"].map(_porte)

    br = None
    cbr = get(urls.chave(urls.resultado(ele, s.cargo, "br")))
    if cbr:
        br = parse.resultado(parse.load(cbr))
    ufs = {}
    for uf in ufs_set:
        cu = get(urls.chave(urls.resultado(ele, s.cargo, uf)))
        if cu:
            ufs[uf] = parse.resultado(parse.load(cu))
    cab = get(urls.chave(urls.ab(ele, "br")))
    ab_br = parse.acompanhamento(parse.load(cab)) if cab else []
    return Estado(m=m.reset_index(drop=True), br=br, ufs=ufs, ab_br=ab_br)


def _porte(e: float) -> str:
    if e <= 10_000:
        return "ate10k"
    if e <= 50_000:
        return "10a50k"
    if e <= 200_000:
        return "50a200k"
    if e <= 1_000_000:
        return "200ka1m"
    return "acima1m"
