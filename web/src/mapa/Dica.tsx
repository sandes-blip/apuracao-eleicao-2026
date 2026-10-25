import type { Candidato } from '../types/contrato';
import type { MapaDatum } from './dados';
import { fmtInt, fmtPct, fmtPP, fmtVotosCurto } from '../lib/format';
import { STATUS_NOME } from '../lib/geo-ref';

/** Conteúdo do tooltip do mapa. */
export default function Dica({ d, cands }: { d: MapaDatum; cands: Candidato[] }) {
  const [a, b] = cands;
  return (
    <div className="space-y-1 text-xs">
      <p className="text-sm font-semibold">
        {d.nome}
        {d.capital && <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">(capital)</span>}
      </p>
      <p>
        {fmtPct(d.pct_secoes, 1)} apurado · {STATUS_NOME[d.status] ?? d.status}
      </p>
      {d.pctA != null ? (
        <table className="w-full">
          <tbody>
            {[a, b].map((c, i) => {
              const p = i === 0 ? d.pctA! : 100 - d.pctA!;
              const v = d.votos ? (i === 0 ? d.votos.a : d.votos.b) : null;
              return (
                <tr key={c.n}>
                  <td className="pr-2">
                    <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: c.cor }} />
                    {c.nome}
                  </td>
                  <td className="text-right font-semibold tabular-nums">{fmtPct(p, 1)}</td>
                  {d.votos && <td className="pl-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{fmtInt(v)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="text-slate-500 dark:text-slate-400">Sem votos apurados</p>
      )}
      {d.share1tA != null && (
        <p>
          1º turno (entre os dois): {fmtPct(d.share1tA, 1)} × {fmtPct(100 - d.share1tA, 1)}
          {d.pct1t && <span className="text-slate-500 dark:text-slate-400"> · dos válidos: {fmtPct(d.pct1t.a, 1)} × {fmtPct(d.pct1t.b, 1)}</span>}
        </p>
      )}
      {d.swing != null && <p>Variação para {a.nome}: {fmtPP(d.swing)}</p>}
      {d.projA != null && <p>Projeção: {fmtPct(d.projA, 1)} × {fmtPct(100 - d.projA, 1)} <span className="text-slate-500 dark:text-slate-400">(estatística, não oficial)</span></p>}
      {d.restantes != null && d.restantes > 0 && <p>Faltam cerca de {fmtVotosCurto(d.restantes)} votos válidos</p>}
      {d.comp != null && d.comp1t != null && <p>Comparecimento: {fmtPct(d.comp, 1)} (1º turno: {fmtPct(d.comp1t, 1)})</p>}
    </div>
  );
}
