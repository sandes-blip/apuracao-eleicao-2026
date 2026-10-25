#!/usr/bin/env bash
# Gera dist/apuracao-2026.tar.gz pronto para copiar para a VPS (sem .env, sem dados de teste locais).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
tar czf dist/apuracao-2026.tar.gz \
  --exclude='.venv' --exclude='web/node_modules' --exclude='web/dist' --exclude='__pycache__' --exclude='*.pyc' \
  --exclude='.env' --exclude='dist' --exclude='data/backtest2022' --exclude='web/mock-data' \
  apuracao backtest config docs infra tests web requirements.txt docker-compose.yml .env.example .dockerignore .gitignore \
  briefing-portal-apuracao-2026.md \
  data/base data/public/geo data/public/fotos $( [ -d data/public/replay/2022 ] && echo data/public/replay/2022 )

ls -lh dist/apuracao-2026.tar.gz
