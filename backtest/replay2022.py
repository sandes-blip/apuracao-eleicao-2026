"""Gera os arquivos do Replay 2022 (data/public/replay/2022/) a partir do backtest real (b2022.py):
ordem de chegada real das seções (seed 0) ou perturbada (seed>0), modelo com os parâmetros calibrados.
Contrato: docs/contrato-json.md (seção replay). Usa config/eleicao2022.yaml via ELEICAO_CONFIG."""
from __future__ import annotations

import json
import os
import sys
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRT = timezone(timedelta(hours=-3))
T0 = datetime(2022, 10, 30, 17, 0, 0, tzinfo=BRT)


def _escrever(pth: Path, obj) -> None:
    pth.parent.mkdir(parents=True, exist_ok=True)
    tmp = pth.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(pth)


def momentos(t_ord, passo=3.0):
    """Minutos após 17h: a cada `passo` min até 99,5% das seções, depois alguns pontos até o fim."""
    import numpy as np
    t99 = float(np.quantile(t_ord, 0.995))
    out = list(np.arange(passo, t99 + passo, passo)) + [t99 + 15, t99 + 45, float(t_ord.max())]
    return sorted(set(round(x, 2) for x in out if x <= t_ord.max())) + ([float(t_ord.max())] if t_ord.max() not in out else [])


def gerar(seed: int = 0, passo: float = 3.0, params=None) -> Path:
    os.environ["ELEICAO_CONFIG"] = str(ROOT / "config" / "eleicao2022.yaml")
    from apuracao.config import settings
    settings.cache_clear()
    import numpy as np
    from apuracao.engine.agregar import AVISO, calcular, municipios_compacto
    from apuracao.engine.state import Estado
    from backtest.b2022 import Ordem, carregar_calibrados, dados, estado

    s = settings()
    assert s.cand_a == "13" and s.cfg["covariaveis_1t"] == ["12", "15"], "ELEICAO_CONFIG não aplicado"
    params = params or replace(carregar_calibrados(), n_sim=5000)
    m0, sec, final = dados()
    o = Ordem(sec, seed)
    t_sorted = o.t[o.ordem]
    out_dir = s.public_dir / "replay" / "2022"
    cands = [{"n": c["n"], "nome": c["nome"], "partido": c["partido"], "cor": c["cor"],
              "foto": f"/data/fotos/{c['n']}.jpeg"} for c in s.candidatos]
    idx = {"eleicao": "2022", "titulo": "2º turno 2022 (simulação: ordem real de chegada dos boletins)",
           "seed": seed, "resultado_final": {"13": round(final["pct_a"], 2), "22": round(100 - final["pct_a"], 2)},
           "momentos": []}
    ultimo_k = -1
    for tau in momentos(t_sorted, passo):
        k = int(np.searchsorted(t_sorted, tau, side="right"))
        if k == ultimo_k or k == 0:
            continue
        ultimo_k = k
        m = estado(m0, o, k)
        now = T0 + timedelta(minutes=float(tau))
        calc = calcular(Estado(m=m, br=None, ufs={}, ab_br=[]), params, now=now)
        fim = k >= o.N
        br = {"gerado_em": calc["gerado_em"], "eleicao": "2022", "titulo": s.cfg["titulo"],
              "status": "final" if fim else "ao_vivo", "atualizado_tse": now.strftime("%d/%m/%Y %H:%M:%S"),
              "candidatos": cands, "apuracao": calc["apuracao"], "projecao": calc["projecao"],
              "regioes": calc["regioes"], "ufs": calc["ufs"], "ia": None, "eventos_recentes": [], "aviso": AVISO}
        mid = now.strftime("%Y%m%dT%H%M%S")
        _escrever(out_dir / f"{mid}.json", {"br": br, "municipios": municipios_compacto(calc["municipios"], calc["gerado_em"])})
        idx["momentos"].append({"id": mid, "momento": calc["gerado_em"], "pct_secoes": calc["apuracao"]["pct_secoes"]})
        p2 = calc["projecao"]["p2"]
        print(f"{mid} {calc['apuracao']['pct_secoes']:6.2f}% P0={calc['apuracao']['pct']['13']} "
              f"P2={p2['pct']['13']} {p2['ic95']['13']} prob={p2['prob']['13']}", flush=True)
    _escrever(out_dir / "index.json", idx)
    return out_dir


if __name__ == "__main__":
    gerar(int(sys.argv[1]) if len(sys.argv) > 1 else 0)
