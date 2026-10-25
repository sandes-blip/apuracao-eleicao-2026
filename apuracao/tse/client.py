"""Cliente HTTP do TSE: token bucket, ETag/Last-Modified, retry com backoff, bloqueio de URL com 404."""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass

import httpx

log = logging.getLogger("tse")


class TokenBucket:
    def __init__(self, rate: float, burst: float | None = None):
        self.rate = rate
        self.capacity = burst or max(1.0, rate)
        self.tokens = self.capacity
        self.t = time.monotonic()
        self.lock = asyncio.Lock()

    async def take(self) -> None:
        async with self.lock:
            while True:
                now = time.monotonic()
                self.tokens = min(self.capacity, self.tokens + (now - self.t) * self.rate)
                self.t = now
                if self.tokens >= 1:
                    self.tokens -= 1
                    return
                await asyncio.sleep((1 - self.tokens) / self.rate)


@dataclass
class Resp:
    url: str
    status: int
    content: bytes | None
    not_modified: bool = False


class TSEClient:
    def __init__(self, rps: float = 15, concurrency: int = 8, on_alert=None):
        self.bucket = TokenBucket(rps)
        self.sem = asyncio.Semaphore(concurrency)
        self.etags: dict[str, tuple[str | None, str | None]] = {}
        self.blocked: set[str] = set()
        self.on_alert = on_alert or (lambda msg: log.error(msg))
        self.http = httpx.AsyncClient(
            timeout=httpx.Timeout(20.0, connect=10.0),
            headers={"User-Agent": "portal-apuracao-2026/1.0 (+https://resultados-eleicao.yvesscopy.com)"},
            http2=False,
            follow_redirects=False,
        )
        self.n_requests = 0
        self.n_errors = 0
        self.last_ok: float | None = None

    async def close(self) -> None:
        await self.http.aclose()

    async def get(self, url: str, conditional: bool = True, retries: int = 3) -> Resp:
        if url in self.blocked:
            return Resp(url, 404, None)
        headers = {}
        if conditional and url in self.etags:
            etag, lm = self.etags[url]
            if etag:
                headers["If-None-Match"] = etag
            if lm:
                headers["If-Modified-Since"] = lm
        delay = 1.0
        for attempt in range(retries + 1):
            await self.bucket.take()
            async with self.sem:
                self.n_requests += 1
                try:
                    r = await self.http.get(url, headers=headers)
                except httpx.HTTPError as e:
                    self.n_errors += 1
                    log.warning("erro de rede %s: %s", url, e)
                    if attempt == retries:
                        return Resp(url, 0, None)
                    await asyncio.sleep(delay)
                    delay *= 2
                    continue
            if r.status_code == 304:
                self.last_ok = time.time()
                return Resp(url, 304, None, not_modified=True)
            if r.status_code == 200:
                self.last_ok = time.time()
                self.etags[url] = (r.headers.get("etag"), r.headers.get("last-modified"))
                return Resp(url, 200, r.content)
            if r.status_code == 404:
                # nunca reenviar: 404 repetido pode bloquear o IP
                self.blocked.add(url)
                self.on_alert(f"404 no TSE (URL bloqueada para novas tentativas): {url}")
                return Resp(url, 404, None)
            if r.status_code in (403, 429):
                self.on_alert(f"TSE respondeu {r.status_code} (possível limite/bloqueio). Pausando 60s. {url}")
                await asyncio.sleep(60)
            self.n_errors += 1
            if attempt == retries:
                return Resp(url, r.status_code, None)
            await asyncio.sleep(delay)
            delay *= 2
        return Resp(url, 0, None)
