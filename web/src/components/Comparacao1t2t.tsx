import type { RegiaoUF } from '../types/contrato';
import { useCandidatos } from '../lib/dados';
import { fmtPct } from '../lib/format';

/** Comparação 1º x 2º turno por UF: % do primeiro candidato entre os dois finalistas. */
export default function Comparacao1t2t({ itens }: { itens: RegiaoUF[] }) {
  const [a, b] = useCandidatos();
  const lista = itens.filter((u) => u.share2_1t);
  return (
    <section className="card" aria-labelledby="comp-titulo">
      <h2 id="comp-titulo" className="titulo-secao">1º turno x 2º turno por estado</h2>
      <p className="sub mt-1">
        Divisão entre os dois finalistas. No 1º turno, considera só os votos de {a.nome} e {b.nome} (os demais candidatos ficam de fora); no 2º turno, os votos válidos já apurados.
      </p>
      <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {lista.map((u) => {
          const t1 = u.share2_1t?.[a.n] ?? 50;
          const t2 = u.votos && (u.votos[a.n] ?? 0) + (u.votos[b.n] ?? 0) > 0 ? u.pct[a.n] : null;
          return (
            <li key={u.codigo} className="grid grid-cols-[2.25rem_1fr] items-center gap-2 text-xs">
              <span className="font-semibold uppercase">{u.codigo}</span>
              <div className="space-y-0.5">
                <Barra rotulo="1º" v={t1} a={a.cor} b={b.cor} desc={`${u.nome}, 1º turno: ${a.nome} ${fmtPct(t1, 1)}, ${b.nome} ${fmtPct(100 - t1, 1)}`} />
                <Barra rotulo="2º" v={t2} a={a.cor} b={b.cor} desc={t2 == null ? `${u.nome}, 2º turno: sem votos apurados` : `${u.nome}, 2º turno: ${a.nome} ${fmtPct(t2, 1)}, ${b.nome} ${fmtPct(100 - t2, 1)}`} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Barra({ rotulo, v, a, b, desc }: { rotulo: string; v: number | null; a: string; b: string; desc: string }) {
  return (
    <div className="flex items-center gap-1.5" role="img" aria-label={desc}>
      <span className="w-4 text-[10px] text-slate-500 dark:text-slate-400">{rotulo}</span>
      <div className="relative flex h-3 flex-1 overflow-hidden rounded-sm bg-slate-100 dark:bg-slate-800">
        {v != null && (
          <>
            <div style={{ width: `${v}%`, backgroundColor: a }} />
            <div style={{ width: `${100 - v}%`, backgroundColor: b }} />
          </>
        )}
        <div className="absolute inset-y-0 left-1/2 w-px bg-white dark:bg-slate-900" />
      </div>
      <span className="w-20 text-right tabular-nums text-slate-700 dark:text-slate-200">
        {v == null ? 'sem dados' : `${fmtPct(v, 1)} × ${fmtPct(100 - v, 1)}`}
      </span>
    </div>
  );
}
