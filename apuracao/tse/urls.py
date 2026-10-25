"""Montagem de URLs do TSE. Municípios só a partir do EA12 (nunca 'no chute')."""
from __future__ import annotations

from apuracao.config import settings


def _base(ele: str) -> str:
    s = settings()
    return f"{s.tse_base}/{s.ambiente}/{s.ciclo}/{ele}"


def cargo4(cargo: str) -> str:
    return f"c{int(cargo):04d}"


def ele6(ele: str) -> str:
    return f"e{int(ele):06d}"


def config_ele() -> str:
    s = settings()
    return f"{s.tse_base}/{s.ambiente}/comum/config/ele-c.json"


def config_mun(ele: str) -> str:
    return f"{_base(ele)}/config/mun-{ele6(ele)}-cm.json"


def ab(ele: str, uf: str = "br") -> str:
    uf = uf.lower()
    return f"{_base(ele)}/dados/{uf}/{uf}-{ele6(ele)}-ab.json"


def resultado(ele: str, cargo: str, uf: str = "br", cdmun: str | None = None) -> str:
    uf = uf.lower()
    alvo = uf if cdmun is None else f"{uf}{str(cdmun).zfill(5)}"
    return f"{_base(ele)}/dados/{uf}/{alvo}-{cargo4(cargo)}-{ele6(ele)}-u.json"


def foto(ele: str, sqcand: str, uf: str = "br") -> str:
    return f"{_base(ele)}/fotos/{uf.lower()}/{sqcand}.jpeg"


def chave(url: str) -> str:
    """Nome curto do arquivo (usado como chave de armazenamento)."""
    return url.rsplit("/", 1)[-1].removesuffix(".json")
