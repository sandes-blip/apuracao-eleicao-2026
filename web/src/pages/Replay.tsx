import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ReplayEleicao, ReplayIndice, ReplayMomento } from '../types/contrato';
import { CandidatosCtx, useJson } from '../lib/dados';
import { getJson } from '../lib/api';
import { decodificar } from '../lib/municipios';
import { deLinha } from '../mapa/dados';
import { fmtPct, horaISO } from '../lib/format';
import Placar from '../components/Placar';
import Projecao from '../components/Projecao';
import ResumoIA from '../components/ResumoIA';
import VotosFaltam from '../components/VotosFaltam';
import { Mapa } from '../components/Lazy';
import { Carregando, Falha } from '../components/Carregando';

const VELOCIDADES = [1, 2, 4, 8];

export default function Replay() {
  const [sp, setSp] = useSearchParams();
  const idx = useJson<ReplayIndice>('replay/index.json');
  const eleicoes = idx.data?.eleicoes ?? [];
  const eleicao = sp.get('e') ?? eleicoes[0]?.id ?? null;
  const lista = useJson<ReplayEleicao>(eleicao ? `replay/${eleicao}/index.json` : null);
  const momentos = lista.data?.momentos ?? [];

  const [pos, setPos] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [vel, setVel] = useState(2);
  const cache = useRef(new Map<string, Promise<ReplayMomento>>());
  const [atual, setAtual] = useState<ReplayMomento | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    cache.current.clear();
    setPos(0);
    setTocando(false);
    setAtual(null);
  }, [eleicao]);

  const carregar = (i: number) => {
    const m = momentos[i];
    if (!m || !eleicao) return null;
    let p = cache.current.get(m.id);
    if (!p) {
      p = getJson<ReplayMomento>(`replay/${eleicao}/${m.id}.json`);
      p.catch(() => cache.current.delete(m.id));
      cache.current.set(m.id, p);
    }
    return p;
  };

  useEffect(() => {
    let vivo = true;
    const p = carregar(pos);
    if (!p) return;
    p.then((d) => {
      if (!vivo) return;
      setAtual(d);
      setErro(null);
      carregar(pos + 1); // pré-carrega o próximo
    }).catch(() => vivo && setErro('Não foi possível carregar este momento.'));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, momentos, eleicao]);

  useEffect(() => {
    if (!tocando) return;
    if (pos >= momentos.length - 1) {
      setTocando(false);
      return;
    }
    const t = window.setTimeout(() => setPos((p) => Math.min(momentos.length - 1, p + 1)), 3000 / vel);
    return () => window.clearTimeout(t);
  }, [tocando, pos, vel, momentos.length]);

  const munDatum = useMemo(() => (atual?.municipios ? decodificar(atual.municipios).map(deLinha) : null), [atual]);

  if (idx.carregando) return <Carregando />;
  if (!idx.data || !eleicoes.length) return <Falha texto="Nenhuma eleição disponível para replay ainda." />;

  const m = momentos[pos];
  const br = atual?.br;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Replay da apuração</h1>
        <p className="sub">Reveja como placar, projeção, mapa e análises evoluíram ao longo da apuração.</p>
      </div>

      <section className="card space-y-3" aria-label="Controles do replay">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-0.5 text-xs font-medium">
            Eleição
            <select
              className="campo"
              value={eleicao ?? ''}
              onChange={(e) => {
                const n = new URLSearchParams(sp);
                n.set('e', e.target.value);
                setSp(n, { replace: true });
              }}
            >
              {eleicoes.map((e) => (
                <option key={e.id} value={e.id}>{e.titulo}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1.5">
            <button type="button" className="btn" aria-label="Momento anterior" onClick={() => setPos((p) => Math.max(0, p - 1))} disabled={pos === 0}>
              ◀
            </button>
            <button
              type="button"
              className="btn btn-ativo min-w-[6rem] justify-center"
              onClick={() => {
                if (pos >= momentos.length - 1) setPos(0);
                setTocando(!tocando);
              }}
              disabled={!momentos.length}
            >
              {tocando ? 'Pausar' : 'Reproduzir'}
            </button>
            <button type="button" className="btn" aria-label="Próximo momento" onClick={() => setPos((p) => Math.min(momentos.length - 1, p + 1))} disabled={pos >= momentos.length - 1}>
              ▶
            </button>
          </div>
          <label className="flex flex-col gap-0.5 text-xs font-medium">
            Velocidade
            <select className="campo" value={vel} onChange={(e) => setVel(Number(e.target.value))}>
              {VELOCIDADES.map((v) => (
                <option key={v} value={v}>{v}×</option>
              ))}
            </select>
          </label>
          {m && (
            <p className="ml-auto text-sm">
              <strong className="tabular-nums">{horaISO(m.momento)}</strong> · {fmtPct(m.pct_secoes, 1)} das seções
            </p>
          )}
        </div>
        {momentos.length > 0 && (
          <div>
            <input
              type="range"
              min={0}
              max={momentos.length - 1}
              value={pos}
              onChange={(e) => {
                setTocando(false);
                setPos(Number(e.target.value));
              }}
              className="w-full accent-slate-800 dark:accent-slate-200"
              aria-label="Momento da apuração"
              aria-valuetext={m ? `${horaISO(m.momento)}, ${fmtPct(m.pct_secoes, 1)} das seções` : undefined}
            />
            <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>{horaISO(momentos[0].momento)}</span>
              <span>Momento {pos + 1} de {momentos.length}</span>
              <span>{horaISO(momentos[momentos.length - 1].momento)}</span>
            </div>
          </div>
        )}
      </section>

      {erro && <Falha texto={erro} />}
      {lista.carregando || (!br && !erro) ? (
        <Carregando />
      ) : br ? (
        <CandidatosCtx.Provider value={br.candidatos}>
          <p className="rounded-md bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800">
            Replay: situação às {horaISO(br.gerado_em)}, com {fmtPct(br.apuracao.pct_secoes, 1)} das seções apuradas. Não são os dados atuais.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <Placar pct={br.apuracao.pct} votos={br.apuracao.votos} pctSecoes={br.apuracao.pct_secoes} eleito={br.apuracao.eleito} />
            <Projecao projecao={br.projecao} apuracao={br.apuracao} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ResumoIA ia={br.ia} />
            <VotosFaltam itens={br.regioes} comSaldo={br.projecao.disponivel} />
          </div>
          <Mapa ufs={br.ufs} municipios={munDatum} projecaoDisponivel={br.projecao.disponivel} />
        </CandidatosCtx.Provider>
      ) : null}
    </div>
  );
}
