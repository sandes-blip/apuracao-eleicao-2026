// Tipos do contrato JSON (docs/contrato-json.md). O portal só lê estes arquivos.

export type NumCand = string; // "13" | "22"
export type PorCand<T> = Record<NumCand, T>;

export type StatusApuracao = 'aguardando' | 'ao_vivo' | 'parado' | 'final';
export type StatusEntidade = 'nao_iniciada' | 'parcial' | 'concluida';
export type Confianca = 'insuficiente' | 'baixa' | 'media' | 'alta';
export type Porte = 'ate10k' | '10a50k' | '50a200k' | '200ka1m' | 'acima1m';

export interface Candidato {
  n: NumCand;
  nome: string;
  partido: string;
  cor: string;
  foto?: string | null;
}

export interface Apuracao {
  pct_secoes: number;
  secoes_tot: number;
  secoes_total: number;
  eleitorado: number;
  eleitorado_apurado: number;
  comparecimento: number;
  abstencao: number;
  pct_comparecimento: number | null;
  pct_comparecimento_1t: number | null;
  validos: number;
  brancos: number;
  nulos: number;
  votos: PorCand<number>;
  pct: PorCand<number>;
  pct_1t?: PorCand<number> | null;
  dif_votos: number;
  dif_pp: number;
  lider: NumCand | null;
  eleito: NumCand | null;
  definido_tse: boolean;
}

export interface Virada {
  atras: NumCand;
  pct_necessario: number;
  pct_projetado: number;
}

export interface Projecao {
  disponivel: boolean;
  motivo: string | null;
  confianca: Confianca;
  tendencia_consolidada: boolean;
  p1?: { pct: PorCand<number> } | null;
  p2?: {
    pct: PorCand<number>;
    ic95: PorCand<[number, number]>;
    prob: PorCand<number>;
    votos: PorCand<number>;
    validos_total: number;
  } | null;
  validos_restantes?: number | null;
  eleitores_restantes?: number | null;
  saldo_esperado?: number | null;
  vantagem_supera_restantes?: boolean;
  virada?: Virada | null;
  ponto_virada_pct_secoes?: number | null;
  divergencia_p1_p2?: boolean;
  modelo?: { n_municipios_ajuste?: number; swing_nacional_pp?: number; versao?: string } | null;
}

export interface RegiaoUF {
  codigo: string;
  nome: string;
  regiao: string;
  pct_secoes: number;
  eleitorado: number;
  eleitorado_apurado: number;
  votos: PorCand<number>;
  pct: PorCand<number>;
  pct_1t?: PorCand<number> | null;
  share2_1t?: PorCand<number> | null;
  swing_pp: number | null;
  pct_comparecimento: number | null;
  pct_comparecimento_1t: number | null;
  validos_restantes: number | null;
  saldo_esperado: number | null;
  proj?: {
    pct: PorCand<number>;
    ic95?: PorCand<[number, number]> | null;
    prob?: PorCand<number> | null;
  } | null;
  proj_p1?: PorCand<number> | null;
  status: StatusEntidade;
}

export interface AnaliseIA {
  titulo: string;
  resumo: string;
  destaques?: string[];
  o_que_falta?: string | null;
  confianca?: Confianca | null;
  aviso?: string | null;
  momento: string;
  origem: 'ia' | 'template' | string;
}

export interface Evento {
  momento: string;
  tipo: string;
  texto: string;
  abrangencia: string;
}

export interface BR {
  gerado_em: string;
  eleicao: string;
  titulo: string;
  status: StatusApuracao;
  atualizado_tse: string | null;
  candidatos: Candidato[];
  apuracao: Apuracao;
  projecao: Projecao;
  regioes: RegiaoUF[];
  ufs: RegiaoUF[];
  ia: AnaliseIA | null;
  eventos_recentes?: Evento[] | null;
  aviso?: string;
}

export interface Municipio {
  cd: string;
  ibge: string | null;
  nome: string;
  uf: string;
  capital: boolean;
  porte: Porte;
  eleitorado: number;
  pct_secoes: number;
  votos: PorCand<number>;
  pct: PorCand<number> | null;
  pct_1t?: PorCand<number> | null;
  share2_1t?: PorCand<number> | null;
  swing_pp: number | null;
  proj_pct?: PorCand<number> | null;
  validos_restantes: number | null;
  pct_comparecimento: number | null;
  pct_comparecimento_1t: number | null;
  status: StatusEntidade;
  lider_1t?: NumCand | null;
  lider?: NumCand | null;
  virou_vs_1t?: boolean;
}

export interface UFArquivo {
  gerado_em: string;
  uf: string;
  nome: string;
  regiao: string;
  resumo: RegiaoUF;
  municipios: Municipio[];
}

export interface MunicipiosCompacto {
  gerado_em: string;
  campos: string[];
  dados: unknown[][];
}

export interface PontoTimeline {
  momento: string;
  pct_secoes: number;
  pct: PorCand<number> | null;
  p1?: PorCand<number> | null;
  p2?: PorCand<number> | null;
  ic95?: PorCand<[number, number]> | null;
  prob?: PorCand<number> | null;
  confianca?: Confianca | null;
}

export interface Timeline {
  pontos: PontoTimeline[];
}

export interface Status {
  gerado_em: string;
  status: StatusApuracao;
  atualizado_tse: string | null;
  segundos_desde_tse: number | null;
  coletor?: Record<string, unknown>;
  motor?: Record<string, unknown>;
  alertas?: unknown[];
}

export interface ReplayIndice {
  eleicoes: { id: string; titulo: string }[];
}

export interface ReplayEleicao {
  eleicao: string;
  titulo: string;
  momentos: { id: string; momento: string; pct_secoes: number }[];
}

export interface ReplayMomento {
  br: BR;
  municipios: MunicipiosCompacto;
}
