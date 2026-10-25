"""Arquivo bruto de tudo que vem do TSE. Grava primeiro em disco (fonte da verdade para auditoria e replay)."""
from __future__ import annotations

import gzip
import json
import os
import threading
import time
from pathlib import Path


class RawStore:
    def __init__(self, root: Path, ele: str):
        self.root = Path(root) / ele
        self.latest = self.root / "latest"
        self.hist = self.root / "hist"
        self.latest.mkdir(parents=True, exist_ok=True)
        self.hist.mkdir(parents=True, exist_ok=True)
        self.index = self.root / "index.jsonl"
        self._lock = threading.Lock()

    def save(self, chave: str, content: bytes, meta: dict | None = None) -> Path:
        now = time.time()
        try:
            d = json.loads(content)
            idg = str(d.get("idg", "")) or str(int(now))
            dt_tse = f"{d.get('dt', '')} {d.get('ht', '')}".strip()
        except Exception:
            idg, dt_tse = str(int(now)), ""
        hist_dir = self.hist / chave
        hist_dir.mkdir(parents=True, exist_ok=True)
        hp = hist_dir / f"{idg}.json.gz"
        if not hp.exists():
            with gzip.open(hp, "wb", compresslevel=5) as f:
                f.write(content)
        lp = self.latest / f"{chave}.json"
        tmp = lp.with_suffix(".tmp")
        tmp.write_bytes(content)
        os.replace(tmp, lp)
        rec = {"arquivo": chave, "idg": idg, "data_hora_tse": dt_tse, "baixado_em": now, "path": str(hp.relative_to(self.root))}
        if meta:
            rec.update(meta)
        with self._lock, open(self.index, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        return lp

    def read_latest(self, chave: str) -> bytes | None:
        p = self.latest / f"{chave}.json"
        return p.read_bytes() if p.exists() else None
