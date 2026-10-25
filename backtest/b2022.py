"""Backtest REAL: 1º turno 2022 -> 2º turno 2022 (Lula 13 x Bolsonaro 22), por município.

Fonte única: Portal de Dados Abertos do TSE (dadosabertos.tse.jus.br / cdn.tse.jus.br). NUNCA acessa
resultados.tse.jus.br.
  - votacao_candidato_munzona_2022.zip  (só o CSV _BR = Presidente): base do 1º turno por município
  - detalhe_votacao_munzona_2022.zip    (só o CSV _BR): eleitorado/comparecimento/válidos/brancos/nulos
  - bweb_2t_{UF}_*.zip (dataset "Resultados - 2022 - Boletim de Urna"): uma linha por seção do 2º turno com
    DT_BU_RECEBIDO -> ordem REAL de chegada e verdade final (bate exatamente com o oficial).

Ordem de chegada: seed 0 = ordem real exata dos boletins; seed>0 = ordem real perturbada (UF/zona/seção).
Validação: o placar oficial vira para Lula em 67,62% das seções às 18h43 (histórico: 67,76%, 18h44).

Uso:
  .venv/bin/python -m backtest.b2022 [tabela] [--md]   # tabela default x calibrado (x proposto, se houver)
  .venv/bin/python -m backtest.b2022 realismo          # curva do P0 / ponto de virada por semente
  .venv/bin/python -m backtest.b2022 calibrar          # busca coordenada e grava params_calibrados.json
  .venv/bin/python -m backtest.b2022 replay [seed]     # gera data/public/replay/2022/*
"""
from __future__ import annotations

import json
import math
import os
import sys
import time
import urllib.request
import zipfile
from dataclasses import asdict, fields, replace
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

from apuracao.engine.modelo import Params, logit, inv_logit, p1_regional, projetar, resumo_sims
from apuracao.engine.state import preparar_base

ROOT = Path(__file__).resolve().parent.parent
DADOS = ROOT / "data" / "backtest2022"
CDN = "https://cdn.tse.jus.br/estatistica/sead/odsele"
ARQS = {
    "votacao_candidato_munzona_2022.zip": f"{CDN}/votacao_candidato_munzona/votacao_candidato_munzona_2022.zip",
    "detalhe_votacao_munzona_2022.zip": f"{CDN}/detalhe_votacao_munzona/detalhe_votacao_munzona_2022.zip",
}
A, B = "13", "22"
COV = ["12", "15"]          # Ciro, Tebet (demais em o_resto)
SEEDS = (0, 1, 2, 3, 4, 5)
PONTOS = (0.05, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90)
CAMPOS_CAL = ["k_uf", "k_reg", "k_cov", "k_int", "s_mun", "s_ord", "sig_nat0", "sig_nat_min", "sig_reg0",
              "sig_reg_min", "sig_uf_min", "kappa", "min_mun_cov", "s_t", "sig_t_nat", "sig_t_uf"]
# âncoras históricas (minutos após 17h00 BRT): 67,76% às 18h44; 98,8% às 19h55
ANCORAS = [(104.0, 0.6776), (175.0, 0.988)]


def _regioes() -> dict[str, str]:
    cfg = yaml.safe_load((ROOT / "config" / "eleicao.yaml").read_text(encoding="utf-8"))
    return {uf: r for r, ufs in cfg["regioes"].items() for uf in ufs}


