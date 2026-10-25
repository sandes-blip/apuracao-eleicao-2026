export function Carregando({ texto = 'Carregando…', altura = 'h-40' }: { texto?: string; altura?: string }) {
  return (
    <div role="status" className={`flex ${altura} items-center justify-center text-sm text-slate-500 dark:text-slate-400`}>
      <span className="pulso">{texto}</span>
    </div>
  );
}

export function Falha({ texto }: { texto: string }) {
  return (
    <div role="alert" className="rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
      {texto}
    </div>
  );
}
