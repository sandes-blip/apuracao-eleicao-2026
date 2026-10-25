import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { BR, Candidato, MunicipiosCompacto, Status } from '../types/contrato';
import { ErroHttp, getJson, POLL_MS } from './api';
import { decodificar, type MunLinha } from './municipios';

interface Dados {
  br: BR | null;
  status: Status | null;
  /** instante local (ms) em que o status.json foi recebido */
  statusRecebidoEm: number;
  erro: string | null;
  semDados: boolean;
  carregando: boolean;
  /** chave que muda quando o motor publica um novo br.json */
  versao: string;
}

const Ctx = createContext<Dados>({
  br: null, status: null, statusRecebidoEm: 0, erro: null, semDados: false, carregando: true, versao: '',
});

export function DadosProvider({ children }: { children: ReactNode }) {
  const [d, setD] = useState<Dados>({
    br: null, status: null, statusRecebidoEm: 0, erro: null, semDados: false, carregando: true, versao: '',
  });

  useEffect(() => {
    let vivo = true;
    let timer: number | undefined;
    const ciclo = async () => {
      const [rb, rs] = await Promise.allSettled([getJson<BR>('latest/br.json'), getJson<Status>('status.json')]);
      if (!vivo) return;
      setD((prev) => {
        const next = { ...prev, carregando: false };
        if (rb.status === 'fulfilled') {
          next.br = rb.value;
          next.versao = rb.value.gerado_em;
          next.erro = null;
          next.semDados = false;
        } else {
          const e = rb.reason;
          if (e instanceof ErroHttp && e.status === 404) next.semDados = true;
          else next.erro = 'Não foi possível atualizar os dados agora. Nova tentativa em 30 segundos.';
        }
        if (rs.status === 'fulfilled') {
          next.status = rs.value;
          next.statusRecebidoEm = Date.now();
        }
        return next;
      });
    };
    const agenda = () => {
      timer = window.setTimeout(async () => {
        if (document.visibilityState === 'visible') await ciclo();
        agenda();
      }, POLL_MS);
    };
    ciclo().then(agenda);
    const onVis = () => {
      if (document.visibilityState === 'visible') ciclo();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      vivo = false;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return <Ctx.Provider value={d}>{children}</Ctx.Provider>;
}

export const useDados = () => useContext(Ctx);

/** Candidatos padrão enquanto o br.json não chega (mesma ordem fixa: 13, 22). */
const PADRAO: Candidato[] = [
  { n: '13', nome: 'Lula', partido: 'PT', cor: '#2563eb', foto: null },
  { n: '22', nome: 'Flávio Bolsonaro', partido: 'PL', cor: '#d97706', foto: null },
];

/** Contexto alternativo de candidatos (usado pelo Replay). */
export const CandidatosCtx = createContext<Candidato[] | null>(null);

export function useCandidatos(): Candidato[] {
  const override = useContext(CandidatosCtx);
  const { br } = useDados();
  const c = override ?? br?.candidatos;
  return c && c.length >= 2 ? c : PADRAO;
}

/** Aplica as cores dos candidatos como variáveis CSS (--c13, --c22 = primeiro e segundo). */
export function useCoresCSS() {
  const c = useCandidatos();
  useEffect(() => {
    const r = document.documentElement.style;
    r.setProperty('--c13', c[0].cor);
    r.setProperty('--c22', c[1].cor);
  }, [c]);
}

/** Busca genérica de um JSON, refeita quando `chave` muda. */
export function useJson<T>(path: string | null, chave = '') {
  const [st, setSt] = useState<{ data: T | null; erro: string | null; carregando: boolean; status?: number }>({
    data: null, erro: null, carregando: !!path,
  });
  const pathAnterior = useRef<string | null>(null);
  useEffect(() => {
    if (!path) {
      setSt({ data: null, erro: null, carregando: false });
      return;
    }
    const ctrl = new AbortController();
    const trocouPath = pathAnterior.current !== path;
    pathAnterior.current = path;
    if (trocouPath) setSt({ data: null, erro: null, carregando: true });
    getJson<T>(path, ctrl.signal)
      .then((data) => setSt({ data, erro: null, carregando: false }))
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setSt((s) => ({
          data: trocouPath ? null : s.data,
          erro: e instanceof ErroHttp && e.status === 404 ? 'Dados ainda não publicados.' : 'Falha ao carregar os dados.',
          carregando: false,
          status: e instanceof ErroHttp ? e.status : undefined,
        }));
      });
    return () => ctrl.abort();
  }, [path, chave]);
  return st;
}

/** municipios.json decodificado; recarrega quando o br.json muda. */
export function useMunicipios(ativo = true) {
  const { versao } = useDados();
  const r = useJson<MunicipiosCompacto>(ativo ? 'latest/municipios.json' : null, versao);
  const [linhas, setLinhas] = useState<MunLinha[] | null>(null);
  useEffect(() => {
    if (r.data) setLinhas(decodificar(r.data));
  }, [r.data]);
  return { linhas, erro: r.erro, carregando: r.carregando && !linhas };
}
