"""Cenário sintético para validar o motor: a partir do 1º turno real de 2026, gera um 2º turno 'verdadeiro'
com transferência não uniforme dos votos dos eliminados + ruído por UF/município + mudança de comparecimento,
e revela a apuração numa ordem realista (Sul/Sudeste e interior primeiro, Nordeste e capitais depois, cidades
grandes chegando aos poucos com viés de ordem). Mede erro e cobertura do IC95 da P1 e da P2 em cada ponto."""
from __future__ import annotations

import sys
import time

import numpy as np
import pandas as pd

from apuracao.config import settings
from apuracao.engine.modelo import Params, inv_logit, logit, p1_regional, projetar, resumo_sims
from apuracao.engine.state import carregar_base, preparar_base


def verdade(b: pd.DataFrame, rng, transfer=None, swing_nat=0.0) -> pd.DataFrame:
    s = settings()
    transfer = transfer or {"70": 0.45, "14": 0.15, "55": 0.20, "resto": 0.5}
    a1, b1 = b["a1"].to_numpy(), b["b1"].to_numpy()
    add_a = np.zeros(len(b))
    add_b = np.zeros(len(b))
    rest = b["validos_1t"].to_numpy() - a1 - b1
    for c in s.cfg["covariaveis_1t"]:
        v = b[f"o_{c}"].to_numpy() * b["validos_1t"].to_numpy()
        add_a += transfer[c] * v
        add_b += (1 - transfer[c]) * v
        rest -= v
    add_a += transfer["resto"] * rest
    add_b += (1 - transfer["resto"]) * rest
    p = (a1 + add_a + 0.5) / (a1 + b1 + add_a + add_b + 1)
    ufs = b["uf"].unique()
    uf_eff = dict(zip(ufs, rng.normal(0, 0.04, len(ufs))))
    reg_eff = {r: rng.normal(0, 0.03) for r in b["regiao"].unique()}
    lp = logit(p) + swing_nat + b["uf"].map(uf_eff).to_numpy() + b["regiao"].map(reg_eff).to_numpy() \
        + rng.normal(0, 0.10, len(b))
    p2 = inv_logit(lp)
    t2 = np.clip(b["t_1t"].to_numpy() * np.exp(rng.normal(-0.01, 0.02, len(b)) + b["regiao"].map(
        {"NE": -0.015, "S": 0.005}).fillna(0).to_numpy()), 0.2, 0.99)
    v2 = np.clip(b["v_1t"].to_numpy() * np.exp(rng.normal(0.005, 0.01, len(b))), 0.5, 0.995)
    out = b.copy()
    out["te"] = out["eleitorado"].astype(float)
    out["p2_true"] = p2
    out["t2_true"], out["v2_true"] = t2, v2
    return out


def revelar(tr: pd.DataFrame, frac_t: float, rng_seed: int = 7) -> pd.DataFrame:
    """Estado da apuração no 'tempo' frac_t (0..1). Cada município tem início e duração; NE/capitais atrasam."""
    rng = np.random.default_rng(rng_seed)
    n = len(tr)
    delay = rng.uniform(0, 0.5, n) + tr["regiao"].map({"NE": 0.18, "N": 0.10, "EXT": 0.25}).fillna(0).to_numpy() \
        + 0.12 * tr["capital"].to_numpy().astype(float)
    dur = 0.05 + 0.4 * np.clip(np.log10(tr["te"].clip(lower=1000).to_numpy()) - 3, 0, 4) / 4
    q = np.clip((frac_t - delay) / dur, 0, 1)
    # viés de ordem dentro do município: primeiras zonas puxam para um lado (aleatório por município), some em q=1
    bias = rng.normal(0, 0.15, n) * (1 - q)
    p_obs = inv_logit(logit(tr["p2_true"].to_numpy()) + bias)
    est = np.floor(tr["te"].to_numpy() * q)
    comp = est * tr["t2_true"].to_numpy()
    vv = comp * tr["v2_true"].to_numpy()
    m = tr.copy()
    m["est"], m["comp"], m["vv"] = est, np.round(comp), np.round(vv)
    m["a"] = np.round(vv * p_obs)
    m["b"] = m["vv"] - m["a"]
    m["st"] = np.round(q * 100)
    m["ts"] = 100
    m["andamento"] = np.where(q >= 1, "f", np.where(q > 0, "p", "n"))
    m["abst"], m["vbr"], m["vnu"] = 0, 0, 0
    return m


def rodar(params: Params | None = None, n_cen: int = 3, pontos=(0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9), verbose=True):
    s = settings()
    b = preparar_base(carregar_base(), s.cand_a, s.cand_b, s.cfg["covariaveis_1t"])
    b["p0"] = b["p0"].fillna(0.5)
    for c in ["t_1t", "v_1t"]:
        b[c] = b[c].fillna(b[c].mean())
    b["lp0"] = logit(b["p0"].to_numpy())
    res = []
    for k in range(n_cen):
        rng = np.random.default_rng(100 + k)
        tr = verdade(b, rng, swing_nat=rng.normal(0, 0.06))
        A = (tr["te"] * tr["t2_true"] * tr["v2_true"] * tr["p2_true"]).sum()
        B = (tr["te"] * tr["t2_true"] * tr["v2_true"] * (1 - tr["p2_true"])).sum()
        final = 100 * A / (A + B)
        for f in pontos:
            m = revelar(tr, f, rng_seed=200 + k)
            t0 = time.time()
            pr = projetar(m, params, s.cfg["covariaveis_1t"])
            rs = resumo_sims(pr["sims"]["a_uf"].sum(0), pr["sims"]["b_uf"].sum(0))
            p1 = p1_regional(m, pr["R"])
            p1a = sum(v["a"] for v in p1.values()); p1b = sum(v["b"] for v in p1.values())
            p0 = 100 * m["a"].sum() / max(m["a"].sum() + m["b"].sum(), 1)
            apur = 100 * m["est"].sum() / m["te"].sum()
            row = dict(cen=k, t=f, apurado=apur, final=final, p0=p0, p1=100 * p1a / (p1a + p1b), p2=rs["pct_a"],
                       lo=rs["ic_a"][0], hi=rs["ic_a"][1], prob=rs["prob_a"], seg=time.time() - t0,
                       nfit=pr["modelo"]["n_municipios_ajuste"])
            row["cobre"] = row["lo"] <= final <= row["hi"]
            res.append(row)
            if verbose:
                print(f"cen{k} t={f:.1f} apur={apur:5.1f}% final={final:6.2f} P0={p0:6.2f} P1={row['p1']:6.2f} "
                      f"P2={rs['pct_a']:6.2f} [{rs['ic_a'][0]:.2f},{rs['ic_a'][1]:.2f}] prob={rs['prob_a']:.3f} "
                      f"{'ok' if row['cobre'] else 'FORA'} {row['seg']:.1f}s nfit={row['nfit']}")
    df = pd.DataFrame(res)
    df["err_p0"] = (df.p0 - df.final).abs()
    df["err_p1"] = (df.p1 - df.final).abs()
    df["err_p2"] = (df.p2 - df.final).abs()
    if verbose:
        print(df.groupby("t")[["apurado", "err_p0", "err_p1", "err_p2", "cobre"]].mean().round(3))
    return df


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    rodar(n_cen=n)
