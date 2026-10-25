from pathlib import Path

import numpy as np
import pytest

from apuracao.engine.modelo import Params, inv_logit, logit, p1_regional, projetar, resumo_sims

BASE = Path(__file__).resolve().parents[1] / "data" / "base" / "base_1turno.parquet"
pytestmark = pytest.mark.skipif(not BASE.exists(), reason="base do 1º turno não carregada")


def _cenario(frac):
    from backtest.sintetico import preparar_base, carregar_base, revelar, verdade
    from apuracao.config import settings
    s = settings()
    b = preparar_base(carregar_base(), s.cand_a, s.cand_b, s.cfg["covariaveis_1t"])
    b["p0"] = b["p0"].fillna(0.5)
    for c in ["t_1t", "v_1t"]:
        b[c] = b[c].fillna(b[c].mean())
    b["lp0"] = logit(b["p0"].to_numpy())
    tr = verdade(b, np.random.default_rng(1))
    return revelar(tr, frac)


def test_logit_inverso():
    p = np.array([0.01, 0.3, 0.5, 0.9])
    assert np.allclose(inv_logit(logit(p)), p)


def test_100_apurado_projecao_igual_placar():
    m = _cenario(10.0)  # tudo apurado
    assert (m["est"] == m["te"]).all()
    pr = projetar(m, Params(n_sim=200), ["70", "14", "55"])
    a, b = m["a"].sum(), m["b"].sum()
    assert pr["R"].sum() == pytest.approx(0, abs=1e-6)
    rs = resumo_sims(pr["sims"]["a_uf"].sum(0), pr["sims"]["b_uf"].sum(0))
    assert rs["pct_a"] == pytest.approx(100 * a / (a + b), abs=1e-9)
    assert rs["ic_a"][1] - rs["ic_a"][0] == pytest.approx(0, abs=1e-9)
    p1 = p1_regional(m, pr["R"])
    assert sum(v["a"] for v in p1.values()) == pytest.approx(a)


def test_intervalo_estreita_com_apuracao():
    larg = []
    for f in (0.2, 0.5, 0.8):
        m = _cenario(f)
        pr = projetar(m, Params(n_sim=500), ["70", "14", "55"])
        rs = resumo_sims(pr["sims"]["a_uf"].sum(0), pr["sims"]["b_uf"].sum(0))
        larg.append(rs["ic_a"][1] - rs["ic_a"][0])
    assert larg[0] > larg[1] > larg[2]
