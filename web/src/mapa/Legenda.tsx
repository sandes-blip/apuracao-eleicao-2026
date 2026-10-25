import type { Escala, CamadaId } from './camadas';
import { fmtVotosCurto } from '../lib/format';

export default function Legenda({ camada, escala, semDado, maxRestantes, raioMax }: {
  camada: CamadaId; escala: Escala; semDado: string; maxRestantes: number; raioMax: number;
}) {
  if (camada === 'faltam') {
    const vals = [maxRestantes, maxRestantes / 4, maxRestantes / 16].filter((v) => v > 0);
    return (
      <div className="text-xs text-slate-700 dark:text-slate-200">
        <p className="mb-1">{escala.descricao}</p>
        <div className="flex items-end gap-4">
          {vals.map((v) => {
            const r = Math.max(2, raioMax * Math.sqrt(v / maxRestantes) * 0.5);
            return (
              <span key={v} className="flex flex-col items-center gap-1">
                <svg width={r * 2 + 2} height={r * 2 + 2} aria-hidden="true">
                  <circle cx={r + 1} cy={r + 1} r={r} className="fill-slate-700/40 stroke-slate-800 dark:fill-slate-200/40 dark:stroke-slate-100" />
                </svg>
                <span className="tabular-nums">{fmtVotosCurto(v)}</span>
              </span>
            );
          })}
        </div>
      </div>
    );
  }
  const [d0, d1] = escala.dominio;
  const passos = 24;
  const grad = Array.from({ length: passos + 1 }, (_, i) => {
    const v = d0 + ((d1 - d0) * i) / passos;
    return `${escala.cor(v)} ${(i / passos) * 100}%`;
  }).join(', ');
  return (
    <div className="text-xs text-slate-700 dark:text-slate-200">
      <p className="mb-1">{escala.descricao}</p>
      {escala.rotulos && (
        <div className="flex justify-between font-medium">
          <span>{escala.rotulos[0]}</span>
          <span>{escala.rotulos[1]}</span>
        </div>
      )}
      <div className="h-3 rounded-sm ring-1 ring-slate-300 dark:ring-slate-600" style={{ background: `linear-gradient(to right, ${grad})` }} aria-hidden="true" />
      <div className="relative mt-0.5 h-4">
        {escala.ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${((t - d0) / (d1 - d0)) * 100}%` }}>
            {escala.fmtTick(t)}
          </span>
        ))}
      </div>
      <p className="mt-0.5 flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 rounded-sm ring-1 ring-slate-300 dark:ring-slate-600" style={{ backgroundColor: semDado }} />
        Sem dados ainda
        {(escala.dominio[1] === 40 || escala.dominio[1] === 10) && <span className="ml-2 text-slate-500 dark:text-slate-400">Valores em p.p.; acima do limite a cor satura.</span>}
      </p>
    </div>
  );
}