# ----------------------------------------------------------------------------------------------- dados
def baixar() -> None:
    DADOS.mkdir(parents=True, exist_ok=True)
    for nome, url in ARQS.items():
        dst = DADOS / nome
        if dst.exists() and dst.stat().st_size > 0:
            continue
        assert "resultados.tse.jus.br" not in url
        print(f"baixando {url} ...", flush=True)
        tmp = dst.with_suffix(".part")
        with urllib.request.urlopen(url, timeout=600) as r, open(tmp, "wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
        tmp.rename(dst)


def zonas() -> pd.DataFrame:
    """Uma linha por (turno, uf, município, zona): aptos, comp, válidos, brancos, nulos, seções, hora, votos."""
    cache = DADOS / "zonas_pres_2022.parquet"
    if cache.exists():
        return pd.read_parquet(cache)
    baixar()
    with zipfile.ZipFile(DADOS / "detalhe_votacao_munzona_2022.zip") as z:
        d = pd.read_csv(z.open("detalhe_votacao_munzona_2022_BR.csv"), sep=";", encoding="latin1",
                        dtype={"CD_MUNICIPIO": str})
    d = d[d["CD_CARGO"] == 1].copy()
    d["CD_MUNICIPIO"] = d["CD_MUNICIPIO"].str.zfill(5)
    d["h"] = pd.to_datetime(d["DT_ULTIMA_TOTALIZACAO"] + " " + d["HH_ULTIMA_TOTALIZACAO"], dayfirst=True)
    k = ["NR_TURNO", "SG_UF", "CD_MUNICIPIO", "NR_ZONA"]
    det = d.groupby(k).agg(nome=("NM_MUNICIPIO", "first"), aptos=("QT_APTOS", "sum"),
                           comp=("QT_COMPARECIMENTO", "sum"), validos=("QT_TOTAL_VOTOS_VALIDOS", "sum"),
                           brancos=("QT_VOTOS_BRANCOS", "sum"), nulos=("QT_TOTAL_VOTOS_NULOS", "sum"),
                           secoes=("QT_TOTAL_SECOES", "sum"), h=("h", "max")).reset_index()
    with zipfile.ZipFile(DADOS / "votacao_candidato_munzona_2022.zip") as z:
        v = pd.read_csv(z.open("votacao_candidato_munzona_2022_BR.csv"), sep=";", encoding="latin1",
                        usecols=k + ["CD_CARGO", "NR_CANDIDATO", "QT_VOTOS_NOMINAIS"], dtype={"CD_MUNICIPIO": str})
    v = v[v["CD_CARGO"] == 1].copy()
    v["CD_MUNICIPIO"] = v["CD_MUNICIPIO"].str.zfill(5)
    pv = v.pivot_table(index=k, columns="NR_CANDIDATO", values="QT_VOTOS_NOMINAIS", aggfunc="sum", fill_value=0)
    pv.columns = [f"v{c}" for c in pv.columns]
    out = det.merge(pv.reset_index(), on=k, how="left").fillna(0)
    out = out.rename(columns={"NR_TURNO": "turno", "SG_UF": "uf", "CD_MUNICIPIO": "cd_tse", "NR_ZONA": "zona"})
    out["uf"] = out["uf"].str.lower()
    out["cd_tse"] = out["cd_tse"].str.zfill(5)
    for c in out.columns:
        if c.startswith("v") and c not in ("validos",):
            out[c] = out[c].astype(int)
    out.to_parquet(cache)
    return out


BWEB_PKG = "https://dadosabertos.tse.jus.br/api/3/action/package_show?id=resultados-2022-boletim-de-urna"


def baixar_bweb() -> list[Path]:
    """Boletins de urna do 2º turno 2022 (dataset 'Resultados - 2022 - Boletim de Urna' do Dados Abertos).
    Traz DT_BU_RECEBIDO por seção = ordem real de chegada."""
    d = DADOS / "bweb"
    d.mkdir(parents=True, exist_ok=True)
    lst = DADOS / "bweb_2t_urls.txt"
    if not lst.exists():
        with urllib.request.urlopen(BWEB_PKG, timeout=60) as r:
            pkg = json.load(r)
        urls = [x["url"] for x in pkg["result"]["resources"] if "bweb_2t" in x["url"] and x["url"].endswith(".zip")]
        lst.write_text("\n".join(urls) + "\n")
    out = []
    for url in lst.read_text().split():
        assert "resultados.tse.jus.br" not in url and url.startswith("https://cdn.tse.jus.br/")
        dst = d / url.rsplit("/", 1)[1]
        if not dst.exists():
            print(f"baixando {url}", flush=True)
            urllib.request.urlretrieve(url, dst.with_suffix(".part"))
            dst.with_suffix(".part").rename(dst)
        out.append(dst)
    return out


def secoes() -> pd.DataFrame:
    """Uma linha por seção do 2º turno (Presidente): aptos, comparecimento, votos 13/22, brancos, nulos, minuto de
    recebimento do BU (após 17h00 de Brasília)."""
    cache = DADOS / "secoes_2t_2022.parquet"
    if cache.exists():
        return pd.read_parquet(cache)
    cols = ["SG_UF", "CD_MUNICIPIO", "NR_ZONA", "NR_SECAO", "CD_CARGO_PERGUNTA", "DT_BU_RECEBIDO", "QT_APTOS",
            "QT_COMPARECIMENTO", "CD_TIPO_VOTAVEL", "NR_VOTAVEL", "QT_VOTOS"]
    parts = []
    for zp in baixar_bweb():
        with zipfile.ZipFile(zp) as z:
            nome = [n for n in z.namelist() if n.endswith(".csv")][0]
            df = pd.read_csv(z.open(nome), sep=";", encoding="latin1", usecols=cols,
                             dtype={"CD_MUNICIPIO": str, "SG_UF": str})
        df = df[df["CD_CARGO_PERGUNTA"] == 1]
        k = ["SG_UF", "CD_MUNICIPIO", "NR_ZONA", "NR_SECAO"]
        df["va"] = np.where(df["NR_VOTAVEL"] == int(A), df["QT_VOTOS"], 0)
        df["vb"] = np.where(df["NR_VOTAVEL"] == int(B), df["QT_VOTOS"], 0)
        df["vbr"] = np.where(df["CD_TIPO_VOTAVEL"] == 2, df["QT_VOTOS"], 0)
        df["vnu"] = np.where(df["CD_TIPO_VOTAVEL"] == 3, df["QT_VOTOS"], 0)
        g = df.groupby(k).agg(aptos=("QT_APTOS", "first"), comp=("QT_COMPARECIMENTO", "first"), a=("va", "sum"),
                              b=("vb", "sum"), vbr=("vbr", "sum"), vnu=("vnu", "sum"),
                              rec=("DT_BU_RECEBIDO", "first")).reset_index()
        parts.append(g)
        print(f"  {zp.name}: {len(g)} seções", flush=True)
    s = pd.concat(parts, ignore_index=True)
    s = s.rename(columns={"SG_UF": "uf", "CD_MUNICIPIO": "cd_tse", "NR_ZONA": "zona", "NR_SECAO": "secao"})
    s["uf"] = s["uf"].str.lower()
    s["cd_tse"] = s["cd_tse"].str.zfill(5)
    s["tmin"] = (pd.to_datetime(s["rec"], dayfirst=True) - pd.Timestamp("2022-10-30 17:00:00")).dt.total_seconds() / 60
    s = s.drop(columns=["rec"])
    s.to_parquet(cache)
    return s


def base_1t(z: pd.DataFrame) -> pd.DataFrame:
    """Base municipal do 1º turno 2022 no mesmo formato de data/base/base_1turno.parquet."""
    z1 = z[z.turno == 1]
    vcols = [c for c in z1.columns if c.startswith("v") and c[1:].isdigit()]
    b = z1.groupby(["uf", "cd_tse"]).agg(nome=("nome", "first"), eleitorado=("aptos", "sum"),
                                         comparecimento=("comp", "sum"), validos=("validos", "sum"),
                                         brancos=("brancos", "sum"), nulos=("nulos", "sum"),
                                         secoes=("secoes", "sum"), **{c: (c, "sum") for c in vcols}).reset_index()
    ref = pd.read_parquet(ROOT / "data" / "base" / "base_1turno.parquet")[["cd_tse", "cd_ibge", "capital"]]
    ref["cd_tse"] = ref["cd_tse"].astype(str).str.zfill(5)
    b = b.merge(ref, on="cd_tse", how="left")
    b["capital"] = b["capital"].fillna(False).astype(bool) & (b["uf"] != "zz")
    b["cd_ibge"] = b["cd_ibge"].fillna("").astype(str)
    b["regiao"] = b["uf"].map(_regioes()).fillna("EXT")
    b["abstencao"] = b["eleitorado"] - b["comparecimento"]
    return b


def montar(z: pd.DataFrame, sec: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """Retorna (m0: 1 linha por município com a base do 1º turno + te/ts do 2º; sec: seções do 2º turno com o
    índice do município; final: resultado verdadeiro). A verdade e o eleitorado do 2º turno vêm dos boletins de urna
    (batem exatamente com o detalhe/votação por zona: 60.345.999 x 58.206.354)."""
    b = base_1t(z)
    bp = preparar_base(b, A, B, COV)
    nomes = z[z.turno == 2].groupby(["uf", "cd_tse"])["nome"].first().rename("nome_2t").reset_index()
    mun2 = sec.groupby(["uf", "cd_tse"]).agg(te=("aptos", "sum"), ts=("aptos", "size"), a_fin=("a", "sum"),
                                             b_fin=("b", "sum"), comp_fin=("comp", "sum")).reset_index()
    mun2 = mun2.merge(nomes, on=["uf", "cd_tse"], how="left")
    m = mun2.merge(bp, on=["uf", "cd_tse"], how="left")
    sem_base = m["p0"].isna()
    m["regiao"] = m["uf"].map(_regioes()).fillna("EXT")
    m["nome"] = m["nome"].fillna(m["nome_2t"])
    m["capital"] = m["capital"].fillna(False).astype(bool)
    m["capital_f"] = m["capital"].astype(float)
    m["cd_ibge"] = m["cd_ibge"].fillna("").astype(str)
    for col in ["p0", "t_1t", "v_1t", "bn_1t", "o_resto", *[f"o_{c}" for c in COV]]:
        m[col] = m[col].fillna(m.groupby("uf")[col].transform("mean")).fillna(m[col].mean())
    for col in ["a1", "b1", "validos_1t", "eleitorado", "comparecimento", "validos", "brancos", "nulos"]:
        m[col] = m[col].fillna(0.0)
    m["te"] = m["te"].astype(float)
    m["log_eleit"] = np.log(m["te"].clip(lower=50))
    m["lp0"] = logit(m["p0"].to_numpy(float))
    m["porte"] = pd.cut(m["te"], [-1, 10_000, 50_000, 200_000, 1_000_000, 1e12],
                        labels=["ate10k", "10a50k", "50a200k", "200ka1m", "acima1m"]).astype(str)
    m = m.reset_index(drop=True)
    idx = {k: i for i, k in enumerate(zip(m["uf"], m["cd_tse"]))}
    sec = sec.copy()
    sec["mi"] = [idx[k] for k in zip(sec["uf"], sec["cd_tse"])]
    # exterior e seções recebidas antes das 17h: divulgadas todas no início (TSE só divulga após 17h de Brasília)
    sec["t0"] = sec["tmin"].clip(lower=0.0)
    A_, B_ = m["a_fin"].sum(), m["b_fin"].sum()
    final = {"pct_a": 100 * A_ / (A_ + B_), "a": int(A_), "b": int(B_), "sem_base": int(sem_base.sum()),
             "votos_sem_base": int((m.loc[sem_base, "a_fin"] + m.loc[sem_base, "b_fin"]).sum())}
    return m, sec.reset_index(drop=True), final


# ----------------------------------------------------------------------------------- ordem de chegada
class Ordem:
    """Ordem de chegada REAL (DT_BU_RECEBIDO de cada seção). seed=0: ordem exata de 2022. seed>0: ordem real
    perturbada (atraso por UF, por zona e por seção) para gerar apurações alternativas plausíveis."""

    def __init__(self, sec: pd.DataFrame, seed: int = 0, js_uf=8.0, js_zona=10.0, js_sec=5.0):
        t = sec["t0"].to_numpy(float).copy()
        if seed:
            rng = np.random.default_rng(seed)
            uf_c = pd.factorize(sec["uf"])[0]
            zk = pd.factorize(sec["uf"] + sec["zona"].astype(str))[0]
            t = t + rng.normal(0, js_uf, uf_c.max() + 1)[uf_c] + rng.normal(0, js_zona, zk.max() + 1)[zk] \
                + rng.normal(0, js_sec, len(t))
        self.sec = sec
        self.ordem = np.argsort(t, kind="stable")
        self.t = t
        self.N = len(t)

    def k_para(self, f: float) -> int:
        return int(math.ceil(f * self.N))

    def tau(self, k: int) -> float:
        return float(self.t[self.ordem[max(k - 1, 0)]])


def estado(m0: pd.DataFrame, ordem: Ordem, k: int) -> pd.DataFrame:
    """Estado da apuração com as k primeiras seções (na ordem de chegada) totalizadas."""
    sec = ordem.sec
    rev = np.zeros(ordem.N, bool)
    rev[ordem.ordem[:k]] = True
    mi = sec["mi"].to_numpy()[rev]
    M = len(m0)

    def s(col):
        return np.bincount(mi, weights=sec[col].to_numpy(float)[rev], minlength=M)
    m = m0.copy()
    m["est"], m["comp"], m["a"], m["b"] = s("aptos"), s("comp"), s("a"), s("b")
    m["vv"] = m["a"] + m["b"]
    m["vbr"], m["vnu"] = s("vbr"), s("vnu")
    m["abst"] = m["est"] - m["comp"]
    m["st"] = np.bincount(mi, minlength=M).astype(float)
    m["andamento"] = np.where(m["st"] >= m0["ts"], "f", np.where(m["st"] > 0, "p", "n"))
    return m


def curva_p0(ordem: Ordem, n_pts=1000):
    """(tau, frac_secoes, pct_lula_P0) ao longo da apuração."""
    a = ordem.sec["a"].to_numpy(float)[ordem.ordem].cumsum()
    b = ordem.sec["b"].to_numpy(float)[ordem.ordem].cumsum()
    ks = np.unique(np.linspace(1, ordem.N, n_pts).astype(int))
    return np.column_stack([ordem.t[ordem.ordem][ks - 1], ks / ordem.N, 100 * a[ks - 1] / np.maximum(a + b, 1)[ks - 1]])


def virada(curva) -> float | None:
    """Fração de seções em que Lula passa à frente no P0 de vez."""
    atras = np.where(curva[:, 2] <= 50)[0]
    if len(atras) == 0:
        return None
    return float(curva[min(atras[-1] + 1, len(curva) - 1), 1])


# --------------------------------------------------------------------------------------------- backtest
_CACHE: dict = {}


def dados():
    if "dados" not in _CACHE:
        _CACHE["dados"] = montar(zonas(), secoes())
    return _CACHE["dados"]


def cenarios(seeds=(0, 1, 2), pontos=PONTOS, **kw_ordem):
    """Pré-computa os estados (independem dos parâmetros do modelo)."""
    chave = (tuple(seeds), tuple(pontos), tuple(sorted(kw_ordem.items())))
    if chave in _CACHE:
        return _CACHE[chave]
    m0, sec, final = dados()
    out = []
    for sd in seeds:
        o = Ordem(sec, sd, **kw_ordem)
        for f in pontos:
            k = o.k_para(f)
            m = estado(m0, o, k)
            # snapshot anterior (5% das seções antes, ~5-10 min no ritmo de 2022): usado só pelo modelo proposto
            mp = estado(m0, o, max(k - int(0.05 * o.N), 1))
            m["a_prev"], m["b_prev"] = mp["a"].to_numpy(), mp["b"].to_numpy()
            out.append((sd, f, o.tau(k), m))
    _CACHE[chave] = (out, final)
    return out, final


def avaliar(params, cen, final, verbose=False, fn=None) -> pd.DataFrame:
    """fn: função de projeção (default: apuracao.engine.modelo.projetar; ou backtest.modelo_proposto.projetar)."""
    fn = fn or (projetar if isinstance(params, Params) else _proj_proposto())
    res = []
    fin = final["pct_a"]
    gu = cen[0][3].groupby("uf")
    fin_uf = 100 * gu.a_fin.sum() / (gu.a_fin.sum() + gu.b_fin.sum())
    for sd, f, tau, m in cen:
        pr = fn(m, params, COV)
        rs = resumo_sims(pr["sims"]["a_uf"].sum(0), pr["sims"]["b_uf"].sum(0))
        # cobertura por UF (só UFs ainda não concluídas)
        sa, sb = pr["sims"]["a_uf"], pr["sims"]["b_uf"]
        lo_u, med_u, hi_u = np.percentile(100 * sa / np.maximum(sa + sb, 1), [2.5, 50, 97.5], axis=1)
        qu = (m.groupby("uf").est.sum() / m.groupby("uf").te.sum()).reindex(pr["uf_codes"]).to_numpy()
        fu = fin_uf.reindex(pr["uf_codes"]).to_numpy()
        viva = qu < 0.995
        cob_uf = float(((lo_u <= fu) & (fu <= hi_u))[viva].mean()) if viva.any() else np.nan
        zu = ((med_u - fu) / np.maximum((hi_u - lo_u) / 3.92, 1e-9))[viva]
        zrms_uf = float(np.sqrt((zu ** 2).mean())) if viva.any() else np.nan
        p1 = p1_regional(m, pr["R"])
        p1a = sum(v["a"] for v in p1.values()); p1b = sum(v["b"] for v in p1.values())
        p0 = 100 * m["a"].sum() / max(m["a"].sum() + m["b"].sum(), 1)
        row = dict(seed=sd, ponto=f, tau=tau, secoes=100 * m["st"].sum() / m["ts"].sum(),
                   eleit=100 * m["est"].sum() / m["te"].sum(), p0=p0, p1=100 * p1a / (p1a + p1b),
                   p2=rs["pct_a"], lo=rs["ic_a"][0], hi=rs["ic_a"][1], prob=rs["prob_a"],
                   nfit=pr["modelo"]["n_municipios_ajuste"], cov=pr["modelo"]["usou_covariaveis"],
                   cob_uf=cob_uf, zrms_uf=zrms_uf)
        res.append(row)
        if verbose:
            print(f"s{sd} {100*f:4.0f}% P0={p0:6.2f} P1={row['p1']:6.2f} P2={row['p2']:6.2f} "
                  f"[{row['lo']:.2f},{row['hi']:.2f}] prob={row['prob']:.3f} nfit={row['nfit']}", flush=True)
    df = pd.DataFrame(res)
    df["final"] = fin
    for c in ("p0", "p1", "p2"):
        df[f"err_{c}"] = (df[c] - fin).abs()
    df["vies_p2"] = df["p2"] - fin
    df["largura"] = df["hi"] - df["lo"]
    df["cobre"] = (df["lo"] <= fin) & (fin <= df["hi"])
    df["z"] = (df["p2"] - fin) / (df["largura"] / 3.92)
    df["brier"] = (df["prob"] - float(fin > 50)) ** 2
    return df


def _proj_proposto():
    from backtest.modelo_proposto import projetar as pj
    return pj


def tabela(df: pd.DataFrame) -> pd.DataFrame:
    g = df.groupby("ponto").agg(secoes=("secoes", "mean"), err_p0=("err_p0", "mean"), err_p1=("err_p1", "mean"),
                                err_p2=("err_p2", "mean"), vies_p2=("vies_p2", "mean"), largura=("largura", "mean"),
                                cobre=("cobre", "mean"), z_abs_max=("z", lambda x: x.abs().max()),
                                prob=("prob", "mean"), prob_min=("prob", "min"), brier=("brier", "mean"),
                                cob_uf=("cob_uf", "mean"), zrms_uf=("zrms_uf", lambda x: float(np.sqrt((x ** 2).mean()))))
    g.index = [f"{100*i:.0f}%" for i in g.index]
    return g


def _md(t: pd.DataFrame) -> str:
    cols = ["ponto"] + list(t.columns)
    linhas = ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    for i, r in t.iterrows():
        linhas.append("| " + " | ".join([str(i)] + [f"{v:.3f}" if isinstance(v, (float, np.floating)) else str(v)
                                                    for v in r.values]) + " |")
    return "\n".join(linhas)


def resumo(df: pd.DataFrame) -> dict:
    return {"err_p2": df.err_p2.mean(), "err_p1": df.err_p1.mean(), "err_p0": df.err_p0.mean(),
            "cobertura": df.cobre.mean(), "largura": df.largura.mean(), "brier": df.brier.mean(),
            "z_rms": float(np.sqrt((df.z ** 2).mean())), "cob_uf": df.cob_uf.mean(),
            "zrms_uf": float(np.sqrt((df.zrms_uf ** 2).mean()))}


def perda(df: pd.DataFrame, z_lim=1.5) -> float:
    """Sub-cobertura pesa muito (com margem: |z| > 1.5 já penaliza, porque há UMA eleição real e as sementes são
    correlacionadas); depois largura do IC; depois erro absoluto da P2."""
    excesso = np.clip(df.z.abs() - z_lim, 0, None)
    sub = np.clip(0.95 - df.groupby("ponto").cobre.mean(), 0, None).sum()
    return float(10 * (excesso ** 2).mean() + 5 * sub + 0.5 * df.largura.mean() + 1.0 * df.err_p2.mean())


def carregar_proposto():
    """Params do protótipo (backtest/modelo_proposto.py), se o JSON tiver a seção 'proposto'."""
    pth = ROOT / "backtest" / "params_calibrados.json"
    if not pth.exists():
        return None
    d = json.loads(pth.read_text()).get("proposto")
    if not d:
        return None
    from backtest import modelo_proposto as mp
    campos = {f.name for f in fields(mp.Params)}
    return replace(mp.Params(), **{k: v for k, v in d.items() if k in campos})


def carregar_calibrados() -> Params:
    pth = ROOT / "backtest" / "params_calibrados.json"
    if not pth.exists():
        return Params()
    d = json.loads(pth.read_text())
    campos = {f.name for f in fields(Params)}
    return replace(Params(), **{k: v for k, v in d.get("params", d).items() if k in campos})


# ------------------------------------------------------------------------------------------- calibração
# Grades. Escalas da fase inicial (sig_nat0, sig_reg0, kappa) não descem abaixo do default: uma única eleição não
# justifica estreitar o IC no começo da apuração (o erro pequeno no início de 2022 pode ser sorte).
GRADE = {
    "sig_nat_min": [0.012, 0.02, 0.03, 0.04, 0.05],
    "sig_reg_min": [0.005, 0.01, 0.02, 0.03],
    "sig_uf_min": [0.008, 0.015, 0.025, 0.04],
    "sig_nat0": [0.045, 0.06, 0.08],
    "sig_reg0": [0.05, 0.07, 0.10],
    "kappa": [1.0, 1.1, 1.25, 1.4],
    "k_uf": [3.0, 6.0, 12.0, 24.0, 48.0],
    "k_reg": [10.0, 20.0, 40.0, 80.0, 160.0],
    "k_cov": [15.0, 30.0, 60.0, 120.0, 240.0],
    "s_mun": [0.06, 0.09, 0.12, 0.16, 0.22],
    "s_ord": [0.05, 0.10, 0.15, 0.25, 0.35, 0.5, 0.7],
    "min_mun_cov": [50, 100, 200, 400],
}
_CEN_GLOBAL: tuple | None = None


def _perda_worker(q: Params) -> float:
    cen, final = _CEN_GLOBAL
    return perda(avaliar(q, cen, final))


def calibrar(seeds=(0, 1, 2, 3), passes=3, n_sim=1000, ordem_campos=None, p_ini=None, procs=6, grade=None,
             salvar_parcial=True):
    """Busca coordenada: para cada campo, avalia todos os valores da grade em paralelo e fica com o melhor."""
    global _CEN_GLOBAL
    from concurrent.futures import ProcessPoolExecutor
    import multiprocessing as mp
    _CEN_GLOBAL = cenarios(seeds)
    p = replace(p_ini or Params(), n_sim=n_sim)
    hist = []
    melhor = _perda_worker(p)
    print(f"inicial perda={melhor:.4f}", flush=True)
    with ProcessPoolExecutor(procs, mp_context=mp.get_context("fork")) as ex:
        for ps in range(passes):
            mudou = False
            G = grade or GRADE
            for campo in (ordem_campos or list(G)):
                atual = getattr(p, campo)
                cands = [replace(p, **{campo: v}) for v in G[campo] if v != atual]
                t0 = time.time()
                ls = list(ex.map(_perda_worker, cands))
                for q, l in zip(cands, ls):
                    hist.append((ps, campo, getattr(q, campo), l))
                j = int(np.argmin(ls))
                if ls[j] < melhor - 1e-4:
                    melhor, p, mudou = ls[j], cands[j], True
                print(f"pass{ps} {campo:12s} -> {getattr(p, campo)} perda={melhor:.4f} "
                      f"[{', '.join(f'{getattr(q, campo)}:{l:.3f}' for q, l in zip(cands, ls))}] {time.time()-t0:.0f}s",
                      flush=True)
                if salvar_parcial:
                    salvar(p, melhor, parcial=True)
            if not mudou:
                break
    return p, melhor, hist


def salvar(p: Params, perda_v: float, parcial=False, extra: dict | None = None):
    d = {"fonte": "backtest/b2022.py (1T 2022 -> 2T 2022 por município; ordem real de chegada dos boletins de urna)",
         "perda": perda_v, "parcial": parcial,
         "params": {k: getattr(p, k) for k in CAMPOS_CAL}}
    if extra:
        d.update(extra)
    (ROOT / "backtest" / "params_calibrados.json").write_text(json.dumps(d, indent=2, ensure_ascii=False))


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "tabela"
    if cmd == "realismo":
        m0, sec, final = dados()
        print("final", final)
        for sd in range(6):
            o = Ordem(sec, sd)
            c = curva_p0(o)
            fr = [float((o.t <= t).mean()) for t, _ in ANCORAS]
            print(f"seed {sd}: virada P0 em {virada(c):.4f} | frac nas âncoras {[round(x, 3) for x in fr]} "
                  f"(real {[x for _, x in ANCORAS]}) | P0 a 5% {c[np.searchsorted(c[:, 1], 0.05), 2]:.2f}")
    elif cmd == "calibrar":
        p, l, _ = calibrar()
        salvar(p, l)
        print(p)
    elif cmd == "replay":
        from backtest.replay2022 import gerar
        gerar(int(sys.argv[2]) if len(sys.argv) > 2 else 0, passo=4.0)
    else:
        seeds = SEEDS
        cen, final = cenarios(seeds)
        print(f"final Lula {final['pct_a']:.3f}% ({final})")
        pd.set_option("display.width", 200)
        md = "--md" in sys.argv
        conf = [("default", Params()), ("calibrado", carregar_calibrados())]
        prop = carregar_proposto()
        if prop is not None:
            conf.append(("proposto (modelo_proposto + calibrado)", prop))
        for nome, p in conf:
            df = avaliar(replace(p, n_sim=5000), cen, final)
            r = resumo(df)
            print(f"\n=== {nome} ===  perda={perda(df):.3f} " + " ".join(f"{k}={v:.3f}" for k, v in r.items()))
            t = tabela(df)
            print(_md(t) if md else t.round(3).to_string())


if __name__ == "__main__":
    main()
