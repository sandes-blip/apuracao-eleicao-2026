"""PostgreSQL (opcional): índice de snapshots brutos, série temporal, análises de IA e eventos.
O sistema funciona sem banco; o disco (store/raw.py) é a fonte primária."""
from __future__ import annotations

import json
import logging
import queue
import threading
import time

from apuracao.config import settings

log = logging.getLogger("db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS snapshot_raw (
  id BIGSERIAL PRIMARY KEY, eleicao TEXT, arquivo TEXT, idg TEXT, data_hora_tse TEXT,
  baixado_em TIMESTAMPTZ DEFAULT now(), payload JSONB, UNIQUE (eleicao, arquivo, idg));
CREATE INDEX IF NOT EXISTS snapshot_raw_arq ON snapshot_raw (eleicao, arquivo, baixado_em);
CREATE TABLE IF NOT EXISTS serie_temporal (
  id BIGSERIAL PRIMARY KEY, momento TIMESTAMPTZ, abrangencia TEXT, pct_secoes REAL,
  pct_a REAL, pct_b REAL, proj_p1_a REAL, proj_p2_a REAL, ic_inf REAL, ic_sup REAL, prob_a REAL, prob_b REAL);
CREATE TABLE IF NOT EXISTS analises_ia (
  id BIGSERIAL PRIMARY KEY, momento TIMESTAMPTZ, entrada_json JSONB, saida_json JSONB,
  modelo TEXT, validacao_ok BOOLEAN, publicada BOOLEAN, erro TEXT);
CREATE TABLE IF NOT EXISTS eventos (
  id BIGSERIAL PRIMARY KEY, momento TIMESTAMPTZ, tipo TEXT, abrangencia TEXT, texto TEXT);
"""

_conn = None
_lock = threading.Lock()
_retry_em = 0.0
_fila: "queue.Queue[tuple[str, tuple]]" = queue.Queue(maxsize=50_000)
_worker = None


def conn():
    """Conexão (somente na thread de escrita). Em falha, espera 60 s antes de tentar de novo."""
    global _conn, _retry_em
    url = settings().database_url
    if not url or time.time() < _retry_em:
        return None
    if _conn is None or _conn.closed:
        try:
            import psycopg
            _conn = psycopg.connect(url, autocommit=True, connect_timeout=3)
            _conn.execute(SCHEMA)
            log.info("PostgreSQL conectado")
        except Exception as e:
            log.warning("PostgreSQL indisponível (seguindo só com disco, nova tentativa em 60 s): %s", str(e).splitlines()[0])
            _conn = None
            _retry_em = time.time() + 60
            return None
    return _conn


def _loop() -> None:
    global _conn
    while True:
        sql, params = _fila.get()
        c = conn()
        if c is None:
            continue  # descarta: o disco continua sendo a fonte da verdade
        try:
            c.execute(sql, params)
        except Exception as e:
            log.warning("erro no banco: %s", str(e).splitlines()[0])
            try:
                c.close()
            except Exception:
                pass
            _conn = None


def execute(sql: str, params: tuple) -> None:
    """Nunca bloqueia o chamador: enfileira para a thread de escrita."""
    global _worker
    if not settings().database_url:
        return
    with _lock:
        if _worker is None:
            _worker = threading.Thread(target=_loop, daemon=True, name="db-writer")
            _worker.start()
    try:
        _fila.put_nowait((sql, params))
    except queue.Full:
        pass


def salvar_snapshot(eleicao: str, arquivo: str, idg: str, dt_tse: str, content: bytes) -> None:
    execute("INSERT INTO snapshot_raw (eleicao, arquivo, idg, data_hora_tse, payload) VALUES (%s,%s,%s,%s,%s::jsonb) "
            "ON CONFLICT DO NOTHING", (eleicao, arquivo, idg, dt_tse, content.decode("utf-8")))


def salvar_serie(momento, abr, d: dict) -> None:
    execute("INSERT INTO serie_temporal (momento, abrangencia, pct_secoes, pct_a, pct_b, proj_p1_a, proj_p2_a, ic_inf, ic_sup, prob_a, prob_b) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (momento, abr, d.get("pct_secoes"), d.get("pct_a"), d.get("pct_b"), d.get("p1_a"), d.get("p2_a"),
             d.get("ic_inf"), d.get("ic_sup"), d.get("prob_a"), d.get("prob_b")))


def salvar_analise(momento, entrada: dict, saida: dict | None, modelo: str, ok: bool, publicada: bool, erro: str | None) -> None:
    execute("INSERT INTO analises_ia (momento, entrada_json, saida_json, modelo, validacao_ok, publicada, erro) "
            "VALUES (%s,%s::jsonb,%s::jsonb,%s,%s,%s,%s)",
            (momento, json.dumps(entrada, ensure_ascii=False), json.dumps(saida, ensure_ascii=False) if saida else None,
             modelo, ok, publicada, erro))


def salvar_evento(momento, tipo: str, abr: str, texto: str) -> None:
    execute("INSERT INTO eventos (momento, tipo, abrangencia, texto) VALUES (%s,%s,%s,%s)", (momento, tipo, abr, texto))
