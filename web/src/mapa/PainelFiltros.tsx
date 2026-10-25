import type { Candidato } from '../types/contrato';
import { PORTES, REGIOES, STATUS_NOME, UFS } from '../lib/geo-ref';
import { CHAVES_FILTRO, LIMIAR_SWING, type Filtros } from './dados';

interface Props {
  f: Filtros;
  set: (k: keyof Filtros, v: string) => void;
  limpar: () => void;
  cands: Candidato[];
  ocultar?: (keyof Filtros)[];
  total: number;
  visiveis: number;
}

/** Filtros de municípios. Cada mudança vai para a URL. */
export default function PainelFiltros({ f, set, limpar, cands, ocultar = [], total, visiveis }: Props) {
  const [a, b] = cands;
  const mostra = (k: keyof Filtros) => !ocultar.includes(k);
  const Sel = ({ k, rotulo, opcoes }: { k: keyof Filtros; rotulo: string; opcoes: { v: string; nome: string }[] }) =>
    mostra(k) ? (
      <label className="flex min-w-0 flex-col gap-0.5 text-xs font-medium text-slate-700 dark:text-slate-200">
        {rotulo}
        <select className="campo" value={f[k]} onChange={(e) => set(k, e.target.value)}>
          <option value="">Todos</option>
          {opcoes.map((o) => (
            <option key={o.v} value={o.v}>{o.nome}</option>
          ))}
        </select>
      </label>
    ) : null;
  const ativos = CHAVES_FILTRO.filter((k) => f[k] && mostra(k)).length;
  return (
    <fieldset className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <legend className="px-1 text-sm font-semibold">Filtrar municípios</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {mostra('q') && (
          <label className="col-span-2 flex flex-col gap-0.5 text-xs font-medium text-slate-700 dark:text-slate-200 sm:col-span-1">
            Nome
            <input className="campo" type="search" value={f.q} placeholder="Ex.: Campinas" onChange={(e) => set('q', e.target.value)} />
          </label>
        )}
        <Sel k="regiao" rotulo="Região" opcoes={REGIOES.filter((r) => r.codigo !== 'EXT').map((r) => ({ v: r.codigo, nome: r.nome }))} />
        <Sel k="uf" rotulo="Estado" opcoes={Object.entries(UFS).filter(([s]) => s !== 'zz').map(([v, u]) => ({ v, nome: u.nome })).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'))} />
        <Sel k="tipo" rotulo="Tipo" opcoes={[{ v: 'capital', nome: 'Capital' }, { v: 'interior', nome: 'Demais municípios' }]} />
        <Sel k="porte" rotulo="Eleitorado" opcoes={PORTES} />
        <Sel k="situacao" rotulo="Apuração" opcoes={Object.entries(STATUS_NOME).map(([v, nome]) => ({ v, nome }))} />
        <Sel k="lider" rotulo="Quem lidera" opcoes={[{ v: a.n, nome: a.nome }, { v: b.n, nome: b.nome }]} />
        <Sel k="virou" rotulo="Virada x 1º turno" opcoes={[{ v: '1', nome: 'Líder mudou desde o 1º turno' }]} />
        <Sel
          k="swing"
          rotulo="Variação x 1º turno"
          opcoes={[
            { v: a.n, nome: `${a.nome} cresceu ${LIMIAR_SWING} p.p. ou mais` },
            { v: b.n, nome: `${b.nome} cresceu ${LIMIAR_SWING} p.p. ou mais` },
          ]}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
        <span aria-live="polite">
          {visiveis.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')} municípios atendem aos filtros
        </span>
        {ativos > 0 && (
          <button type="button" className="btn text-xs" onClick={limpar}>
            Limpar filtros ({ativos})
          </button>
        )}
      </div>
    </fieldset>
  );
}
