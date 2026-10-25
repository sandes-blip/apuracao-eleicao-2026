import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMunicipios } from '../lib/dados';
import { semAcento } from '../lib/municipios';
import { nomeProprio } from '../lib/geo-ref';

/** Autocomplete de municípios (carrega municipios.json só ao focar). */
export default function BuscaMunicipio({ autoFocus = false }: { autoFocus?: boolean }) {
  const [ativo, setAtivo] = useState(autoFocus);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [aberto, setAberto] = useState(false);
  const { linhas, carregando } = useMunicipios(ativo);
  const nav = useNavigate();
  const ref = useRef<HTMLInputElement>(null);

  const res = useMemo(() => {
    const t = semAcento(q.trim());
    if (!linhas || t.length < 2) return [];
    const ini: typeof linhas = [], meio: typeof linhas = [];
    for (const m of linhas) {
      if (m.busca.startsWith(t)) ini.push(m);
      else if (m.busca.includes(t)) meio.push(m);
    }
    const ord = (a: (typeof linhas)[0], b: (typeof linhas)[0]) => b.eleitorado - a.eleitorado;
    return [...ini.sort(ord), ...meio.sort(ord)].slice(0, 10);
  }, [q, linhas]);

  const ir = (i: number) => {
    const m = res[i];
    if (!m) return;
    setQ('');
    setAberto(false);
    nav(`/municipio/${m.uf}/${m.cd}`);
  };

  return (
    <div className="relative">
      <label htmlFor="busca-mun" className="mb-1 block text-sm font-medium">Buscar município</label>
      <input
        id="busca-mun"
        ref={ref}
        type="search"
        autoFocus={autoFocus}
        className="campo w-full py-2 text-base"
        placeholder="Digite o nome da cidade"
        role="combobox"
        aria-expanded={aberto && res.length > 0}
        aria-controls="busca-mun-lista"
        aria-autocomplete="list"
        aria-activedescendant={aberto && res[sel] ? `busca-op-${sel}` : undefined}
        value={q}
        onFocus={() => {
          setAtivo(true);
          setAberto(true);
        }}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
          setAberto(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSel((s) => Math.min(res.length - 1, s + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSel((s) => Math.max(0, s - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            ir(sel);
          } else if (e.key === 'Escape') setAberto(false);
        }}
      />
      {aberto && q.trim().length >= 2 && (
        <ul id="busca-mun-lista" role="listbox" className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {carregando && <li className="px-3 py-2 text-sm text-slate-500">Carregando lista de municípios…</li>}
          {!carregando && res.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Nenhum município encontrado.</li>}
          {res.map((m, i) => (
            <li
              key={m.cd}
              id={`busca-op-${i}`}
              role="option"
              aria-selected={i === sel}
              className={`cursor-pointer px-3 py-2 text-sm ${i === sel ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                ir(i);
              }}
              onMouseEnter={() => setSel(i)}
            >
              {nomeProprio(m.nome)} <span className="text-xs uppercase text-slate-500 dark:text-slate-400">{m.uf === 'zz' ? 'exterior' : m.uf}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
