import type { MunicipiosCompacto, Porte, StatusEntidade } from '../types/contrato';

/** Linha do municipios.json já decodificada pelos `campos` (nunca por posição fixa). */
export interface MunLinha {
  cd: string;
  ibge: string | null;
  uf: string;
  nome: string;
  capital: boolean;
  porte: Porte;
  eleitorado: number;
  pct_secoes: number;
  pct_a: number | null;
  share2_1t_a: number | null;
  swing_pp: number | null;
  proj_a: number | null;
  validos_restantes: number | null;
  pct_comp: number | null;
  pct_comp_1t: number | null;
  status: StatusEntidade;
  /** derivados */
  lider: 'a' | 'b' | null;
  lider_1t: 'a' | 'b' | null;
  virou: boolean;
  busca: string;
}

export const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const lado = (v: number | null): 'a' | 'b' | null => (v == null || v === 50 ? null : v > 50 ? 'a' : 'b');

export function decodificar(c: MunicipiosCompacto): MunLinha[] {
  const idx: Record<string, number> = {};
  c.campos.forEach((k, i) => (idx[k] = i));
  const g = (row: unknown[], k: string) => (idx[k] === undefined ? null : row[idx[k]]);
  const num = (v: unknown) => (typeof v === 'number' && !Number.isNaN(v) ? v : null);
  return c.dados.map((row) => {
    const pct_a = num(g(row, 'pct_a'));
    const share = num(g(row, 'share2_1t_a'));
    const lider = lado(pct_a);
    const lider_1t = lado(share);
    const nome = String(g(row, 'nome') ?? '');
    const ibge = g(row, 'ibge');
    return {
      cd: String(g(row, 'cd') ?? ''),
      ibge: ibge == null || ibge === '' ? null : String(ibge),
      uf: String(g(row, 'uf') ?? '').toLowerCase(),
      nome,
      capital: g(row, 'capital') === true,
      porte: (g(row, 'porte') ?? 'ate10k') as Porte,
      eleitorado: num(g(row, 'eleitorado')) ?? 0,
      pct_secoes: num(g(row, 'pct_secoes')) ?? 0,
      pct_a,
      share2_1t_a: share,
      swing_pp: num(g(row, 'swing_pp')),
      proj_a: num(g(row, 'proj_a')),
      validos_restantes: num(g(row, 'validos_restantes')),
      pct_comp: num(g(row, 'pct_comp')),
      pct_comp_1t: num(g(row, 'pct_comp_1t')),
      status: (g(row, 'status') ?? 'nao_iniciada') as StatusEntidade,
      lider,
      lider_1t,
      virou: lider != null && lider_1t != null && lider !== lider_1t,
      busca: semAcento(nome),
    };
  });
}
