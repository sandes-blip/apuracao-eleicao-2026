// Leitura dos JSON estáticos publicados em /data. Nada além disso.
export const DATA_BASE = '/data';

export class ErroHttp extends Error {
  constructor(public status: number, url: string) {
    super(`HTTP ${status} em ${url}`);
  }
}

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const url = `${DATA_BASE}/${path.replace(/^\//, '')}`;
  const r = await fetch(url, { cache: 'no-cache', signal });
  if (!r.ok) throw new ErroHttp(r.status, url);
  return (await r.json()) as T;
}

export const POLL_MS = 30_000;
