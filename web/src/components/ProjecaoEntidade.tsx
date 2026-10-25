import type { RegiaoUF } from '../types/contrato';
import { useCandidatos } from '../lib/dados';
import { fmtPct, fmtProb } from '../lib/format';
import Aviso from './Aviso';
import FaixaIC from './FaixaIC';

/** Projeção de uma região ou UF (objeto RegiaoUF.proj). */
export default function ProjecaoEntidade({ r, disponivelBR = true, motivo }: { r: RegiaoUF; disponivelBR?: boolean; motivo?: string | null }) {
  const cands = useCandidatos();
  const proj = r.proj;
  if (!disponivelBR || !proj) {
    return (
      <section className="card">
        <h2 className="titulo-secao">Projeção estatística</h2>
        <p className="sub mt-2">{motivo || 'A projeção ainda não está disponível para este recorte.'}</p>
        <Aviso className="mt-3" />
      </section>
    );
  }
  const lim = cands.flatMap((c) => proj.ic95?.[c.n] ?? [proj.pct[c.n], proj.pct[c.n]]);
  const min = Math.max(0, Math.floor(Math.min(...lim, 50) - 2));
  const max = Math.min(100, Math.ceil(Math.max(...lim, 50) + 2));
  return (
    <section className="card">
      <h2 className="titulo-secao">Projeção estatística: {r.nome}</h2>
      <ul className="mt-3 space-y-4">
        {cands.map((c) => {
          const ic = proj.ic95?.[c.n];
          return (
            <li key={c.n}>
              <div className="flex items-baseline justify-between">
                <p className="font-semibold">
                  <span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.cor }} />
                  {c.nome}
                </p>
                <p className="text-xl font-bold tabular-nums">{fmtPct(proj.pct[c.n], 1)}</p>
              </div>
              <p className="sub">
                Tende a terminar com {fmtPct(proj.pct[c.n], 1)}
                {ic && <> (faixa de {fmtPct(ic[0], 1)} a {fmtPct(ic[1], 1)})</>}
                {proj.prob && <>. Chance de terminar à frente aqui: <strong>{fmtProb(proj.prob[c.n])}</strong></>}
              </p>
              {ic && <FaixaIC ic={ic} centro={proj.pct[c.n]} cor={c.cor} min={min} max={max} rotulo={c.nome} />}
              {r.proj_p1 && <p className="mini mt-1">Projeção pelo ritmo atual: {fmtPct(r.proj_p1[c.n], 1)}</p>}
            </li>
          );
        })}
      </ul>
      <Aviso className="mt-3" />
    </section>
  );
}
