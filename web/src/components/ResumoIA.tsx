import type { AnaliseIA } from '../types/contrato';
import { horaISO } from '../lib/format';
import { SeloConfianca, SeloOrigem } from './Selos';
import Aviso from './Aviso';

export default function ResumoIA({ ia, completo = true }: { ia: AnaliseIA | null | undefined; completo?: boolean }) {
  if (!ia) return null;
  return (
    <article className="card" aria-labelledby={`ia-${ia.momento}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Análise das {horaISO(ia.momento)}
        </span>
        <SeloOrigem origem={ia.origem} />
        {ia.confianca && <SeloConfianca c={ia.confianca} />}
      </div>
      <h2 id={`ia-${ia.momento}`} className="text-lg font-semibold leading-snug">{ia.titulo}</h2>
      <p className="mt-1.5 text-slate-700 dark:text-slate-200">{ia.resumo}</p>
      {completo && ia.destaques && ia.destaques.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-200">
          {ia.destaques.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
      {completo && ia.o_que_falta && (
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
          <strong>O que falta:</strong> {ia.o_que_falta}
        </p>
      )}
      <Aviso className="mt-3" />
    </article>
  );
}
