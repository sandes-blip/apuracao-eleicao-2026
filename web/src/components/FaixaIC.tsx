import { fmtPct } from '../lib/format';

interface Props {
  ic: [number, number];
  centro: number;
  cor: string;
  min: number;
  max: number;
  rotulo: string;
}

/** Faixa de 95% desenhada numa régua com a marca de 50%. */
export default function FaixaIC({ ic, centro, cor, min, max, rotulo }: Props) {
  const x = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  return (
    <div
      className="relative mb-4 mt-2 h-6"
      role="img"
      aria-label={`${rotulo}: faixa de 95% entre ${fmtPct(ic[0], 1)} e ${fmtPct(ic[1], 1)}, valor central ${fmtPct(centro, 1)}`}
    >
      <div className="absolute inset-x-0 top-1/2 h-px bg-slate-300 dark:bg-slate-600" />
      <div className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full opacity-40" style={{ left: x(ic[0]), width: `calc(${x(ic[1])} - ${x(ic[0])})`, backgroundColor: cor }} />
      <div className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded" style={{ left: x(centro), backgroundColor: cor }} />
      {min < 50 && max > 50 && (
        <>
          <div className="absolute inset-y-0 w-px bg-slate-900 dark:bg-white" style={{ left: x(50) }} />
          <span className="absolute -bottom-3.5 -translate-x-1/2 text-[10px] text-slate-500 dark:text-slate-400" style={{ left: x(50) }}>50%</span>
        </>
      )}
      <span className="absolute -bottom-3.5 left-0 text-[10px] text-slate-500 dark:text-slate-400">{min}%</span>
      <span className="absolute -bottom-3.5 right-0 text-[10px] text-slate-500 dark:text-slate-400">{max}%</span>
    </div>
  );
}
