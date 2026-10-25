import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { RegiaoUF, UFArquivo } from '../types/contrato';
import { useCandidatos, useJson } from '../lib/dados';
import { useEscuro } from '../lib/tema';
import { fmtPct } from '../lib/format';
import { nomeRegiao, nomeUF, UFS } from '../lib/geo-ref';
import Aviso from '../components/Aviso';
import { Carregando, Falha } from '../components/Carregando';
import { CAMADAS, escalaDe, paletaTema, type CamadaId } from './camadas';
import { carregarMalha, type Feat } from './geo';
import { CHAVES_FILTRO, deMunicipio, deRegiaoUF, lerFiltros, passa, type Filtros, type MapaDatum } from './dados';
import MapaSVG from './MapaSVG';
import Legenda from './Legenda';
import TabelaMapa from './TabelaMapa';
import PainelFiltros from './PainelFiltros';

export interface MapaProps {
  ufs: RegiaoUF[];
  /** municípios disponíveis (compacto nacional ou arquivo da UF) */
  municipios: MapaDatum[] | null;
  /** Página de Estado: mostra só os municípios desta UF */
  ufFixa?: string;
  /** Página de Região: restringe à região */
  regiaoFixa?: string;
  /** busca latest/uf/{uf}.json ao detalhar uma UF (tooltip com votos) */
  detalheAoVivo?: boolean;
  versao?: string;
  projecaoDisponivel: boolean;
  destaque?: string | null;
  titulo?: string;
}

type Nivel = { tipo: 'uf' } | { tipo: 'mun' } | { tipo: 'estado'; uf: string };

const NORONHA = '2605459';

