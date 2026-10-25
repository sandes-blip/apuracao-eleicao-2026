import { interpolateRgb } from 'd3-interpolate';
import type { Candidato } from '../types/contrato';
import type { MapaDatum } from './dados';
import { fmtPct, fmtPP } from '../lib/format';

export type CamadaId = 'lider' | 'apurado' | 'swing' | 'projecao' | 'faltam' | 'comparecimento';

export const CAMADAS: { id: CamadaId; nome: string }[] = [
  { id: 'lider', nome: 'Quem lidera' },
  { id: 'apurado', nome: '% apurado' },
  { id: 'swing', nome: 'Variação x 1º turno' },
  { id: 'projecao', nome: 'Projeção final' },
  { id: 'faltam', nome: 'Votos que faltam' },
  { id: 'comparecimento', nome: 'Comparecimento x 1º turno' },
];

export interface Paleta {
  neutro: string;
  semDado: string;
  seqIni: string;
  seqFim: string;
  borda: string;
}

export const paletaTema = (escuro: boolean): Paleta =>
  escuro
    ? { neutro: '#475569', semDado: '#1e293b', seqIni: '#1e293b', seqFim: '#f1f5f9', borda: '#0b1220' }
    : { neutro: '#e5e7eb', semDado: '#f8fafc', seqIni: '#f1f5f9', seqFim: '#0f172a', borda: '#ffffff' };

const COMP_MAIS = '#0f766e';
const COMP_MENOS = '#7e22ce';

export interface Escala {
  valor: (d: MapaDatum) => number | null;
  cor: (v: number | null) => string;
  dominio: [number, number];
  ticks: number[];
  fmtTick: (v: number) => string;
  rotulos?: [string, string];
  descricao: string;
}

function divergente(neg: string, pos: string, neutro: string, lim: number) {
  const ip = interpolateRgb(neutro, pos);
  const ineg = interpolateRgb(neutro, neg);
  return (v: number) => {
    const t = Math.min(1, Math.abs(v) / lim);
    const e = 0.15 + 0.85 * Math.pow(t, 0.85);
    return v >= 0 ? ip(v === 0 ? 0 : e) : ineg(e);
  };
}

export function escalaDe(id: CamadaId, [a, b]: Candidato[], p: Paleta): Escala {
  const prim = a.nome.split(' ')[0];
  const seg = b.nome.split(' ')[0];
  const margem = (lim: number) => {
    const f = divergente(b.cor, a.cor, p.neutro, lim);
    return (v: number | null) => (v == null ? p.semDado : f(v));
  };
  switch (id) {
    case 'lider':
      return {
        valor: (d) => (d.pctA == null ? null : 2 * d.pctA - 100),
        cor: margem(40),
        dominio: [-40, 40],
        ticks: [-40, -20, 0, 20, 40],
        fmtTick: (v) => (v === 0 ? '0' : `${Math.abs(v)}`),
        rotulos: [`${seg} à frente`, `${prim} à frente`],
        descricao: 'Diferença entre os dois, em pontos percentuais dos votos válidos apurados.',
      };
    case 'projecao':
      return {
        valor: (d) => (d.projA == null ? null : 2 * d.projA - 100),
        cor: margem(40),
        dominio: [-40, 40],
        ticks: [-40, -20, 0, 20, 40],
        fmtTick: (v) => (v === 0 ? '0' : `${Math.abs(v)}`),
        rotulos: [`${seg} à frente`, `${prim} à frente`],
        descricao: 'Diferença projetada ao final, em pontos percentuais. Projeção estatística, não é resultado oficial.',
      };
    case 'swing':
      return {
        valor: (d) => d.swing,
        cor: margem(10),
        dominio: [-10, 10],
        ticks: [-10, -5, 0, 5, 10],
        fmtTick: (v) => (v === 0 ? '0' : `${Math.abs(v)}`),
        rotulos: [`${seg} cresceu`, `${prim} cresceu`],
        descricao: 'Variação em pontos percentuais em relação ao 1º turno (divisão entre os dois finalistas).',
      };
    case 'apurado': {
      const f = interpolateRgb(p.seqIni, p.seqFim);
      return {
        valor: (d) => d.pct_secoes,
        cor: (v) => (v == null ? p.semDado : f(Math.max(0, Math.min(1, v / 100)))),
        dominio: [0, 100],
        ticks: [0, 25, 50, 75, 100],
        fmtTick: (v) => `${v}%`,
        descricao: 'Percentual de seções já totalizadas.',
      };
    }
    case 'comparecimento': {
      const f = divergente(COMP_MENOS, COMP_MAIS, p.neutro, 5);
      return {
        valor: (d) => (d.comp == null || d.comp1t == null ? null : d.comp - d.comp1t),
        cor: (v) => (v == null ? p.semDado : f(v)),
        dominio: [-5, 5],
        ticks: [-5, -2.5, 0, 2.5, 5],
        fmtTick: (v) => (v === 0 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v)}`),
        rotulos: ['Menor que no 1º turno', 'Maior que no 1º turno'],
        descricao: 'Diferença de comparecimento em relação ao 1º turno, em pontos percentuais.',
      };
    }
    case 'faltam':
      return {
        valor: (d) => d.restantes,
        cor: () => p.neutro,
        dominio: [0, 1],
        ticks: [],
        fmtTick: () => '',
        descricao: 'Círculos proporcionais aos votos válidos estimados que ainda faltam apurar.',
      };
  }
}

export function textoValor(id: CamadaId, d: MapaDatum, [a, b]: Candidato[]): string {
  switch (id) {
    case 'lider':
      if (d.pctA == null) return 'sem votos apurados';
      return d.pctA === 50 ? 'empate' : `${d.pctA > 50 ? a.nome : b.nome} à frente por ${fmtPP(Math.abs(2 * d.pctA - 100)).replace('+', '')}`;
    case 'projecao':
      return d.projA == null ? 'sem projeção' : `projeção: ${a.nome} ${fmtPct(d.projA, 1)}, ${b.nome} ${fmtPct(100 - d.projA, 1)}`;
    case 'swing':
      return d.swing == null ? 'sem variação calculada' : `variação ${fmtPP(d.swing)} para ${a.nome}`;
    case 'apurado':
      return `${fmtPct(d.pct_secoes, 1)} apurado`;
    case 'comparecimento':
      return d.comp == null || d.comp1t == null ? 'sem dado de comparecimento' : `comparecimento ${fmtPP(d.comp - d.comp1t)} x 1º turno`;
    case 'faltam':
      return `faltam cerca de ${d.restantes == null ? '-' : Math.round(d.restantes).toLocaleString('pt-BR')} votos válidos`;
  }
}
