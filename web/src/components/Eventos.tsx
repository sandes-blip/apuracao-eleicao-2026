import type { Evento } from '../types/contrato';
import { horaISO } from '../lib/format';

export const TIPO_EVENTO: Record<string, string> = {
  virada_oficial: 'Mudança de líder no placar',
  virada_projetada: 'Mudança na projeção',
  mudanca_probabilidade: 'Probabilidade',
  uf_fora_padrao: 'Estado fora do padrão',
  municipio_fora_padrao: 'Município fora do padrão',
  comparecimento_atipico: 'Comparecimento',
  fonte_parada: 'Fonte sem atualização',
  marco_apuracao: 'Marco da apuração',
  confianca_alta: 'Confiança',
  definido_tse: 'TSE',
};

export default function Eventos({ eventos, titulo = 'Acontecimentos recentes' }: { eventos: Evento[]; titulo?: string }) {
  if (!eventos.length) return null;
  return (
    <section className="card" aria-labelledby="ev-titulo">
      <h2 id="ev-titulo" className="titulo-secao">{titulo}</h2>
      <ol className="mt-2 space-y-2">
        {eventos.map((e, i) => (
          <li key={i} className="grid grid-cols-[3rem_1fr] gap-2 text-sm">
            <time className="tabular-nums text-slate-500 dark:text-slate-400" dateTime={e.momento}>{horaISO(e.momento)}</time>
            <div>
              <span className="mr-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{TIPO_EVENTO[e.tipo] ?? e.tipo}</span>
              <span className="text-slate-800 dark:text-slate-100">{e.texto}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
