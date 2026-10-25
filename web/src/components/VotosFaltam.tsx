import type { RegiaoUF } from '../types/contrato';
import { useCandidatos } from '../lib/dados';
import { fmtPct, fmtVotosCurto } from '../lib/format';
import Aviso from './Aviso';

/** "De onde vêm os votos que faltam": apurado x restante e saldo esperado por região (ou UF). */
export default function VotosFaltam({ itens, titulo = 'De onde vêm os votos que faltam', comSaldo = true }: { itens: RegiaoUF[]; titulo?: string; comSaldo?: boolean }) {
  const [a, b] = useCandidatos();
  const linhas = itens.map((r) => {
    const apur = (r.votos?.[a.n] ?? 0) + (r.votos?.[b.n] ?? 0);
    return { r, apur, rest: Math.max(0, r.validos_restantes ?? 0) };
  });
  const maxTot = Math.max(1, ...linhas.map((l) => l.apur + l.rest));
  const maxSaldo = Math.max(1, ...linhas.map((l) => Math.abs(l.r.saldo_esperado ?? 0)));
  return (
    <section className="card" aria-labelledby="faltam-titulo">
      <h2 id="faltam-titulo" className="titulo-secao">{titulo}</h2>
      <p className="sub mt-1">
        Votos válidos já apurados e estimativa dos que faltam{comSaldo ? ', com o saldo esperado nos votos restantes' : ''}.
        {!comSaldo && ' O saldo esperado aparece quando a projeção estiver disponível.'}
      </p>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm bg-slate-600 dark:bg-slate-300" />Apurados</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm border border-dashed border-slate-500 bg-slate-200 dark:bg-slate-700" />Faltam (estimativa)</span>
      </div>
      <ul className="mt-3 space-y-3">
        {linhas.map(({ r, apur, rest }) => {
          const s = r.saldo_esperado ?? 0;
          const quem = s > 0 ? a : s < 0 ? b : null;
          return (
            <li key={r.codigo} className="grid grid-cols-[6.5rem_1fr] items-center gap-x-3 gap-y-1 sm:grid-cols-[8rem_1fr_13rem]">
              <span className="text-sm font-medium">{r.nome}</span>
              <div className="flex h-4 overflow-hidden rounded bg-slate-50 dark:bg-slate-800/50" role="img" aria-label={`${r.nome}: ${fmtVotosCurto(apur)} apurados, cerca de ${fmtVotosCurto(rest)} faltando`}>
                <div className="h-full bg-slate-600 dark:bg-slate-300" style={{ width: `${(apur / maxTot) * 100}%` }} />
                <div className="h-full border border-dashed border-slate-500 bg-slate-200 dark:bg-slate-700" style={{ width: `${(rest / maxTot) * 100}%` }} />
              </div>
              <div className="col-span-2 flex items-center gap-2 text-xs sm:col-span-1">
                <span className="whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-300">faltam {fmtVotosCurto(rest)}</span>
                {!comSaldo ? null : quem ? (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold tabular-nums">
                    <span className="inline-block h-2 rounded-sm" style={{ width: `${Math.max(4, (Math.abs(s) / maxSaldo) * 40)}px`, backgroundColor: quem.cor }} />
                    saldo {s > 0 ? '+' : '−'}{fmtVotosCurto(Math.abs(s))} {quem.nome.split(' ')[0]}
                  </span>
                ) : (
                  <span className="text-slate-500">saldo nulo</span>
                )}
              </div>
              <span className="col-span-2 -mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 sm:col-start-2">
                {fmtPct(r.pct_secoes, 1)} das seções apuradas
              </span>
            </li>
          );
        })}
      </ul>
      <Aviso className="mt-3" />
    </section>
  );
}
