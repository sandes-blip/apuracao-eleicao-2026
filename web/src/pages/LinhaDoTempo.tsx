import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AnaliseIA, Evento } from '../types/contrato';
import { useDados, useJson } from '../lib/dados';
import { horaISO } from '../lib/format';
import ResumoIA from '../components/ResumoIA';
import { Carregando } from '../components/Carregando';
import { TIPO_EVENTO } from '../components/Eventos';

type Item = { t: number; tipo: 'ia'; ia: AnaliseIA } | { t: number; tipo: 'ev'; ev: Evento };

export default function LinhaDoTempo() {
  const { versao } = useDados();
  const [sp, setSp] = useSearchParams();
  const ver = sp.get('ver') ?? 'tudo';
  const hist = useJson<{ analises: AnaliseIA[] }>('ia/historico.json', versao);
  const evs = useJson<{ eventos: Evento[] }>('eventos.json', versao);

  const itens = useMemo(() => {
    const l: Item[] = [];
    if (ver !== 'eventos') hist.data?.analises.forEach((ia) => l.push({ t: new Date(ia.momento).getTime(), tipo: 'ia', ia }));
    if (ver !== 'analises') evs.data?.eventos.forEach((ev) => l.push({ t: new Date(ev.momento).getTime(), tipo: 'ev', ev }));
    return l.sort((a, b) => b.t - a.t);
  }, [hist.data, evs.data, ver]);

  const opcoes = [
    ['tudo', 'Tudo'],
    ['analises', 'Análises'],
    ['eventos', 'Acontecimentos'],
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Linha do tempo</h1>
        <p className="sub">Todas as análises publicadas e os acontecimentos detectados durante a apuração, do mais recente ao mais antigo.</p>
      </div>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Mostrar">
        {opcoes.map(([v, n]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={ver === v}
            className={`btn text-xs ${ver === v ? 'btn-ativo' : ''}`}
            onClick={() => setSp(v === 'tudo' ? {} : { ver: v }, { replace: true })}
          >
            {n}
          </button>
        ))}
      </div>
      {(hist.carregando || evs.carregando) && !itens.length ? (
        <Carregando />
      ) : !itens.length ? (
        <p className="sub">Ainda não há análises ou acontecimentos publicados.</p>
      ) : (
        <ol className="relative space-y-4 border-l border-slate-200 pl-4 dark:border-slate-700">
          {itens.map((it, i) => (
            <li key={i} className="relative">
              <span aria-hidden="true" className="absolute -left-[21px] top-2 h-2.5 w-2.5 rounded-full bg-slate-400 ring-4 ring-white dark:bg-slate-500 dark:ring-[#0b1220]" />
              {it.tipo === 'ia' ? (
                <ResumoIA ia={it.ia} />
              ) : (
                <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                  <time className="mr-2 font-semibold tabular-nums" dateTime={it.ev.momento}>{horaISO(it.ev.momento)}</time>
                  <span className="mr-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{TIPO_EVENTO[it.ev.tipo] ?? it.ev.tipo}</span>
                  <span>{it.ev.texto}</span>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
