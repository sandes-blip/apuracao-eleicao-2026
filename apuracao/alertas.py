"""Alertas operacionais: log + (opcional) WhatsApp via Evolution API e/ou e-mail SMTP. Deduplicados por 10 min."""
from __future__ import annotations

import json
import logging
import os
import smtplib
import threading
import time
from email.message import EmailMessage
from pathlib import Path

import httpx

log = logging.getLogger("alerta")
_ultimo: dict[str, float] = {}
_lock = threading.Lock()


def _registrar(msg: str) -> None:
    try:
        from apuracao.config import settings
        p = settings().data_dir / "state" / "alertas.jsonl"
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "a", encoding="utf-8") as f:
            f.write(json.dumps({"t": time.time(), "msg": msg}, ensure_ascii=False) + "\n")
    except Exception:
        pass


def alertar(msg: str, chave: str | None = None) -> None:
    chave = chave or msg[:80]
    with _lock:
        if time.time() - _ultimo.get(chave, 0) < 600:
            return
        _ultimo[chave] = time.time()
    log.error("ALERTA: %s", msg)
    _registrar(msg)
    threading.Thread(target=_enviar, args=(msg,), daemon=True).start()


def _enviar(msg: str) -> None:
    texto = f"[apuracao-2026] {msg}"
    url, inst, key, num = (os.getenv(k) for k in ("EVOLUTION_URL", "EVOLUTION_INSTANCE", "EVOLUTION_APIKEY", "ALERT_WHATSAPP"))
    if url and inst and key and num:
        try:
            httpx.post(f"{url.rstrip('/')}/message/sendText/{inst}", headers={"apikey": key},
                       json={"number": num, "text": texto}, timeout=10)
        except Exception as e:
            log.warning("falha Evolution API: %s", e)
    host, to = os.getenv("SMTP_HOST"), os.getenv("ALERT_EMAIL")
    if host and to:
        try:
            m = EmailMessage()
            m["Subject"], m["From"], m["To"] = "Alerta apuração 2026", os.getenv("SMTP_FROM", to), to
            m.set_content(texto)
            with smtplib.SMTP(host, int(os.getenv("SMTP_PORT", "587")), timeout=15) as s:
                s.starttls()
                if os.getenv("SMTP_USER"):
                    s.login(os.getenv("SMTP_USER"), os.getenv("SMTP_PASS", ""))
                s.send_message(m)
        except Exception as e:
            log.warning("falha SMTP: %s", e)
