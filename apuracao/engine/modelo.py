"""Motor de projeção: P1 (regional) e P2 (swing hierárquico por regressão ridge + Monte Carlo correlacionado).

Notação: candidato "a" = primeiro da configuração (13), "b" = segundo (22). Tudo vetorizado em numpy.
Entrada: DataFrame `m` com uma linha por município (base do 1º turno + apuração atual), ver `state.py`.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

REGIOES = ["N", "NE", "CO", "SE", "S", "EXT"]


@dataclass
class Params:
    # variâncias estruturais (escala logit) usadas nos pesos e no BLUP do resíduo municipal
    s_mun: float = 0.12          # desvio próprio do município em relação ao modelo
    s_mun_ext: float = 0.30      # exterior é muito mais disperso
    s_ord: float = 0.15          # viés de ordem de chegada dentro do município (some com a conclusão)
    # penalidades (em "municípios equivalentes"; multiplicadas por 1/s_mun²)
    k_uf: float = 12.0
    k_reg: float = 40.0
    k_cov: float = 60.0
    k_int: float = 2.0           # intercepto quase livre (prior fraco em swing 0)
    min_mun_cov: int = 200       # covariáveis só entram com esta quantidade de municípios
    min_votos_fit: int = 30
    # comparecimento / válidos
    s_t: float = 0.04
    k_t_uf: float = 20.0
    k_t_reg: float = 60.0
    # Monte Carlo
    n_sim: int = 5000
    chunk: int = 500
    sig_nat0: float = 0.045      # choque nacional (logit) adicional quando nada foi apurado
    sig_nat_min: float = 0.012
    sig_reg0: float = 0.05
    sig_reg_min: float = 0.010
    sig_uf_min: float = 0.015
    sig_t_nat: float = 0.015     # erro de comparecimento (log), nacional
    sig_t_uf: float = 0.02
    df_t: float = 5.0            # caudas pesadas (t de Student)
    kappa: float = 1.0           # fator de alargamento calibrado no backtest
    seed: int | None = 20261025


def logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def inv_logit(x):
    return 1.0 / (1.0 + np.exp(-x))


def _t(rng, df, size):
    # t de Student com variância unitária
    z = rng.standard_t(df, size=size)
    return z * math.sqrt((df - 2) / df)


@dataclass
class Ajuste:
    beta: np.ndarray
    cov: np.ndarray
    cols: list[str]
    phi: float
    n: int
    usou_cov: bool


def _ridge(X, y, w, pen):
    XtW = X.T * w
    A = XtW @ X + np.diag(pen)
    b = XtW @ y
    try:
        Ainv = np.linalg.inv(A)
    except np.linalg.LinAlgError:
        Ainv = np.linalg.pinv(A)
    beta = Ainv @ b
    return beta, Ainv, A


def _design(m: pd.DataFrame, usar_cov: bool, cov_cols: list[str], stats: dict | None = None):
    """Matriz: intercepto + covariáveis padronizadas + dummies de região + dummies de UF."""
    cols, blocks, kinds = ["intercepto"], [np.ones(len(m))], ["int"]
    stats = stats if stats is not None else {}
    if usar_cov:
        for c in cov_cols:
            x = m[c].to_numpy(dtype=float)
            if c not in stats:
                wv = m["validos_1t"].to_numpy(dtype=float)
                mu = np.average(x, weights=wv) if wv.sum() > 0 else x.mean()
                sd = math.sqrt(np.average((x - mu) ** 2, weights=wv)) if wv.sum() > 0 else x.std()
                stats[c] = (mu, sd if sd > 1e-9 else 1.0)
            mu, sd = stats[c]
            blocks.append((x - mu) / sd)
            cols.append(c)
            kinds.append("cov")
    for r in REGIOES:
        blocks.append((m["regiao"].to_numpy() == r).astype(float))
        cols.append(f"reg_{r}")
        kinds.append("reg")
    for uf in sorted(m["uf"].unique()):
        blocks.append((m["uf"].to_numpy() == uf).astype(float))
        cols.append(f"uf_{uf}")
        kinds.append("uf")
    return np.column_stack(blocks), cols, kinds, stats


COV_COLS_BASE = ["lp0", "o_resto", "bn_1t", "t_1t", "log_eleit", "capital_f"]


def projetar(m: pd.DataFrame, p: Params | None = None, cov_cands: list[str] | None = None) -> dict:
    """Retorna dict com arrays por município e agregados por UF/região/BR, incluindo simulações."""
    p = p or Params()
    rng = np.random.default_rng(p.seed)
    cov_cols = ["lp0"] + [f"o_{c}" for c in (cov_cands or [])] + COV_COLS_BASE[1:]
    M = len(m)
    a = m["a"].to_numpy(float)
    b = m["b"].to_numpy(float)
    est = m["est"].to_numpy(float)
    te = m["te"].to_numpy(float)
    comp = m["comp"].to_numpy(float)
    vv = m["vv"].to_numpy(float)
    p0 = m["p0"].to_numpy(float)
    lp0 = logit(p0)
    q = np.where(te > 0, np.clip(est / np.maximum(te, 1), 0, 1), 0)
    n_ab = a + b
    ext = (m["regiao"].to_numpy() == "EXT")
    s_mun = np.where(ext, p.s_mun_ext, p.s_mun)

    # ---------- swing de preferência ----------
    p_obs = (a + 0.5) / (n_ab + 1.0)
    d = logit(p_obs) - lp0
    var_obs = s_mun ** 2 + 1.0 / np.maximum(n_ab * p0 * (1 - p0), 1e-6) + (p.s_ord ** 2) * (1 - q)
    fit = (n_ab >= p.min_votos_fit) & (q > 0)
    nfit = int(fit.sum())
    usar_cov = nfit >= p.min_mun_cov
    X, cols, kinds, stats = _design(m, usar_cov, cov_cols)
    unit = 1.0 / p.s_mun ** 2
    pen = np.array([{"int": p.k_int, "cov": p.k_cov, "reg": p.k_reg, "uf": p.k_uf}[k] * unit for k in kinds])
    w = np.where(fit, 1.0 / var_obs, 0.0)
    if nfit > 0:
        beta, Ainv, _ = _ridge(X[fit], d[fit], w[fit], pen)
        r_fit = d[fit] - X[fit] @ beta
        p_eff = float(np.trace(Ainv @ ((X[fit].T * w[fit]) @ X[fit])))
        phi = float(np.sum(w[fit] * r_fit ** 2) / max(nfit - p_eff, 1.0)) if nfit > p_eff + 5 else 1.0
        phi = float(np.clip(phi, 0.5, 4.0))
    else:
        beta = np.zeros(X.shape[1])
        Ainv = np.diag(1.0 / pen)
        phi = 1.0
    cov_beta = phi * Ainv
    xb = X @ beta
    resid = np.where(n_ab > 0, d - xb, 0.0)
    # BLUP: confiabilidade do resíduo próprio do município
    rel = np.where(n_ab > 0, (s_mun ** 2) / var_obs, 0.0)
    lp_rest = lp0 + xb + rel * resid
    p_rest = inv_logit(lp_rest)

    # ---------- comparecimento e válidos ----------
    t1 = m["t_1t"].to_numpy(float)
    v1 = m["v_1t"].to_numpy(float)
    has = est > 0
    with np.errstate(divide="ignore", invalid="ignore"):
        yt = np.where(has & (comp > 0) & (t1 > 0), np.log((comp / np.maximum(est, 1)) / np.maximum(t1, 1e-6)), 0.0)
        yv = np.where(has & (comp > 0) & (v1 > 0), np.log((vv / np.maximum(comp, 1)) / np.maximum(v1, 1e-6)), 0.0)
    Xt, _, kt, _ = _design(m, False, [])
    unit_t = 1.0 / p.s_t ** 2
    pen_t = np.array([{"int": 0.5, "reg": p.k_t_reg, "uf": p.k_t_uf}[k] * unit_t for k in kt])
    var_t = p.s_t ** 2 + 1.0 / np.maximum(est, 1.0)
    wt = np.where(has & (comp > 0), 1.0 / var_t, 0.0)
    if wt.sum() > 0:
        bt, _, _ = _ridge(Xt[wt > 0], yt[wt > 0], wt[wt > 0], pen_t)
        bv, _, _ = _ridge(Xt[wt > 0], yv[wt > 0], wt[wt > 0], pen_t)
    else:
        bt = np.zeros(Xt.shape[1])
        bv = np.zeros(Xt.shape[1])
    rel_t = np.where(wt > 0, p.s_t ** 2 / var_t, 0.0)
    lt = Xt @ bt + rel_t * (yt - Xt @ bt)
    lv = Xt @ bv + rel_t * (yv - Xt @ bv)
    t_rest = np.clip(t1 * np.exp(lt), 0.05, 1.0)
    v_rest = np.clip(v1 * np.exp(lv), 0.3, 1.0)
    rest_el = np.maximum(te - est, 0)
    R = rest_el * t_rest * v_rest

    a_proj = a + R * p_rest
    b_proj = b + R * (1 - p_rest)

    # ---------- Monte Carlo ----------
    uf_codes = sorted(m["uf"].unique())
    uf_idx = pd.Categorical(m["uf"], categories=uf_codes).codes
    reg_idx = pd.Categorical(m["regiao"], categories=REGIOES).codes
    U = len(uf_codes)
    live = R > 0.5
    sims = {"a_uf": np.zeros((U, p.n_sim)), "b_uf": np.zeros((U, p.n_sim))}
    base_a_uf = np.bincount(uf_idx, weights=a, minlength=U)
    base_b_uf = np.bincount(uf_idx, weights=b, minlength=U)
    # progresso por nível (fração do eleitorado apurado)
    f_nat = est.sum() / max(te.sum(), 1)
    f_reg = np.array([est[reg_idx == i].sum() / max(te[reg_idx == i].sum(), 1) for i in range(len(REGIOES))])
    f_uf = np.array([est[uf_idx == i].sum() / max(te[uf_idx == i].sum(), 1) for i in range(U)])
    sig_nat = p.sig_nat_min + p.sig_nat0 * (1 - f_nat)
    sig_reg = p.sig_reg_min + p.sig_reg0 * (1 - f_reg)
    sig_uf = p.sig_uf_min * (1 + (1 - f_uf))
    if live.any():
        Xl = X[live]
        lp0l, rell, residl = lp0[live], rel[live], resid[live]
        Rl = R[live]
        ufl, regl = uf_idx[live], reg_idx[live]
        cond_sd = s_mun[live] * np.sqrt(np.clip(1 - rell, 0, 1))
        try:
            Lc = np.linalg.cholesky(cov_beta + 1e-12 * np.eye(len(beta)))
        except np.linalg.LinAlgError:
            ev, evec = np.linalg.eigh(cov_beta)
            Lc = evec @ np.diag(np.sqrt(np.clip(ev, 0, None)))
        Ul = np.zeros((live.sum(), U))
        Ul[np.arange(live.sum()), ufl] = 1.0
        k = p.kappa
        for s0 in range(0, p.n_sim, p.chunk):
            n = min(p.chunk, p.n_sim - s0)
            bs = beta[:, None] + k * (Lc @ rng.standard_normal((len(beta), n)))
            eta = (k * sig_nat * _t(rng, p.df_t, (1, n))
                   + k * sig_reg[regl][:, None] * _t(rng, p.df_t, (len(REGIOES), n))[regl]
                   + k * sig_uf[ufl][:, None] * rng.standard_normal((U, n))[ufl])
            eps = k * cond_sd[:, None] * rng.standard_normal((len(Rl), n))
            lps = lp0l[:, None] + Xl @ bs + (rell * residl)[:, None] + eta + eps
            ps = inv_logit(lps)
            tf = np.exp(k * p.sig_t_nat * rng.standard_normal((1, n)) + k * p.sig_t_uf * rng.standard_normal((U, n))[ufl])
            Rs = Rl[:, None] * tf
            sims["a_uf"][:, s0:s0 + n] = Ul.T @ (Rs * ps)
            sims["b_uf"][:, s0:s0 + n] = Ul.T @ (Rs * (1 - ps))
    sims["a_uf"] += base_a_uf[:, None]
    sims["b_uf"] += base_b_uf[:, None]

    modelo = {
        "n_municipios_ajuste": nfit,
        "usou_covariaveis": usar_cov,
        "phi": phi,
        "coef": {c: float(bv_) for c, bv_ in zip(cols, beta) if not c.startswith("uf_")},
        "coef_uf": {c[3:]: float(bv_) for c, bv_ in zip(cols, beta) if c.startswith("uf_")},
        "sig_nat": float(sig_nat),
    }
    return {
        "p_rest": p_rest, "R": R, "a_proj": a_proj, "b_proj": b_proj, "resid": resid, "d": d,
        "uf_codes": uf_codes, "uf_idx": uf_idx, "reg_idx": reg_idx, "sims": sims, "modelo": modelo,
        "t_rest": t_rest, "v_rest": v_rest,
    }


def resumo_sims(a_s: np.ndarray, b_s: np.ndarray) -> dict:
    """a_s, b_s: votos simulados (vetor N). Retorna mediana, IC95 e probabilidade (escala 0-100 / 0-1)."""
    tot = a_s + b_s
    with np.errstate(divide="ignore", invalid="ignore"):
        pa = np.where(tot > 0, 100 * a_s / tot, 50.0)
    lo, med, hi = np.percentile(pa, [2.5, 50, 97.5])
    prob_a = float(np.mean(a_s > b_s) + 0.5 * np.mean(a_s == b_s))
    return {"pct_a": float(med), "ic_a": [float(lo), float(hi)], "prob_a": prob_a}


def p1_regional(m: pd.DataFrame, R: np.ndarray, min_pct: float = 5.0) -> dict:
    """P1: mantém o % atual de cada região e completa os votos que faltam. Retorna votos por região."""
    out = {}
    for r in REGIOES:
        sel = (m["regiao"] == r).to_numpy()
        if not sel.any():
            continue
        a, b = m.loc[sel, "a"].sum(), m.loc[sel, "b"].sum()
        te, est = m.loc[sel, "te"].sum(), m.loc[sel, "est"].sum()
        pct_ap = 100 * est / te if te else 0
        if pct_ap >= min_pct and a + b > 0:
            share = a / (a + b)
        else:
            a1, b1 = m.loc[sel, "a1"].sum(), m.loc[sel, "b1"].sum()
            share = a1 / (a1 + b1) if a1 + b1 else 0.5
        Rr = R[sel].sum()
        out[r] = {"a": a + Rr * share, "b": b + Rr * (1 - share), "share": share}
    return out
