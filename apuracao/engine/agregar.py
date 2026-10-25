"""Transforma estado + projeção nos objetos do contrato (docs/contrato-json.md)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from apuracao.config import settings
from apuracao.engine.modelo import REGIOES, p1_regional, projetar, resumo_sims, Params
from apuracao.engine.state import Estado

BRT = timezone(timedelta(hours=-3))
NOMES_REGIAO = {"N": "Norte", "NE": "Nordeste", "CO": "Centro-Oeste", "SE": "Sudeste", "S": "Sul", "EXT": "Exterior"}
NOMES_UF = {
    "ac": "Acre", "al": "Alagoas", "am": "Amazonas", "ap": "Amapá", "ba": "Bahia", "ce": "Ceará", "df": "Distrito Federal",
    "es": "Espírito Santo", "go": "Goiás", "ma": "Maranhão", "mg": "Minas Gerais", "ms": "Mato Grosso do Sul",
    "mt": "Mato Grosso", "pa": "Pará", "pb": "Paraíba", "pe": "Pernambuco", "pi": "Piauí", "pr": "Paraná",
    "rj": "Rio de Janeiro", "rn": "Rio Grande do Norte", "ro": "Rondônia", "rr": "Roraima", "rs": "Rio Grande do Sul",
    "sc": "Santa Catarina", "se": "Sergipe", "sp": "São Paulo", "to": "Tocantins", "zz": "Exterior",
}
AVISO = "Projeção estatística independente. Não é resultado oficial. Resultado oficial: TSE."


def agora_iso(now: datetime | None = None) -> str:
    return (now or datetime.now(BRT)).astimezone(BRT).isoformat(timespec="seconds")


def r1(x, nd=2):
    if x is None:
        return None
    try:
        if np.isnan(x):
            return None
    except TypeError:
        pass
    return round(float(x), nd)


def _pct(a, b):
    t = a + b
    return (100 * a / t, 100 * b / t) if t > 0 else (None, None)


def _par(x_a, x_b, A, B, nd=2):
    return {A: r1(x_a, nd), B: r1(x_b, nd)}


def bloco_area(sel: np.ndarray, m: pd.DataFrame, proj: dict, codigo: str, nome: str, regiao: str,
               sims_a: np.ndarray | None, sims_b: np.ndarray | None, p1_share: float | None) -> dict:
    s = settings()
    A, B = s.cand_a, s.cand_b
    sub = m[sel]
    a, b = sub["a"].sum(), sub["b"].sum()
    te, est = sub["te"].sum(), sub["est"].sum()
    st, ts = sub["st"].sum(), sub["ts"].sum()
    pa, pb = _pct(a, b)
    a1, b1, v1 = sub["a1"].sum(), sub["b1"].sum(), sub["validos_1t"].sum()
    # share do 1º turno nos mesmos municípios, ponderado pelo que já foi apurado (para o swing)
    nab = (sub["a"] + sub["b"]).to_numpy(float)
    p0 = sub["p0"].to_numpy(float)
    swing = None
    if nab.sum() > 0:
        swing = (a / (a + b) - np.average(p0, weights=nab)) * 100
    R = proj["R"][sel]
    pr = proj["p_rest"][sel]
    restantes = float(R.sum())
    saldo = float((R * (2 * pr - 1)).sum())
    comp, comp1 = sub["comp"].sum(), sub["comparecimento"].sum()
    el1 = sub["eleitorado"].sum()
    out = {
        "codigo": codigo, "nome": nome, "regiao": regiao,
        "pct_secoes": r1(100 * st / ts if ts else (100 * est / te if te else 0)),
        "eleitorado": int(te), "eleitorado_apurado": int(est),
        "votos": {A: int(a), B: int(b)}, "pct": _par(pa, pb, A, B),
        "pct_1t": _par(100 * a1 / v1 if v1 else None, 100 * b1 / v1 if v1 else None, A, B),
        "share2_1t": _par(*(_pct(a1, b1)), A, B),
        "swing_pp": r1(swing),
        "pct_comparecimento": r1(100 * comp / est if est else None),
        "pct_comparecimento_1t": r1(100 * comp1 / el1 if el1 else None),
        "validos_restantes": int(round(restantes)), "saldo_esperado": int(round(saldo)),
        "status": "nao_iniciada" if est == 0 else ("concluida" if est >= te and (sub["andamento"] == "f").all() else "parcial"),
    }
    if sims_a is not None:
        rs = resumo_sims(sims_a, sims_b)
        out["proj"] = {"pct": _par(rs["pct_a"], 100 - rs["pct_a"], A, B),
                       "ic95": {A: [r1(rs["ic_a"][0]), r1(rs["ic_a"][1])], B: [r1(100 - rs["ic_a"][1]), r1(100 - rs["ic_a"][0])]},
                       "prob": {A: r1(rs["prob_a"], 4), B: r1(1 - rs["prob_a"], 4)}}
    if p1_share is not None:
        out["proj_p1"] = _par(100 * p1_share, 100 - 100 * p1_share, A, B)
    return out


def calcular(est: Estado, params: Params | None = None, now: datetime | None = None) -> dict:
    """Roda o modelo e devolve todos os objetos publicáveis."""
    s = settings()
    A, B = s.cand_a, s.cand_b
    m = est.m
    proj = projetar(m, params, s.cfg.get("covariaveis_1t", []))
    sims = proj["sims"]
    uf_codes = proj["uf_codes"]
    reg_of_uf = {uf: s.uf_regiao.get(uf, "EXT") for uf in uf_codes}

    # ---- P0 oficial (arquivo Brasil; se ausente, soma dos municípios)
    brf = est.br
    a_tot, b_tot = m["a"].sum(), m["b"].sum()
    if brf and (brf.votos.get(A, 0) + brf.votos.get(B, 0)) > 0:
        va, vb = brf.votos.get(A, 0), brf.votos.get(B, 0)
        pct_sec = brf.pct_secoes
        el, el_ap, comp, abst = brf.eleitorado, brf.eleitorado_apurado, brf.comparecimento, brf.abstencao
        validos, brancos, nulos = brf.validos, brf.brancos, brf.nulos
        st_tot, ts_tot = brf.secoes_tot, brf.secoes_total
    else:
        va, vb = int(a_tot), int(b_tot)
        st_tot, ts_tot = int(m["st"].sum()), int(m["ts"].sum()) or (brf.secoes_total if brf else 0)
        pct_sec = 100 * st_tot / ts_tot if ts_tot else 0.0
        el, el_ap = int(m["te"].sum()), int(m["est"].sum())
        comp, abst = int(m["comp"].sum()), int(m["abst"].sum())
        validos, brancos, nulos = int(m["vv"].sum()), int(m["vbr"].sum()), int(m["vnu"].sum())
    pa, pb = _pct(va, vb)
    eleito = None
    definido = False
    if brf:
        for n in (A, B):
            if brf.eleito.get(n) and brf.situacao.get(n, "").lower().startswith("eleito"):
                eleito, definido = n, True
    v1 = m["validos_1t"].sum()
    apuracao = {
        "pct_secoes": r1(pct_sec), "secoes_tot": int(st_tot), "secoes_total": int(ts_tot),
        "eleitorado": int(el), "eleitorado_apurado": int(el_ap),
        "comparecimento": int(comp), "abstencao": int(abst),
        "pct_comparecimento": r1(100 * comp / el_ap if el_ap else None),
        "pct_comparecimento_1t": r1(100 * m["comparecimento"].sum() / m["eleitorado"].sum() if m["eleitorado"].sum() else None),
        "validos": int(validos), "brancos": int(brancos), "nulos": int(nulos),
        "votos": {A: int(va), B: int(vb)}, "pct": _par(pa, pb, A, B),
        "pct_1t": _par(100 * m["a1"].sum() / v1 if v1 else None, 100 * m["b1"].sum() / v1 if v1 else None, A, B),
        "dif_votos": int(va - vb), "dif_pp": r1(pa - pb) if pa is not None else None,
        "lider": (A if va > vb else B if vb > va else None) if va + vb > 0 else None,
        "eleito": eleito, "definido_tse": definido,
    }

    # ---- P1
    p1 = p1_regional(m, proj["R"])
    p1a, p1b = sum(v["a"] for v in p1.values()), sum(v["b"] for v in p1.values())
    p1_pct = 100 * p1a / (p1a + p1b) if p1a + p1b else None

    # ---- P2 nacional
    na, nb = sims["a_uf"].sum(0), sims["b_uf"].sum(0)
    rs = resumo_sims(na, nb)
    a_proj, b_proj = proj["a_proj"].sum(), proj["b_proj"].sum()
    R_tot = float(proj["R"].sum())
    saldo_tot = float((proj["R"] * (2 * proj["p_rest"] - 1)).sum())
    eleitores_rest = max(int(el) - int(el_ap), 0)

    # ---- confiança
    n_ufs_dados = int((m.groupby("uf")["est"].sum() > 0).sum())
    q = np.where(m["te"] > 0, m["est"] / m["te"].clip(lower=1), 0)
    regs_50 = set(m.loc[q >= 0.5, "regiao"]) - {"EXT"}
    motivo = None
    if pct_sec < 5:
        motivo = "Menos de 5% das seções apuradas"
    elif n_ufs_dados < 15:
        motivo = f"Apenas {n_ufs_dados} UFs com dados (mínimo 15)"
    elif len(regs_50) < 3:
        motivo = "Ainda não há municípios com mais da metade apurada em pelo menos 3 regiões"
    largura = rs["ic_a"][1] - rs["ic_a"][0]
    lider_p2 = A if rs["pct_a"] > 50 else B
    lider_p1 = (A if p1_pct > 50 else B) if p1_pct is not None else None
    diverg = lider_p1 is not None and lider_p1 != lider_p2 and R_tot > 0
    if motivo:
        conf = "insuficiente"
    elif largura > 4 or diverg:
        conf = "baixa"
    elif largura > 2:
        conf = "media"
    else:
        conf = "alta"
    prob_lider = max(rs["prob_a"], 1 - rs["prob_a"])
    consolidada = (conf == "alta" and prob_lider >= 0.99 and pct_sec >= 70 and not diverg)

    lead = va - vb
    virada = None
    if R_tot > 0 and lead != 0:
        atras = B if lead > 0 else A
        need = 100 * (1 + abs(lead) / R_tot) / 2
        share_rest_a = (a_proj - va) / R_tot if R_tot else 0.5
        proj_atras = 100 * (share_rest_a if atras == A else 1 - share_rest_a)
        virada = {"atras": atras, "pct_necessario": r1(min(need, 999)), "pct_projetado": r1(proj_atras)}
    ponto = None
    if R_tot > 0 and lead != 0 and np.sign(lead) != np.sign(lead + saldo_tot) and saldo_tot != 0:
        f = lead / (-saldo_tot)
        if 0 < f < 1:
            ponto = r1(pct_sec + f * (100 - pct_sec), 1)

    projecao = {
        "disponivel": motivo is None, "motivo": motivo, "confianca": conf, "tendencia_consolidada": bool(consolidada),
        "p1": {"pct": _par(p1_pct, 100 - p1_pct if p1_pct is not None else None, A, B)},
        "p2": {"pct": _par(rs["pct_a"], 100 - rs["pct_a"], A, B),
               "ic95": {A: [r1(rs["ic_a"][0]), r1(rs["ic_a"][1])], B: [r1(100 - rs["ic_a"][1]), r1(100 - rs["ic_a"][0])]},
               "prob": {A: r1(rs["prob_a"], 4), B: r1(1 - rs["prob_a"], 4)},
               "votos": {A: int(round(a_proj)), B: int(round(b_proj))},
               "validos_total": int(round(a_proj + b_proj))},
        "validos_restantes": int(round(R_tot)), "eleitores_restantes": eleitores_rest,
        "saldo_esperado": int(round(saldo_tot)),
        "vantagem_supera_restantes": bool(va + vb > 0 and abs(lead) > eleitores_rest),
        "virada": virada, "ponto_virada_pct_secoes": ponto, "divergencia_p1_p2": bool(diverg),
        "modelo": {"n_municipios_ajuste": proj["modelo"]["n_municipios_ajuste"],
                   "swing_nacional_pp": None, "versao": "p2-ridge-hier-1",
                   "usou_covariaveis": proj["modelo"]["usou_covariaveis"],
                   "coeficientes": {k: r1(v, 4) for k, v in proj["modelo"]["coef"].items()}},
    }

    # ---- regiões e UFs
    regioes = []
    for r in REGIOES:
        sel = (m["regiao"] == r).to_numpy()
        if not sel.any():
            continue
        idx = [i for i, uf in enumerate(uf_codes) if reg_of_uf[uf] == r]
        regioes.append(bloco_area(sel, m, proj, r, NOMES_REGIAO[r], r,
                                  sims["a_uf"][idx].sum(0), sims["b_uf"][idx].sum(0), p1.get(r, {}).get("share")))
    ufs = []
    for i, uf in enumerate(uf_codes):
        sel = (m["uf"] == uf).to_numpy()
        ufs.append(bloco_area(sel, m, proj, uf, NOMES_UF.get(uf, uf.upper()), reg_of_uf[uf],
                              sims["a_uf"][i], sims["b_uf"][i], None))
    # swing nacional
    nab = (m["a"] + m["b"]).to_numpy(float)
    if nab.sum() > 0:
        projecao["modelo"]["swing_nacional_pp"] = r1((a_tot / (a_tot + b_tot) - np.average(m["p0"], weights=nab)) * 100)

    # ---- municípios
    tot_proj = proj["a_proj"] + proj["b_proj"]
    with np.errstate(divide="ignore", invalid="ignore"):
        proj_a = np.where(tot_proj > 0, 100 * proj["a_proj"] / tot_proj, np.nan)
        pct_a = np.where(nab > 0, 100 * m["a"] / nab, np.nan)
        sh1 = 100 * m["p0"].to_numpy()
        comp_pct = np.where(m["est"] > 0, 100 * m["comp"] / m["est"].clip(lower=1), np.nan)
        comp1 = np.where(m["eleitorado"] > 0, 100 * m["comparecimento"] / m["eleitorado"].clip(lower=1), np.nan)
        pct_sec_m = np.where(m["ts"] > 0, 100 * m["st"] / m["ts"].clip(lower=1),
                             np.where(m["te"] > 0, 100 * m["est"] / m["te"].clip(lower=1), 0))
    status_m = np.where(m["est"] <= 0, "nao_iniciada", np.where(m["andamento"] == "f", "concluida", "parcial"))
    muns = pd.DataFrame({
        "cd": m["cd_tse"], "ibge": m["cd_ibge"].astype(str).str.replace(r"\.0$", "", regex=True), "uf": m["uf"],
        "nome": m["nome"], "capital": m["capital"].astype(bool), "porte": m["porte"], "eleitorado": m["te"].astype(int),
        "pct_secoes": np.round(pct_sec_m, 2), "pct_a": np.round(pct_a, 2), "share2_1t_a": np.round(sh1, 2),
        "swing_pp": np.round(pct_a - sh1, 2), "proj_a": np.round(proj_a, 2),
        "validos_restantes": np.round(proj["R"]).astype(int),
        "pct_comp": np.round(comp_pct, 2), "pct_comp_1t": np.round(comp1, 2), "status": status_m,
        "a": m["a"].astype(int), "b": m["b"].astype(int), "a1": m["a1"].astype(int), "b1": m["b1"].astype(int),
        "v1": m["validos_1t"].astype(int), "resid": np.round(proj["resid"], 4),
    })

    return {
        "gerado_em": agora_iso(now), "apuracao": apuracao, "projecao": projecao, "regioes": regioes, "ufs": ufs,
        "municipios": muns, "proj": proj, "rs": rs, "p1_pct": p1_pct,
        "atualizado_tse": f"{brf.dt} {brf.ht}".strip() if brf else "", "and_br": brf.andamento if brf else "n",
    }


def municipio_json(row) -> dict:
    s = settings()
    A, B = s.cand_a, s.cand_b
    def nn(x):
        return None if x is None or (isinstance(x, float) and np.isnan(x)) else x
    pa = nn(row.pct_a)
    lider = None if pa is None else (A if pa > 50 else B if pa < 50 else None)
    lider1 = A if row.a1 > row.b1 else B if row.b1 > row.a1 else None
    return {
        "cd": row.cd, "ibge": row.ibge, "nome": row.nome, "uf": row.uf, "capital": bool(row.capital), "porte": row.porte,
        "eleitorado": int(row.eleitorado), "pct_secoes": nn(row.pct_secoes),
        "votos": {A: int(row.a), B: int(row.b)},
        "pct": {A: pa, B: None if pa is None else round(100 - pa, 2)},
        "pct_1t": {A: round(100 * row.a1 / row.v1, 2) if row.v1 else None, B: round(100 * row.b1 / row.v1, 2) if row.v1 else None},
        "share2_1t": {A: nn(row.share2_1t_a), B: None if nn(row.share2_1t_a) is None else round(100 - row.share2_1t_a, 2)},
        "swing_pp": nn(row.swing_pp),
        "proj_pct": {A: nn(row.proj_a), B: None if nn(row.proj_a) is None else round(100 - row.proj_a, 2)},
        "validos_restantes": int(row.validos_restantes),
        "pct_comparecimento": nn(row.pct_comp), "pct_comparecimento_1t": nn(row.pct_comp_1t),
        "status": row.status, "lider_1t": lider1, "lider": lider,
        "virou_vs_1t": bool(lider is not None and lider1 is not None and lider != lider1),
    }


CAMPOS_MUN = ["cd", "ibge", "uf", "nome", "capital", "porte", "eleitorado", "pct_secoes", "pct_a", "share2_1t_a",
              "swing_pp", "proj_a", "validos_restantes", "pct_comp", "pct_comp_1t", "status"]


def municipios_compacto(muns: pd.DataFrame, gerado_em: str) -> dict:
    sub = muns[CAMPOS_MUN].astype(object).where(pd.notna(muns[CAMPOS_MUN]), None)
    dados = []
    for row in sub.itertuples(index=False):
        dados.append([(x.item() if hasattr(x, "item") else x) for x in row])
    return {"gerado_em": gerado_em, "campos": CAMPOS_MUN, "dados": dados}
