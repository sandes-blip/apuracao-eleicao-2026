"""Configuração central: .env + config/eleicao.yaml. Nada de código de eleição fixo no código."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    tse_base: str
    ambiente: str
    ciclo: str
    eleicao_base: str
    eleicao_alvo: str
    cargo: str
    data_dir: Path
    rps: float
    poll_s: float
    anthropic_model: str
    ia_intervalo_s: int
    database_url: str | None
    cfg: dict = field(repr=False)

    @property
    def candidatos(self) -> list[dict]:
        return self.cfg["candidatos"]

    @property
    def cand_a(self) -> str:
        return self.cfg["candidatos"][0]["n"]

    @property
    def cand_b(self) -> str:
        return self.cfg["candidatos"][1]["n"]

    @property
    def uf_regiao(self) -> dict[str, str]:
        return {uf: r for r, ufs in self.cfg["regioes"].items() for uf in ufs}

    @property
    def raw_dir(self) -> Path:
        return self.data_dir / "raw"

    @property
    def public_dir(self) -> Path:
        return self.data_dir / "public"

    @property
    def base_dir(self) -> Path:
        return self.data_dir / "base"


@lru_cache
def settings() -> Settings:
    cfg_path = Path(os.getenv("ELEICAO_CONFIG", ROOT / "config" / "eleicao.yaml"))
    cfg = yaml.safe_load(cfg_path.read_text(encoding="utf-8"))
    return Settings(
        tse_base=os.getenv("TSE_BASE", "https://resultados.tse.jus.br").rstrip("/"),
        ambiente=os.getenv("TSE_AMBIENTE", "oficial"),
        ciclo=os.getenv("TSE_CICLO", cfg["ciclo"]),
        eleicao_base=os.getenv("ELEICAO_BASE", cfg["eleicao_base"]),
        eleicao_alvo=os.getenv("ELEICAO_ALVO", cfg["eleicao_alvo"]),
        cargo=os.getenv("CARGO", cfg["cargo"]),
        data_dir=Path(os.getenv("DATA_DIR", ROOT / "data")),
        rps=float(os.getenv("TSE_RPS", "15")),  # teto do briefing: 20
        poll_s=float(os.getenv("POLL_S", "20")),
        anthropic_model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5"),
        ia_intervalo_s=int(os.getenv("IA_INTERVALO_S", "600")),
        database_url=os.getenv("DATABASE_URL") or None,
        cfg=cfg,
    )
