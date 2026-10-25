"""Parsers dos arquivos do TSE (campos confirmados nos arquivos reais de 2026, ver docs/tse-campos.md)."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any


def _f(x: Any) -> float:
    if x in (None, ""):
        return 0.0
    if isinstance(x, (int, float)):
        return float(x)
    return float(str(x).replace(",", "."))


def _i(x: Any) -> int:
    if x in (None, ""):
        return 0
    return int(str(x).split(",")[0].split(".")[0])


def load(content: bytes | str) -> dict:
    return json.loads(content)


@dataclass
class Resultado:
    """EA20 de uma abrangência (br, uf ou município)."""
    ele: str
    tpabr: str
    cdabr: str
    idg: str
    dg: str
    hg: str
    dt: str
    ht: str
    andamento: str        # 'f' final, 'p' parcial, 'n' não iniciado
    tf: str               # totalização final ('s'/'n')
    secoes_total: int
    secoes_tot: int
    pct_secoes: float
    eleitorado: int
    eleitorado_apurado: int
    comparecimento: int
    abstencao: int
    validos: int
    brancos: int
    nulos: int
    votos: dict[str, int] = field(default_factory=dict)       # número -> votos
    eleito: dict[str, bool] = field(default_factory=dict)
    situacao: dict[str, str] = field(default_factory=dict)
    sqcand: dict[str, str] = field(default_factory=dict)
    nome: dict[str, str] = field(default_factory=dict)

    @property
    def momento_tse(self) -> str:
        return f"{self.dt} {self.ht}".strip()


def iter_cands(d: dict):
    for carg in d.get("carg", []):
        for agr in carg.get("agr", []):
            for par in agr.get("par", []):
                for c in par.get("cand", []):
                    yield c


def resultado(d: dict) -> Resultado:
    s, e, v = d.get("s", {}), d.get("e", {}), d.get("v", {})
    r = Resultado(
        ele=d.get("ele", ""), tpabr=d.get("tpabr", ""), cdabr=d.get("cdabr", ""),
        idg=d.get("idg", ""), dg=d.get("dg", ""), hg=d.get("hg", ""),
        dt=d.get("dt", ""), ht=d.get("ht", ""),
        andamento=d.get("and", ""), tf=d.get("tf", ""),
        secoes_total=_i(s.get("ts")), secoes_tot=_i(s.get("st")), pct_secoes=_f(s.get("pstn")),
        eleitorado=_i(e.get("te")), eleitorado_apurado=_i(e.get("est")),
        comparecimento=_i(e.get("c")), abstencao=_i(e.get("a")),
        validos=_i(v.get("vv")), brancos=_i(v.get("vb")), nulos=_i(v.get("tvn")),
    )
    for c in iter_cands(d):
        n = str(c.get("n"))
        r.votos[n] = _i(c.get("vap"))
        r.eleito[n] = c.get("e") == "s"
        r.situacao[n] = c.get("st", "")
        r.sqcand[n] = c.get("sqcand", "")
        r.nome[n] = c.get("nmu") or c.get("nm", "")
    return r


@dataclass
class Andamento:
    """Linha de um arquivo de acompanhamento (EA14/EA15)."""
    tpabr: str
    cdabr: str
    dt: str
    ht: str
    andamento: str
    secoes_total: int
    secoes_tot: int
    eleitorado: int
    eleitorado_apurado: int
    mun_nao_recebidos: int = 0
    mun_parciais: int = 0
    mun_finais: int = 0

    @property
    def marca(self) -> str:
        return f"{self.dt} {self.ht}|{self.secoes_tot}|{self.andamento}"


def acompanhamento(d: dict) -> list[Andamento]:
    out = []
    for a in d.get("abr", []):
        s, e = a.get("s", {}), a.get("e", {})
        out.append(Andamento(
            tpabr=a.get("tpabr", ""), cdabr=a.get("cdabr", ""), dt=a.get("dt", ""), ht=a.get("ht", ""),
            andamento=a.get("and", ""),
            secoes_total=_i(s.get("ts")), secoes_tot=_i(s.get("st")),
            eleitorado=_i(e.get("te")), eleitorado_apurado=_i(e.get("est")),
            mun_nao_recebidos=_i(a.get("munnr")), mun_parciais=_i(a.get("munpt")), mun_finais=_i(a.get("munf")),
        ))
    return out


@dataclass
class Municipio:
    cd_tse: str
    cd_ibge: str
    nome: str
    uf: str
    capital: bool
    zonas: list[str]


def municipios(d: dict) -> list[Municipio]:
    out = []
    for abr in d.get("abr", []):
        uf = abr.get("cd", "").lower()
        for m in abr.get("mu", []):
            out.append(Municipio(
                cd_tse=str(m.get("cd")).zfill(5), cd_ibge=str(m.get("cdi", "") or ""),
                nome=m.get("nm", ""), uf=uf, capital=m.get("c") == "s", zonas=list(m.get("z", [])),
            ))
    return out
