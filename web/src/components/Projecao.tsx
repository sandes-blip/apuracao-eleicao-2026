import type { Apuracao, Projecao as TProj } from '../types/contrato';
import { useCandidatos } from '../lib/dados';
import { fmtPct, fmtProb, fmtVotosCurto } from '../lib/format';
import Aviso from './Aviso';
import { SeloConfianca } from './Selos';
import FaixaIC from './FaixaIC';

/** Bloco de projeção nacional (P2 principal, P1 secundária). */
export default function Projecao({ projecao, apuracao }: { projecao: TProj; apuracao: Apuracao }) {
  const cands = useCandidatos();
  const p = projecao;
  const nome = (n: string) => cands.find((c) => c.n === n)?.nome ?? n;

  if (!p.disponivel || !p.p2) {
    return (
      <section className="card" aria-labelledby="proj-titulo">
        <h2 id="proj-titulo" className="titulo-secao">Projeção estatística</h2>
        <p className="sub mt-2">
          {p.motivo || 'A projeção ainda não está disponível.'}
        </p>
        <p className="mini mt-1">
          A projeção só aparece com pelo menos 5% das seções apuradas, dados de 15 estados e de 3 regiões.
        </p>
        <Aviso className="mt-3" />
      </section>
    );
  }
  const p2 = p.p2;
  const lim = cands.flatMap((c) => p2.ic95[c.n] ?? [p2.pct[c.n], p2.pct[c.n]]);
  const min = Math.max(0, Math.floor(Math.min(...lim, 50) - 2));
  const max = Math.min(100, Math.ceil(Math.max(...lim, 50) + 2));

  return (
    <section className="card" aria-labelledby="proj-titulo">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="proj-titulo" className="titulo-secao">Projeção estatística do resultado final</h2>
        <div className="flex flex-wrap gap-1.5">
          <SeloConfianca c={p.confianca} />
          {p.tendencia_consolidada && (
            <span className="inline-flex items-center rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white dark:bg-white dark:text-slate-900">
              Tendência consolidada
            </span>
          )}
        </div>
      </div>
      <ul className="space-y-4">
        {cands.map((c) => {
          const ic = p2.ic95[c.n];
          return (
            <li key={c.n}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold">
                  <span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.cor }} />
                  {c.nome}
                </p>
                <p className="text-2xl font-bold tabular-nums">{fmtPct(p2.pct[c.n], 1)}</p>
              </div>
              <p className="sub">
                Tende a terminar com {fmtPct(p2.pct[c.n], 1)}
                {ic && <> (faixa de {fmtPct(ic[0], 1)} a {fmtPct(ic[1], 1)})</>}.
                {' '}Chance de terminar à frente: <strong className="tabular-nums">{fmtProb(p2.prob[c.n])}</strong>
              </p>
              {ic && <FaixaIC ic={ic} centro={p2.pct[c.n]} cor={c.cor} min={min} max={max} rotulo={c.nome} />}
              {p.p1?.pct && (
                <p className="mini mt-1">
                  Projeção por região (se cada região seguir o ritmo atual): <span className="tabular-nums font-medium">{fmtPct(p.p1.pct[c.n], 1)}</span>
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 space-y-1.5 text-sm text-slate-700 dark:text-slate-200">
        {p.vantagem_supera_restantes && (
          <p className="rounded-md bg-slate-100 px-2.5 py-1.5 font-medium dark:bg-slate-800">
            A vantagem supera o total de eleitores das seções ainda não apuradas.
          </p>
        )}
        {p.virada && (
          <p>
            Para passar à frente, {nome(p.virada.atras)} precisa de{' '}
            <strong className="tabular-nums">{fmtPct(p.virada.pct_necessario, 1)}</strong> dos votos válidos que faltam; a projeção indica{' '}
            <strong className="tabular-nums">{fmtPct(p.virada.pct_projetado, 1)}</strong>.
          </p>
        )}
        {p.ponto_virada_pct_secoes != null && apuracao.pct_secoes < p.ponto_virada_pct_secoes && (
          <p>
            Se o padrão se mantiver, o placar oficial deve mudar de líder por volta de{' '}
            <strong className="tabular-nums">{fmtPct(p.ponto_virada_pct_secoes, 0)}</strong> das seções apuradas.
          </p>
        )}
        {p.divergencia_p1_p2 && (
          <p>A projeção por região e a projeção por município apontam líderes diferentes neste momento.</p>
        )}
        {p.validos_restantes != null && (
          <p className="mini">
            Votos válidos estimados ainda por apurar: {fmtVotosCurto(p.validos_restantes)}.
            {p.eleitores_restantes != null && <> Eleitores nas seções não apuradas: {fmtVotosCurto(p.eleitores_restantes)}.</>}
          </p>
        )}
      </div>
      <Aviso className="mt-3" />
    </section>
  );
}
