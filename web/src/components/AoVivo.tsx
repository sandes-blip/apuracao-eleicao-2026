import { useEffect, useState } from 'react';
import type { StatusApuracao } from '../types/contrato';
import { dataTSE, duracao, horaTSE } from '../lib/format';

interface Props {
  status: StatusApuracao;
  atualizadoTse: string | null;
  segundosDesdeTse?: number | null;
  recebidoEm?: number;
}

/** Indicador "ao vivo" com contagem de segundos desde a última atualização do TSE. */
export default function AoVivo({ status, atualizadoTse, segundosDesdeTse, recebidoEm }: Props) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  let seg: number | null = null;
  if (segundosDesdeTse != null && recebidoEm) seg = segundosDesdeTse + (agora - recebidoEm) / 1000;
  else {
    const d = dataTSE(atualizadoTse);
    if (d) seg = (agora - d.getTime()) / 1000;
  }

  if (status === 'parado') {
    return (
      <div role="status" className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-950 ring-1 ring-amber-300 dark:bg-amber-900/50 dark:text-amber-100 dark:ring-amber-700">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-500" />
        Dados oficiais sem atualização desde {horaTSE(atualizadoTse)}
      </div>
    );
  }
  if (status === 'aguardando') {
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-slate-400" />
        Aguardando o início da apuração (17h, horário de Brasília)
      </div>
    );
  }
  if (status === 'final') {
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-100">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-slate-600 dark:bg-slate-300" />
        Apuração encerrada · última atualização do TSE às {horaTSE(atualizadoTse)}
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-800 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-100 dark:ring-red-800">
      <span aria-hidden="true" className="pulso h-2 w-2 rounded-full bg-red-600" />
      <span>Ao vivo</span>
      {seg != null && seg >= 0 && (
        <span className="font-normal" aria-live="off">
          · atualizado há {duracao(seg)}
        </span>
      )}
    </div>
  );
}
