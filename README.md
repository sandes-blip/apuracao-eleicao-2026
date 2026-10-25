# Portal de Apuração e Projeção: 2º turno presidencial 2026

Real-time portal for the TSE count with an independent statistical projection and AI-written analysis.
Principle: **the algorithm calculates, the AI explains.**

- Briefing: `briefing-portal-apuracao-2026.md` · Real TSE fields: `docs/tse-campos.md` · JSON contract: `docs/contrato-json.md`
- Differences from the briefing and model improvements: `docs/notas-implementacao.md`
- Deploy: `infra/DEPLOY.md`

## Structure
| Path | What it is |
|---|---|
| `apuracao/tse/` | TSE client (token bucket, ETag, 404 blocklist), URLs built only from EA12, parsers |
| `apuracao/collector/` | Incremental collector EA14 → EA15 → EA20; every raw file saved to `data/raw/` |
| `apuracao/base/carga.py` | Load of the 1st round (6257) → `data/base/base_1turno.parquet` |
| `apuracao/engine/modelo.py` | P1 (regional), P2 (hierarchical ridge regression + correlated Monte Carlo) |
| `apuracao/engine/agregar.py` | Contract objects (BR, regions, UFs, municipalities), confidence, crossing point |
| `apuracao/engine/eventos.py` | Comebacks, outlier UF/municipality, milestones, stalled source |
| `apuracao/engine/ia.py` | Claude (`claude-sonnet-5-5`), number validation, template fallback |
| `apuracao/engine/main.py` | `motor` process: compute → publish `data/public/**` |
| `backtest/` | Synthetic scenario (`sintetico.py`) and 2022 backtest/calibration |
| `web/` | Static portal (Vite + React) |
| `infra/` | Dockerfiles, nginx, packaging script, deploy guide |

## Running locally
```bash
uv venv .venv && uv pip install -p .venv -r requirements.txt pytest
cp .env.example .env                      # fill ANTHROPIC_API_KEY
.venv/bin/python -m apuracao.base.carga   # 1st-round base (~6 min)
.venv/bin/python -m apuracao.collector.main &
.venv/bin/python -m apuracao.engine.main
.venv/bin/python -m pytest -q tests
.venv/bin/python -m backtest.sintetico 3  # error/coverage of the projection in a simulated count
```
Or everything in Docker: `docker compose up -d --build` → http://localhost:8080
