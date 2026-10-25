import { useEffect, useState } from 'react';

export type Tema = 'claro' | 'escuro';

function inicial(): Tema {
  try {
    const t = localStorage.getItem('tema');
    if (t === 'claro' || t === 'escuro') return t;
  } catch {
    /* sem storage */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}

export function useTema() {
  const [tema, setTema] = useState<Tema>(inicial);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', tema === 'escuro');
  }, [tema]);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const f = (e: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem('tema')) return;
      } catch {
        /* */
      }
      setTema(e.matches ? 'escuro' : 'claro');
    };
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  const alternar = () =>
    setTema((t) => {
      const n = t === 'escuro' ? 'claro' : 'escuro';
      try {
        localStorage.setItem('tema', n);
      } catch {
        /* */
      }
      return n;
    });
  return { tema, alternar };
}

/** Observa a classe .dark do <html> (para gráficos que precisam das cores do tema). */
export function useEscuro(): boolean {
  const [d, setD] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const o = new MutationObserver(() => setD(document.documentElement.classList.contains('dark')));
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => o.disconnect();
  }, []);
  return d;
}
