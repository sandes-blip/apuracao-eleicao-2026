import { AVISO } from '../lib/geo-ref';

/** Aviso obrigatório ao lado de toda projeção. */
export default function Aviso({ className = '' }: { className?: string }) {
  return (
    <p
      className={`flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-800/60 ${className}`}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 h-3.5 w-3.5 flex-none fill-current">
        <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 4a1 1 0 011 1v4a1 1 0 11-2 0V7a1 1 0 011-1zm0 8.5a1.2 1.2 0 110-2.4 1.2 1.2 0 010 2.4z" />
      </svg>
      <span>{AVISO}</span>
    </p>
  );
}