export default function Mapa(props: MapaProps) {
  const { ufs, ufFixa, regiaoFixa, projecaoDisponivel } = props;
  const cands = useCandidatos();
  const escuro = useEscuro();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();

  const camada = (CAMADAS.find((c) => c.id === sp.get('camada'))?.id ?? 'lider') as CamadaId;
  const tabela = sp.get('tabela') === '1';
  const pMapa = sp.get('mapa') ?? '';
  const nivel: Nivel = ufFixa
    ? { tipo: 'estado', uf: ufFixa }
    : pMapa === 'mun'
      ? { tipo: 'mun' }
      : pMapa && UFS[pMapa] && pMapa !== 'zz'
        ? { tipo: 'estado', uf: pMapa }
        : { tipo: 'uf' };
  const f = lerFiltros(sp);

  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    setSp(n, { replace: true, preventScrollReset: true });
  };
  const limpar = () => {
    const n = new URLSearchParams(sp);
    CHAVES_FILTRO.forEach((k) => n.delete(k));
    setSp(n, { replace: true, preventScrollReset: true });
  };

  // malha
  const [features, setFeatures] = useState<Feat[] | null>(null);
  const [erroGeo, setErroGeo] = useState<string | null>(null);
  const malha =
    nivel.tipo === 'uf' ? ['geo/br-uf.json', 'uf'] : nivel.tipo === 'mun' ? ['geo/br-mun.json', 'mun'] : [`geo/mun/${nivel.uf}.json`, 'mun'];
  useEffect(() => {
    let vivo = true;
    setFeatures(null);
    setErroGeo(null);
    carregarMalha(malha[0], malha[1])
      .then((fs) => vivo && setFeatures(fs))
      .catch(() => vivo && setErroGeo('Não foi possível carregar o mapa. A tabela abaixo traz os mesmos dados.'));
    return () => {
      vivo = false;
    };
  }, [malha[0], malha[1]]);

  const featuresVis = useMemo(() => {
    if (!features) return null;
    if (!regiaoFixa) return features;
    const ufsReg = new Set(Object.entries(UFS).filter(([, u]) => u.regiao === regiaoFixa).map(([s]) => s));
    return features.filter((ft) => ufsReg.has(ft.properties.sigla ?? ft.properties.uf ?? ''));
  }, [features, regiaoFixa]);

  // detalhe ao vivo da UF (votos por município)
  const ufDetalhe = nivel.tipo === 'estado' && props.detalheAoVivo ? nivel.uf : null;
  const det = useJson<UFArquivo>(ufDetalhe ? `latest/uf/${ufDetalhe}.json` : null, props.versao);

  const dadosUF = useMemo(() => {
    const m = new Map<string, MapaDatum>();
    ufs.forEach((u) => m.set(u.codigo.toLowerCase(), deRegiaoUF(u, cands)));
    return m;
  }, [ufs, cands]);

  const dadosMun = useMemo(() => {
    const m = new Map<string, MapaDatum>();
    if (ufDetalhe && det.data) {
      det.data.municipios.forEach((x) => {
        const d = deMunicipio(x, cands);
        m.set(d.chave, d);
      });
      return m;
    }
    (props.municipios ?? []).forEach((d) => {
      if (nivel.tipo === 'estado' && d.uf !== nivel.uf) return;
      if (regiaoFixa && d.regiao !== regiaoFixa) return;
      m.set(d.chave, d);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.municipios, det.data, ufDetalhe, cands, nivel.tipo, nivel.tipo === 'estado' ? nivel.uf : '', regiaoFixa]);

  const ehMun = nivel.tipo !== 'uf';
  const dadosBrutos = ehMun ? dadosMun : dadosUF;
  // sem projeção disponível, nenhum número do modelo aparece (camada de projeção vazia, tooltip sem projeção)
  const dados = useMemo(() => {
    if (projecaoDisponivel) return dadosBrutos;
    const m = new Map<string, MapaDatum>();
    dadosBrutos.forEach((d, k) => m.set(k, { ...d, projA: null }));
    return m;
  }, [dadosBrutos, projecaoDisponivel]);
  const filtroFn = useMemo(() => (ehMun ? (d: MapaDatum) => passa(d, f, cands) : undefined), [ehMun, sp.toString(), cands]); // eslint-disable-line react-hooks/exhaustive-deps
  const listaTabela = useMemo(() => {
    const l = [...dados.values()].filter((d) => d.uf !== 'zz' && (!regiaoFixa || d.regiao === regiaoFixa));
    return filtroFn ? l.filter(filtroFn) : l;
  }, [dados, filtroFn, regiaoFixa]);

  const paleta = paletaTema(escuro);
  const escala = escalaDe(camada, cands, paleta);
  const maxRestantes = Math.max(1, ...[...dados.values()].map((d) => d.restantes ?? 0));
  const raioMax = nivel.tipo === 'uf' ? 42 : nivel.tipo === 'mun' ? 26 : 30;
  const exterior = ufs.find((u) => u.codigo === 'zz');

  const tituloNivel =
    nivel.tipo === 'uf'
      ? regiaoFixa ? `${nomeRegiao(regiaoFixa)} por estado` : 'Brasil por estado'
      : nivel.tipo === 'mun'
        ? regiaoFixa ? `${nomeRegiao(regiaoFixa)} por município` : 'Brasil por município'
        : `${nomeUF(nivel.uf)} por município`;

  const selecionar = (d: MapaDatum) => {
    if (nivel.tipo === 'uf') {
      setParam('mapa', d.uf);
    } else if (d.cd) {
      navigate(`/municipio/${d.uf}/${d.cd}`);
    }
  };

  return (
    <section className="card" aria-labelledby="mapa-titulo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="mapa-titulo" className="titulo-secao">{props.titulo ?? 'Mapa da apuração'}: {tituloNivel}</h2>
        {!ufFixa && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Nível do mapa">
            <button type="button" className={`btn text-xs ${nivel.tipo === 'uf' ? 'btn-ativo' : ''}`} aria-pressed={nivel.tipo === 'uf'} onClick={() => setParam('mapa', '')}>
              Estados
            </button>
            <button type="button" className={`btn text-xs ${nivel.tipo === 'mun' ? 'btn-ativo' : ''}`} aria-pressed={nivel.tipo === 'mun'} onClick={() => setParam('mapa', 'mun')}>
              Todos os municípios
            </button>
            {nivel.tipo === 'estado' && (
              <Link className="btn text-xs" to={`/uf/${nivel.uf}`}>Página de {nomeUF(nivel.uf)}</Link>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1" role="radiogroup" aria-label="Camada do mapa">
        {CAMADAS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={camada === c.id}
            className={`btn flex-none text-xs ${camada === c.id ? 'btn-ativo' : ''}`}
            onClick={() => setParam('camada', c.id === 'lider' ? '' : c.id)}
          >
            {c.nome}
          </button>
        ))}
      </div>

      {ehMun && (
        <div className="mt-3">
          <PainelFiltros
            f={f}
            set={(k: keyof Filtros, v) => setParam(k, v)}
            limpar={limpar}
            cands={cands}
            ocultar={[...(nivel.tipo === 'estado' ? (['uf', 'regiao'] as const) : []), ...(regiaoFixa ? (['regiao'] as const) : [])]}
            total={[...dados.values()].filter((d) => d.uf !== 'zz').length}
            visiveis={listaTabela.length}
          />
        </div>
      )}

      {camada === 'projecao' && !projecaoDisponivel && (
        <p className="sub mt-3">A projeção ainda não está disponível; o mapa ficará preenchido quando houver dados suficientes.</p>
      )}

      <div className="mt-3 grid gap-3">
        <Legenda camada={camada} escala={escala} semDado={paleta.semDado} maxRestantes={maxRestantes} raioMax={raioMax} />
        {nivel.tipo === 'estado' && !ufFixa && (
          <p className="mini">
            <button type="button" className="link" onClick={() => setParam('mapa', '')}>← Voltar ao Brasil</button>
          </p>
        )}
        {erroGeo ? (
          <Falha texto={erroGeo} />
        ) : !featuresVis || (ehMun && props.municipios == null && !det.data) ? (
          <Carregando texto="Carregando mapa…" altura="h-72" />
        ) : (
          <MapaSVG
            features={featuresVis}
            chaveDe={(ft) => (nivel.tipo === 'uf' ? ft.properties.sigla ?? '' : ft.properties.codarea)}
            dados={dados}
            camada={camada}
            escala={escala}
            paleta={paleta}
            cands={cands}
            passa={filtroFn}
            focavel={nivel.tipo !== 'mun'}
            destaque={props.destaque}
            excluirAjuste={nivel.tipo === 'estado' ? [NORONHA] : undefined}
            raioMax={raioMax}
            maxRestantes={maxRestantes}
            rotulo={`Mapa: ${tituloNivel}, camada ${CAMADAS.find((c) => c.id === camada)?.nome}. Use Tab para percorrer as áreas.`}
            onSelect={selecionar}
          />
        )}
        <p className="mini">
          {nivel.tipo === 'uf' ? 'Toque ou clique num estado para ver os municípios.' : 'Toque ou clique num município para abrir a página dele.'}
          {nivel.tipo === 'mun' && ' No mapa de todos os municípios, use a tabela para navegar pelo teclado.'}
        </p>
      </div>

      {exterior && !ufFixa && (!regiaoFixa || regiaoFixa === 'EXT') && (
        <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-3 text-sm dark:border-slate-600">
          <p className="font-semibold">Exterior <span className="font-normal text-slate-500 dark:text-slate-400">(sem representação no mapa)</span></p>
          <p className="mt-0.5 text-slate-700 dark:text-slate-200">
            {fmtPct(exterior.pct_secoes, 1)} apurado ·{' '}
            {cands.map((c, i) => (
              <span key={c.n}>
                {i > 0 && ' · '}
                <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: c.cor }} />
                {c.nome} {fmtPct(exterior.pct?.[c.n], 1)}
              </span>
            ))}
          </p>
          <Link className="link text-xs" to="/uf/zz">Ver cidades do exterior</Link>
        </div>
      )}

      <div className="mt-3">
        <button type="button" className="btn text-xs" aria-expanded={tabela} onClick={() => setParam('tabela', tabela ? '' : '1')}>
          {tabela ? 'Ocultar tabela' : 'Ver dados do mapa em tabela'}
        </button>
        {tabela && (
          <div className="mt-3">
            <TabelaMapa itens={listaTabela} cands={cands} municipios={ehMun} />
          </div>
        )}
      </div>
      <Aviso className="mt-3" />
    </section>
  );
}
