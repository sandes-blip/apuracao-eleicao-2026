import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Suspense, useEffect } from 'react';
import { Carregando } from './Carregando';
import { useCoresCSS, useDados } from '../lib/dados';
import { useTema } from '../lib/tema';
import { AVISO, REGIOES, UFS } from '../lib/geo-ref';

const NAV = [
  { to: '/', nome: 'Início', end: true },
  { to: '/municipio', nome: 'Municípios' },
  { to: '/linha-do-tempo', nome: 'Linha do tempo' },
  { to: '/replay', nome: 'Replay' },
  { to: '/metodologia', nome: 'Metodologia' },
  { to: '/sobre', nome: 'Sobre' },
];

export default function Layout() {
  useCoresCSS();
  const { tema, alternar } = useTema();
  const { erro } = useDados();
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => {
    if (!loc.hash) window.scrollTo(0, 0);
  }, [loc.pathname, loc.hash]);
  const atual = loc.pathname.startsWith('/regiao/') ? loc.pathname : loc.pathname.startsWith('/uf/') ? loc.pathname : '';

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#conteudo" className="sr-only-focusable absolute left-2 top-2 z-50 rounded bg-slate-900 px-3 py-2 text-white">
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-[#0b1220]/95">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <NavLink to="/" className="flex items-center gap-2 font-bold tracking-tight">
            <img src="/favicon.svg" alt="" width={24} height={24} />
            <span>Apuração 2026 <span className="hidden font-normal text-slate-500 dark:text-slate-400 sm:inline">· 2º turno presidencial</span></span>
          </NavLink>
          <div className="ml-auto flex items-center gap-2">
            <label className="sr-only" htmlFor="ir-para">Ir para região ou estado</label>
            <select
              id="ir-para"
              className="campo max-w-[9.5rem] py-1 text-xs sm:max-w-none"
              value={atual}
              onChange={(e) => e.target.value && nav(e.target.value)}
            >
              <option value="">Região ou estado…</option>
              <optgroup label="Regiões">
                {REGIOES.filter((r) => r.codigo !== 'EXT').map((r) => (
                  <option key={r.codigo} value={`/regiao/${r.codigo}`}>{r.nome}</option>
                ))}
              </optgroup>
              <optgroup label="Estados">
                {Object.entries(UFS)
                  .sort((a, b) => a[1].nome.localeCompare(b[1].nome, 'pt-BR'))
                  .map(([s, u]) => (
                    <option key={s} value={`/uf/${s}`}>{u.nome}</option>
                  ))}
              </optgroup>
            </select>
            <button
              type="button"
              onClick={alternar}
              className="btn px-2 py-1"
              aria-label={tema === 'escuro' ? 'Ativar modo claro' : 'Ativar modo escuro'}
              title={tema === 'escuro' ? 'Modo claro' : 'Modo escuro'}
            >
              {tema === 'escuro' ? (
                <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden="true"><path d="M10 3a1 1 0 011 1v1a1 1 0 11-2 0V4a1 1 0 011-1zm0 10a3 3 0 100-6 3 3 0 000 6zm6-3a1 1 0 011-1h1a1 1 0 110 2h-1a1 1 0 01-1-1zM2 10a1 1 0 011-1h1a1 1 0 110 2H3a1 1 0 01-1-1zm8 6a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zm5.66-11.66a1 1 0 010 1.41l-.7.71a1 1 0 11-1.42-1.41l.71-.71a1 1 0 011.41 0zM6.46 13.54a1 1 0 010 1.41l-.71.71a1 1 0 01-1.41-1.41l.7-.71a1 1 0 011.42 0zm9.2 2.12a1 1 0 01-1.41 0l-.71-.7a1 1 0 011.41-1.42l.71.71a1 1 0 010 1.41zM6.46 6.46a1 1 0 01-1.42 0l-.7-.71a1 1 0 011.41-1.41l.71.7a1 1 0 010 1.42z" /></svg>
              ) : (
                <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden="true"><path d="M17.3 13.3A8 8 0 016.7 2.7a8 8 0 1010.6 10.6z" /></svg>
              )}
            </button>
          </div>
        </div>
        <nav aria-label="Principal" className="mx-auto max-w-6xl overflow-x-auto px-4">
          <ul className="flex gap-1 pb-2 text-sm">
            {NAV.map((n) => (
              <li key={n.to} className="flex-none">
                <NavLink
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    `block rounded-md px-2.5 py-1 font-medium ${isActive ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`
                  }
                >
                  {n.nome}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <p className="border-t border-amber-200 bg-amber-50 px-4 py-1 text-center text-[11px] font-medium text-amber-950 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-100 sm:text-xs">
          {AVISO}
        </p>
      </header>
      {erro && (
        <div role="status" className="mx-auto mt-3 w-full max-w-6xl px-4">
          <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-100">{erro}</p>
        </div>
      )}
      <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 sm:py-6">
        <Suspense fallback={<Carregando />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="border-t border-slate-200 py-6 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
        <div className="mx-auto max-w-6xl space-y-2 px-4">
          <p className="font-medium text-slate-800 dark:text-slate-100">{AVISO}</p>
          <p>
            Fonte única: dados oficiais de divulgação do TSE (
            <a className="link" href="https://resultados.tse.jus.br" target="_blank" rel="noopener noreferrer">resultados.tse.jus.br</a>
            ). Portal independente, sem vínculo com partidos ou campanhas. Sem login e sem coleta de dados pessoais.
          </p>
          <p>
            <NavLink className="link" to="/metodologia">Metodologia</NavLink> · <NavLink className="link" to="/sobre">Sobre e avisos</NavLink>
          </p>
        </div>
      </footer>
    </div>
  );
}
