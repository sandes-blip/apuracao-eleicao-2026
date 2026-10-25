import type { Candidato, Municipio, RegiaoUF } from '../types/contrato';
import type { MunLinha } from '../lib/municipios';
import { semAcento } from '../lib/municipios';
import { nomeProprio, UFS } from '../lib/geo-ref';

/** Dado normalizado de uma área do mapa (UF ou município), qualquer que seja a fonte. */
export interface MapaDatum {
  chave: string; // sigla da UF ou código IBGE de 7 dígitos
  cd?: string;
  nome: string;
  uf: string;
  regiao: string;
  capital: boolean;
  porte?: string;
  eleitorado: number;
  pct_secoes: number;
  pctA: number | null; // % do primeiro candidato (13) entre os válidos apurados
  votos?: { a: number; b: number } | null;
  share1tA: number | null; // 13/(13+22) no 1º turno
  pct1t?: { a: number; b: number } | null; // % dos válidos totais no 1º turno
  swing: number | null;
  projA: number | null;
  restantes: number | null;
  comp: number | null;
  comp1t: number | null;
  status: string;
  lider: 'a' | 'b' | null;
  lider1t: 'a' | 'b' | null;
  virou: boolean;
  busca: string;
}

const lado = (v: number | null | undefined): 'a' | 'b' | null => (v == null || v === 50 ? null : v > 50 ? 'a' : 'b');

export function deRegiaoUF(r: RegiaoUF, [a, b]: Candidato[]): MapaDatum {
  const tem = (r.votos?.[a.n] ?? 0) + (r.votos?.[b.n] ?? 0) > 0;
  const pctA = tem ? r.pct?.[a.n] ?? null : null;
  const share = r.share2_1t?.[a.n] ?? null;
  const l = lado(pctA), l1 = lado(share);
  return {
    chave: r.codigo.toLowerCase(),
    nome: r.nome,
    uf: r.codigo.toLowerCase(),
    regiao: r.regiao,
    capital: false,
    eleitorado: r.eleitorado,
    pct_secoes: r.pct_secoes,
    pctA,
    votos: r.votos ? { a: r.votos[a.n] ?? 0, b: r.votos[b.n] ?? 0 } : null,
    share1tA: share,
    pct1t: r.pct_1t ? { a: r.pct_1t[a.n], b: r.pct_1t[b.n] } : null,
    swing: r.swing_pp,
    projA: r.proj?.pct?.[a.n] ?? null,
    restantes: r.validos_restantes,
    comp: r.pct_comparecimento,
    comp1t: r.pct_comparecimento_1t,
    status: r.status,
    lider: l,
    lider1t: l1,
    virou: !!l && !!l1 && l !== l1,
    busca: semAcento(r.nome),
  };
}

export function deLinha(m: MunLinha): MapaDatum {
  return {
    chave: m.ibge || `cd${m.cd}`,
    cd: m.cd,
    nome: nomeProprio(m.nome),
    uf: m.uf,
    regiao: UFS[m.uf]?.regiao ?? '',
    capital: m.capital,
    porte: m.porte,
    eleitorado: m.eleitorado,
    pct_secoes: m.pct_secoes,
    pctA: m.pct_a,
    votos: null,
    share1tA: m.share2_1t_a,
    pct1t: null,
    swing: m.swing_pp,
    projA: m.proj_a,
    restantes: m.validos_restantes,
    comp: m.pct_comp,
    comp1t: m.pct_comp_1t,
    status: m.status,
    lider: m.lider,
    lider1t: m.lider_1t,
    virou: m.virou,
    busca: m.busca,
  };
}

export function deMunicipio(m: Municipio, [a, b]: Candidato[]): MapaDatum {
  const tem = (m.votos?.[a.n] ?? 0) + (m.votos?.[b.n] ?? 0) > 0;
  const pctA = tem ? m.pct?.[a.n] ?? null : null;
  const share = m.share2_1t?.[a.n] ?? null;
  const l = m.lider ? (m.lider === a.n ? 'a' : 'b') : lado(pctA);
  const l1 = m.lider_1t ? (m.lider_1t === a.n ? 'a' : 'b') : lado(share);
  return {
    chave: m.ibge || `cd${m.cd}`,
    cd: m.cd,
    nome: nomeProprio(m.nome),
    uf: m.uf,
    regiao: UFS[m.uf]?.regiao ?? '',
    capital: m.capital,
    porte: m.porte,
    eleitorado: m.eleitorado,
    pct_secoes: m.pct_secoes,
    pctA,
    votos: m.votos ? { a: m.votos[a.n] ?? 0, b: m.votos[b.n] ?? 0 } : null,
    share1tA: share,
    pct1t: m.pct_1t ? { a: m.pct_1t[a.n], b: m.pct_1t[b.n] } : null,
    swing: m.swing_pp,
    projA: m.proj_pct?.[a.n] ?? null,
    restantes: m.validos_restantes,
    comp: m.pct_comparecimento,
    comp1t: m.pct_comparecimento_1t,
    status: m.status,
    lider: l,
    lider1t: l1,
    virou: m.virou_vs_1t ?? (!!l && !!l1 && l !== l1),
    busca: semAcento(m.nome),
  };
}

/** Filtros de municípios (todos espelhados na query string). */
export interface Filtros {
  regiao: string;
  uf: string;
  q: string;
  tipo: string; // capital | interior
  porte: string;
  situacao: string;
  lider: string; // número do candidato
  virou: string; // '1'
  swing: string; // número do candidato que mais cresceu
}

export const CHAVES_FILTRO: (keyof Filtros)[] = ['regiao', 'uf', 'q', 'tipo', 'porte', 'situacao', 'lider', 'virou', 'swing'];
export const LIMIAR_SWING = 3;

export function lerFiltros(sp: URLSearchParams): Filtros {
  const f = {} as Filtros;
  for (const k of CHAVES_FILTRO) f[k] = sp.get(k) ?? '';
  return f;
}

export const filtrosAtivos = (f: Filtros) => CHAVES_FILTRO.some((k) => f[k]);

export function passa(d: MapaDatum, f: Filtros, [a, b]: Candidato[]): boolean {
  if (f.regiao && d.regiao !== f.regiao) return false;
  if (f.uf && d.uf !== f.uf) return false;
  if (f.q && !d.busca.includes(semAcento(f.q))) return false;
  if (f.tipo === 'capital' && !d.capital) return false;
  if (f.tipo === 'interior' && d.capital) return false;
  if (f.porte && d.porte !== f.porte) return false;
  if (f.situacao && d.status !== f.situacao) return false;
  if (f.lider) {
    const l = f.lider === a.n ? 'a' : f.lider === b.n ? 'b' : null;
    if (d.lider !== l) return false;
  }
  if (f.virou === '1' && !d.virou) return false;
  if (f.swing) {
    if (d.swing == null) return false;
    if (f.swing === a.n && d.swing < LIMIAR_SWING) return false;
    if (f.swing === b.n && d.swing > -LIMIAR_SWING) return false;
  }
  return true;
}
