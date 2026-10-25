import type { ReactNode } from 'react';
import type { PorCand } from '../types/contrato';
import { useCandidatos } from '../lib/dados';
import { fmtInt, fmtPct } from '../lib/format';
import Avatar from './Avatar';

interface Props {
  titulo?: string;
  pct: PorCand<number> | null;
  votos: PorCand<number>;
  pctSecoes: number;
  /** só quando o TSE sinaliza (apuracao.eleito) */
  eleito?: string | null;
  topo?: ReactNode;
  rodape?: ReactNode;
}

/** Placar oficial (P0): barras horizontais, ordem fixa 13 e 22. */
export default function Placar({ titulo = 'Placar oficial', pct, votos, pctSecoes, eleito, topo, rodape }: Props) {
  const cands = useCandidatos();
  return (
    <section className="card" aria-labelledby="placar-titulo">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="placar-titulo" className="titulo-secao">
          {titulo}
          <span className="ml-2 align-middle text-xs font-medium text-slate-500 dark:text-slate-400">dados do TSE</span>
        </h2>
        {topo}
      </div>
      <ul className="space-y-4">
        {cands.map((c) => {
          const p = pct?.[c.n] ?? null;
          return (
            <li key={c.n}>
              <div className="flex items-center gap-3">
                <Avatar c={c} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-semibold">
                      {c.nome} <span className="text-sm font-normal text-slate-500 dark:text-slate-400">{c.partido} · {c.n}</span>
                    </p>
                    <p className="text-2xl font-bold tabular-nums sm:text-3xl">{fmtPct(p)}</p>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <span className="tabular-nums">{fmtInt(votos?.[c.n])} votos</span>
                    {eleito === c.n && (
                      <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white dark:bg-white dark:text-slate-900">
                        Eleito, segundo o TSE
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div
                className="relative mt-2 h-4 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                role="img"
                aria-label={`${c.nome}: ${fmtPct(p)} dos votos válidos apurados`}
              >
                <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${p ?? 0}%`, backgroundColor: c.cor }} />
                <div aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-slate-900/60 dark:bg-white/70" />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">Seções totalizadas</span>
          <span className="font-semibold tabular-nums">{fmtPct(pctSecoes)}</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
          <div className="h-full rounded-full bg-slate-700 dark:bg-slate-300" style={{ width: `${pctSecoes}%` }} />
        </div>
        <p className="mini mt-1">Percentuais sobre os votos válidos apurados. A linha central marca 50%.</p>
      </div>
      {rodape && <div className="mt-3">{rodape}</div>}
    </section>
  );
}
