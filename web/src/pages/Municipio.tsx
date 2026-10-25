import { Link, useParams } from 'react-router-dom';
import type { UFArquivo } from '../types/contrato';
import { useCandidatos, useDados, useJson } from '../lib/dados';
import { nomeProprio, nomeUF, PORTES, STATUS_NOME } from '../lib/geo-ref';
import { fmtInt, fmtPct, fmtPP, fmtVotosCurto } from '../lib/format';
import { deMunicipio } from '../mapa/dados';
import Placar from '../components/Placar';
import Aviso from '../components/Aviso';
import BuscaMunicipio from '../components/BuscaMunicipio';
import { Mapa } from '../components/Lazy';
import { Carregando, Falha } from '../components/Carregando';
import { useMemo } from 'react';

export default function Municipio() {
  const { uf, cd } = useParams();
  const { versao, br } = useDados();
  const cands = useCandidatos();
  const arq = useJson<UFArquivo>(uf ? `latest/uf/${uf.toLowerCase()}.json` : null, versao);
  const munDatum = useMemo(() => (arq.data ? arq.data.municipios.map((m) => deMunicipio(m, cands)) : null), [arq.data, cands]);

  if (!uf || !cd) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Resultados por município</h1>
        <div className="card">
          <BuscaMunicipio autoFocus />
          <p className="mini mt-2">Busque entre todos os municípios do Brasil e as cidades do exterior.</p>
        </div>
      </div>
    );
  }
  if (arq.carregando && !arq.data) return <Carregando />;
  if (!arq.data) return <Falha texto={arq.erro ?? 'Dados indisponíveis.'} />;
  const m = arq.data.municipios.find((x) => x.cd === cd);
  if (!m) return <Falha texto="Município não encontrado." />;
  const [a, b] = cands;
  const r = arq.data.resumo;
  const lista = arq.data.municipios;
  const rankEleit = [...lista].sort((x, y) => y.eleitorado - x.eleitorado).findIndex((x) => x.cd === cd) + 1;
  const comSwing = lista.filter((x) => x.swing_pp != null);
  const rankSwing = [...comSwing].sort((x, y) => (y.swing_pp ?? 0) - (x.swing_pp ?? 0)).findIndex((x) => x.cd === cd) + 1;
  const comPct = lista.filter((x) => x.pct);
  const rankA = [...comPct].sort((x, y) => (y.pct?.[a.n] ?? 0) - (x.pct?.[a.n] ?? 0)).findIndex((x) => x.cd === cd) + 1;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <p className="mini">
          <Link className="link" to="/">Brasil</Link> / <Link className="link" to={`/uf/${m.uf}`}>{nomeUF(m.uf)}</Link> / Município
        </p>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
          {nomeProprio(m.nome)} <span className="text-base font-normal uppercase text-slate-500">{m.uf === 'zz' ? 'exterior' : m.uf}</span>
        </h1>
        <p className="sub">
          {m.capital ? 'Capital · ' : ''}
          {fmtInt(m.eleitorado)} eleitores · {PORTES.find((p) => p.v === m.porte)?.nome} · apuração {STATUS_NOME[m.status]?.toLowerCase()}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Placar titulo={`Placar oficial: ${nomeProprio(m.nome)}`} pct={m.pct} votos={m.votos} pctSecoes={m.pct_secoes} />
        <section className="card">
          <h2 className="titulo-secao">Comparação com o 1º turno</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            {[a, b].map((c) => (
              <div key={c.n}>
                <dt className="mini">{c.nome} no 1º turno (dos válidos)</dt>
                <dd className="text-lg font-semibold tabular-nums">{fmtPct(m.pct_1t?.[c.n], 1)}</dd>
              </div>
            ))}
            <div>
              <dt className="mini">Divisão entre os dois no 1º turno</dt>
              <dd className="text-lg font-semibold tabular-nums">{m.share2_1t ? `${fmtPct(m.share2_1t[a.n], 1)} × ${fmtPct(m.share2_1t[b.n], 1)}` : '-'}</dd>
            </div>
            <div>
              <dt className="mini">Variação para {a.nome}</dt>
              <dd className="text-lg font-semibold tabular-nums">{fmtPP(m.swing_pp)}</dd>
            </div>
            <div>
              <dt className="mini">Comparecimento (1º turno)</dt>
              <dd className="text-lg font-semibold tabular-nums">{fmtPct(m.pct_comparecimento, 1)} ({fmtPct(m.pct_comparecimento_1t, 1)})</dd>
            </div>
            <div>
              <dt className="mini">Liderança</dt>
              <dd className="font-semibold">
                {m.virou_vs_1t ? 'Mudou em relação ao 1º turno' : m.lider ? 'Mesmo líder do 1º turno' : 'Sem votos apurados'}
              </dd>
            </div>
          </dl>
          {m.proj_pct && br?.projecao.disponivel !== false && (
            <div className="mt-3 rounded-md bg-slate-50 p-2.5 text-sm dark:bg-slate-800/60">
              <p>
                Projeção estatística para o município: {a.nome} {fmtPct(m.proj_pct[a.n], 1)} × {b.nome} {fmtPct(m.proj_pct[b.n], 1)}
                {m.validos_restantes ? <> · faltam cerca de {fmtVotosCurto(m.validos_restantes)} votos válidos</> : null}
              </p>
              <Aviso className="mt-2" />
            </div>
          )}
        </section>
      </div>
      <section className="card">
        <h2 className="titulo-secao">No contexto de {nomeUF(m.uf)}</h2>
        <ul className="mt-2 space-y-1 text-sm">
          <li>{rankEleit}º maior eleitorado entre {lista.length} {m.uf === 'zz' ? 'cidades' : 'municípios'}.</li>
          {m.pct && rankA > 0 && (
            <li>
              {rankA}º maior percentual de {a.nome} entre {comPct.length} com votos apurados ({fmtPct(m.pct[a.n], 1)}; no estado: {fmtPct(r.pct?.[a.n], 1)}).
            </li>
          )}
          {m.swing_pp != null && rankSwing > 0 && (
            <li>
              {rankSwing}º maior variação a favor de {a.nome} em relação ao 1º turno ({fmtPP(m.swing_pp)}; no estado: {fmtPP(r.swing_pp)}).
            </li>
          )}
          <li>Seções apuradas: {fmtPct(m.pct_secoes, 1)} (estado: {fmtPct(r.pct_secoes, 1)}).</li>
        </ul>
      </section>
      {m.uf !== 'zz' && munDatum && (
        <Mapa ufs={br?.ufs ?? []} municipios={munDatum} ufFixa={m.uf} destaque={m.ibge} projecaoDisponivel={br?.projecao.disponivel ?? true} titulo="Mapa do estado" />
      )}
      <div className="card">
        <BuscaMunicipio />
      </div>
    </div>
  );
}
