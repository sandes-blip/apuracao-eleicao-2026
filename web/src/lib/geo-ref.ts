// Referências fixas: regiões e UFs (nomes para exibição).
export const REGIOES: { codigo: string; nome: string }[] = [
  { codigo: 'N', nome: 'Norte' },
  { codigo: 'NE', nome: 'Nordeste' },
  { codigo: 'CO', nome: 'Centro-Oeste' },
  { codigo: 'SE', nome: 'Sudeste' },
  { codigo: 'S', nome: 'Sul' },
  { codigo: 'EXT', nome: 'Exterior' },
];

export const UFS: Record<string, { nome: string; regiao: string }> = {
  ac: { nome: 'Acre', regiao: 'N' }, am: { nome: 'Amazonas', regiao: 'N' }, ap: { nome: 'Amapá', regiao: 'N' },
  pa: { nome: 'Pará', regiao: 'N' }, ro: { nome: 'Rondônia', regiao: 'N' }, rr: { nome: 'Roraima', regiao: 'N' },
  to: { nome: 'Tocantins', regiao: 'N' },
  al: { nome: 'Alagoas', regiao: 'NE' }, ba: { nome: 'Bahia', regiao: 'NE' }, ce: { nome: 'Ceará', regiao: 'NE' },
  ma: { nome: 'Maranhão', regiao: 'NE' }, pb: { nome: 'Paraíba', regiao: 'NE' }, pe: { nome: 'Pernambuco', regiao: 'NE' },
  pi: { nome: 'Piauí', regiao: 'NE' }, rn: { nome: 'Rio Grande do Norte', regiao: 'NE' }, se: { nome: 'Sergipe', regiao: 'NE' },
  df: { nome: 'Distrito Federal', regiao: 'CO' }, go: { nome: 'Goiás', regiao: 'CO' }, ms: { nome: 'Mato Grosso do Sul', regiao: 'CO' },
  mt: { nome: 'Mato Grosso', regiao: 'CO' },
  es: { nome: 'Espírito Santo', regiao: 'SE' }, mg: { nome: 'Minas Gerais', regiao: 'SE' }, rj: { nome: 'Rio de Janeiro', regiao: 'SE' },
  sp: { nome: 'São Paulo', regiao: 'SE' },
  pr: { nome: 'Paraná', regiao: 'S' }, rs: { nome: 'Rio Grande do Sul', regiao: 'S' }, sc: { nome: 'Santa Catarina', regiao: 'S' },
  zz: { nome: 'Exterior', regiao: 'EXT' },
};

export const nomeRegiao = (c: string) => REGIOES.find((r) => r.codigo === c.toUpperCase())?.nome ?? c;
export const nomeUF = (uf: string) => UFS[uf.toLowerCase()]?.nome ?? uf.toUpperCase();

export const PORTES: { v: string; nome: string }[] = [
  { v: 'ate10k', nome: 'Até 10 mil eleitores' },
  { v: '10a50k', nome: '10 a 50 mil' },
  { v: '50a200k', nome: '50 a 200 mil' },
  { v: '200ka1m', nome: '200 mil a 1 milhão' },
  { v: 'acima1m', nome: 'Acima de 1 milhão' },
];

export const STATUS_NOME: Record<string, string> = {
  nao_iniciada: 'Não iniciada',
  parcial: 'Parcial',
  concluida: 'Concluída',
};

export const CONFIANCA_NOME: Record<string, string> = {
  insuficiente: 'Dados insuficientes',
  baixa: 'Confiança baixa',
  media: 'Confiança média',
  alta: 'Confiança alta',
};

/** Nome exibível de um município (TSE publica em maiúsculas). */
export function nomeProprio(s: string): string {
  const minusc = new Set(['de', 'da', 'do', 'das', 'dos', 'e', "d'", 'del']);
  return s
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((w, i) => (i > 0 && minusc.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');
}

export const AVISO = 'Projeção estatística independente. Não é resultado oficial. Resultado oficial: TSE.';
