import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Timeline, UFArquivo } from '../types/contrato';
import { useCandidatos, useDados, useJson } from '../lib/dados';
import { deMunicipio } from '../mapa/dados';
import { nomeRegiao, UFS } from '../lib/geo-ref';
import { fmtPct, fmtPP, horaISO } from '../lib/format';
import Placar from '../components/Placar';
import ProjecaoEntidade from '../components/ProjecaoEntidade';
import { Graficos, Mapa } from '../components/Lazy';
import { Carregando, Falha } from '../components/Carregando';
import NaoEncontrada from './NaoEncontrada';
import TabelaMunicipios from '../components/TabelaMunicipios';

export default function Estado() {
  const { uf = '' } = useParams();
  const sigla = uf.toLowerCase();
  const { br, versao } = useDados();
  const cands = useCandidatos();
  const valido = !!UFS[sigla];
  const arq = useJson<UFArquivo>(valido ? `latest/uf/${sigla}.json` : null, versao);
  const tl = useJson<Timeline>(valido ? `timeline/uf/${sigla}.json` : null, versao);
  const munDatum = useMemo(() => (arq.data ? arq.data.municipios.map((m) => deMunicipio(m, cands)) : null), [arq.data, cands]);

  if (!valido) return <NaoEncontrada />;
  if (arq.carregando && !arq.data) return <Carregando />;
  if (!arq.data) return <Falha texto={arq.erro ?? 'Dados indisponíveis.'} />;
  const { resumo: r } = arq.data;
  const [a, b] = cands;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <p className="mini">
          <Link className="link" to="/">Brasil</Link> / <Link className="link" to={`/regiao/${arq.data.regiao}`}>{nomeRegiao(arq.data.regiao)}</Link> / Estado
        </p>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{arq.data.nome}</h1>
        <p className="sub">Dados gerados às {horaISO(arq.data.gerado_em)}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Placar titulo={`Placar oficial: ${r.nome}`} pct={r.pct} votos={r.votos} pctSecoes={r.pct_secoes} />
        <ProjecaoEntidade r={r} disponivelBR={br?.projecao.disponivel ?? true} motivo={br?.projecao.motivo} />
      </div>

      <section className="card">
        <h2 className="titulo-secao">Comparação com o 1º turno</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[a, b].map((c) => (
            <div key={c.n}>
              <dt className="mini">{c.nome} no 1º turno (dos válidos)</dt>
              <dd className="text-lg font-semibold tabular-nums">{fmtPct(r.pct_1t?.[c.n], 1)}</dd>
            </div>
          ))}
          <div>
            <dt className="mini">Divisão entre os dois no 1º turno</dt>
            <dd className="text-lg font-semibold tabular-nums">{r.share2_1t ? `${fmtPct(r.share2_1t[a.n], 1)} × ${fmtPct(r.share2_1t[b.n], 1)}` : '-'}</dd>
          </div>
          <div>
            <dt className="mini">Variação para {a.nome} (mesmos municípios)</dt>
            <dd className="text-lg font-semibold tabular-nums">{fmtPP(r.swing_pp)}</dd>
          </div>
          <div>
            <dt className="mini">Comparecimento</dt>
            <dd className="text-lg font-semibold tabular-nums">{fmtPct(r.pct_comparecimento, 1)}</dd>
          </div>
          <div>
            <dt className="mini">Comparecimento no 1º turno</dt>
            <dd className="text-lg font-semibold tabular-nums">{fmtPct(r.pct_comparecimento_1t, 1)}</dd>
          </div>
        </dl>
      </section>

      {tl.data && <Graficos pontos={tl.data.pontos} />}
      {sigla !== 'zz' && munDatum && (
        <Mapa ufs={br?.ufs ?? []} municipios={munDatum} ufFixa={sigla} projecaoDisponivel={br?.projecao.disponivel ?? true} />
      )}
      <TabelaMunicipios municipios={arq.data.municipios} titulo={sigla === 'zz' ? 'Cidades do exterior' : 'Ranking dos municípios'} comProjecao={br?.projecao.disponivel ?? true} />
    </div>
  );
}
