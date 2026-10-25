const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtInt = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? '-' : nf0.format(n));

export function fmtPct(n: number | null | undefined, casas = 2): string {
  if (n == null || Number.isNaN(n)) return '-';
  return `${(casas === 1 ? nf1 : casas === 0 ? nf0 : nf2).format(n)}%`;
}

export function fmtPP(n: number | null | undefined, casas = 1): string {
  if (n == null || Number.isNaN(n)) return '-';
  const s = (casas === 2 ? nf2 : nf1).format(Math.abs(n));
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${s} p.p.`;
}

/** Votos em formato curto: 1,2 mi / 350 mil. */
export function fmtVotosCurto(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '-';
  const a = Math.abs(n);
  if (a >= 1e6) return `${nf1.format(n / 1e6)} mi`;
  if (a >= 1e4) return `${nf0.format(n / 1e3)} mil`;
  return nf0.format(n);
}

export function fmtProb(p: number | null | undefined): string {
  if (p == null || Number.isNaN(p)) return '-';
  const v = p * 100;
  if (v > 99) return '> 99%';
  if (v < 1) return '< 1%';
  return `${nf0.format(v)}%`;
}

/** Hora HH:MM de um ISO com offset, sempre no horário de Brasília. */
export function horaISO(iso: string | null | undefined, comSeg = false): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    ...(comSeg ? { second: '2-digit' } : {}),
    timeZone: 'America/Sao_Paulo',
  });
}

/** "25/10/2026 19:20:01" (TSE) -> "19:20". */
export function horaTSE(s: string | null | undefined, comSeg = false): string {
  if (!s) return '-';
  const m = s.match(/(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return s;
  return comSeg ? `${m[1]}:${m[2]}:${m[3]}` : `${m[1]}:${m[2]}`;
}

/** Converte a string do TSE para Date (horário de Brasília, -03:00). */
export function dataTSE(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}-03:00`);
}

export function duracao(seg: number): string {
  if (seg < 60) return `${Math.max(0, Math.floor(seg))} s`;
  const m = Math.floor(seg / 60);
  if (m < 60) return `${m} min ${Math.floor(seg % 60)} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
