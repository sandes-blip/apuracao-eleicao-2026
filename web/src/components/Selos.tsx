import type { Confianca } from '../types/contrato';
import { CONFIANCA_NOME } from '../lib/geo-ref';

const COR: Record<string, string> = {
  insuficiente: 'bg-slate-100 text-slate-700 ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600',
  baixa: 'bg-rose-50 text-rose-900 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-100 dark:ring-rose-800',
  media: 'bg-yellow-50 text-yellow-900 ring-yellow-300 dark:bg-yellow-950/50 dark:text-yellow-100 dark:ring-yellow-800',
  alta: 'bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-100 dark:ring-emerald-800',
};

export function SeloConfianca({ c }: { c: Confianca | null | undefined }) {
  if (!c) return null;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${COR[c] ?? COR.insuficiente}`}>
      {CONFIANCA_NOME[c] ?? c}
    </span>
  );
}

export function SeloOrigem({ origem }: { origem: string }) {
  const ia = origem === 'ia';
  return (
    <span
      title={ia ? 'Texto redigido por IA a partir dos números do motor estatístico. A IA não calcula números.' : 'Texto automático montado a partir de um modelo de frase.'}
      className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600"
    >
      {ia ? 'Texto gerado por IA' : 'Texto automático'}
    </span>
  );
}
