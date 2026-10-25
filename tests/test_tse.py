import json
from pathlib import Path

import pytest

from apuracao.tse import parse, urls

RAW = Path(__file__).resolve().parents[1] / "data" / "raw" / "6257" / "latest"


def test_urls_zeros_e_minusculas():
    assert urls.resultado("6258", "1", "SP", "1007").endswith("/6258/dados/sp/sp01007-c0001-e006258-u.json")
    assert urls.resultado("6258", "1", "zz", "29539").endswith("/dados/zz/zz29539-c0001-e006258-u.json")
    assert urls.resultado("6258", "1").endswith("/dados/br/br-c0001-e006258-u.json")
    assert urls.ab("6258", "BA").endswith("/dados/ba/ba-e006258-ab.json")
    assert urls.config_mun("6257").endswith("/6257/config/mun-e006257-cm.json")


def test_numeros_ptbr():
    assert parse._f("47,03") == pytest.approx(47.03)
    assert parse._i("56104503") == 56104503
    assert parse._i("") == 0


@pytest.mark.skipif(not (RAW / "br-c0001-e006257-u.json").exists(), reason="base 6257 não baixada")
def test_parser_br_1turno_oficial():
    r = parse.resultado(json.loads((RAW / "br-c0001-e006257-u.json").read_bytes()))
    assert r.votos["13"] == 53879538 and r.votos["22"] == 56104503
    assert r.validos == 119300788 and r.eleitorado == 158745502
    assert r.andamento == "f" and r.secoes_tot == r.secoes_total
    assert r.situacao["13"] == "2º turno"


@pytest.mark.skipif(not (RAW / "mun-e006257-cm.json").exists(), reason="EA12 não baixado")
def test_parser_ea12():
    ms = parse.municipios(json.loads((RAW / "mun-e006257-cm.json").read_bytes()))
    assert len(ms) > 5700
    assert all(len(m.cd_tse) == 5 for m in ms)
    assert any(m.uf == "zz" for m in ms)
    assert sum(m.capital for m in ms) >= 27
