import {
  Area, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { PontoTimeline } from '../types/contrato';
import { useCandidatos } from '../lib/dados';
import { fmtPct, horaISO } from '../lib/format';
import { useEscuro } from '../lib/tema';
import Aviso from '../components/Aviso';

function useTemaGrafico() {
  const escuro = useEscuro();
  return {
    grade: escuro ? '#1e293b' : '#e2e8f0',
    eixo: escuro ? '#94a3b8' : '#475569',
    fundoTip: escuro ? '#0f172a' : '#ffffff',
    bordaTip: escuro ? '#334155' : '#cbd5e1',
    texto: escuro ? '#e2e8f0' : '#0f172a',
  };
}

const nf1 = (v: number) => fmtPct(v, 1);

interface Props {
  pontos: PontoTimeline[];
  /** "curva" | "projecao" | "prob" | todos */
  mostrar?: ('curva' | 'projecao' | 'prob')[];
}

export default function Graficos({ pontos, mostrar = ['curva', 'projecao', 'prob'] }: Props) {
  const [a, b] = useCandidatos();
  const t = useTemaGrafico();
  const tip = {
    contentStyle: { background: t.fundoTip, border: `1px solid ${t.bordaTip}`, borderRadius: 8, fontSize: 12, color: t.texto },
    labelStyle: { color: t.texto, fontWeight: 600 },
  };
  const eixo = { stroke: t.eixo, fontSize: 11, tickLine: false };

  const dados = pontos
    .filter((p) => p.pct && p.pct[a.n] != null && p.pct[b.n] != null)
    .map((p) => {
      const pa = p.pct![a.n];
      const p2 = p.p2?.[a.n] ?? null;
      const ic = p.ic95?.[a.n] ?? null;
      const prob = p.prob?.[a.n] ?? null;
      return {
        t: new Date(p.momento).getTime(),
        sec: p.pct_secoes,
        oa: pa,
        ob: p.pct![b.n] ?? 100 - pa,
        p2a: p2,
        p2b: p2 == null ? null : 100 - p2,
        ica: ic,
        icb: ic ? [100 - ic[1], 100 - ic[0]] : null,
        proba: prob == null ? null : prob * 100,
        probb: prob == null ? null : (1 - prob) * 100,
      };
    });
  if (dados.length < 2) {
    return <p className="sub">A série temporal aparece depois das primeiras atualizações.</p>;
  }
  const temProj = dados.some((d) => d.p2a != null);
  const dadosProj = temProj ? dados.slice(dados.findIndex((d) => d.p2a != null)) : [];
  // domínio do eixo Y: ignora o início muito ruidoso (menos de 5% apurado), que fica cortado
  const base = dados.filter((d) => d.sec >= 5);
  const ref = base.length >= 2 ? base : dados;
  const vals = ref.flatMap((d) => [d.oa, d.ob, ...(d.ica ?? []), ...(d.icb ?? [])]);
  const yMin = Math.max(0, Math.floor(Math.min(...vals, 48) - 2));
  const yMax = Math.min(100, Math.ceil(Math.max(...vals, 52) + 2));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {mostrar.includes('curva') && (
        <figure className="card lg:col-span-2">
          <figcaption>
            <h3 className="titulo-secao">Curva da apuração</h3>
            <p className="mini">Placar oficial (% dos votos válidos) conforme as seções são apuradas. No começo, com poucas urnas, os valores oscilam muito e podem sair da escala.</p>
          </figcaption>
          <div className="mt-2 h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dados} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
                <CartesianGrid stroke={t.grade} vertical={false} />
                <XAxis dataKey="sec" type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} {...eixo} />
                <YAxis domain={[yMin, yMax]} allowDataOverflow tickFormatter={(v) => `${v}%`} {...eixo} />
                <ReferenceLine y={50} stroke={t.eixo} strokeDasharray="3 3" />
                <Tooltip {...tip} labelFormatter={(v) => `${fmtPct(Number(v), 1)} das seções`} formatter={(v: number) => nf1(v)} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.texto }} />
                <Line type="monotone" dataKey="oa" name={a.nome} stroke={a.cor} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="ob" name={b.nome} stroke={b.cor} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </figure>
      )}
      {mostrar.includes('projecao') && temProj && (
        <figure className="card">
          <figcaption>
            <h3 className="titulo-secao">Evolução da projeção</h3>
            <p className="mini">Linha cheia: projeção (faixa sombreada de 95%). Linha tracejada: placar oficial.</p>
          </figcaption>
          <div className="mt-2 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dadosProj} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
                <CartesianGrid stroke={t.grade} vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(v) => horaISO(new Date(v).toISOString())} {...eixo} />
                <YAxis domain={[yMin, yMax]} allowDataOverflow tickFormatter={(v) => `${v}%`} {...eixo} />
                <ReferenceLine y={50} stroke={t.eixo} strokeDasharray="3 3" />
                <Tooltip
                  {...tip}
                  labelFormatter={(v) => horaISO(new Date(Number(v)).toISOString())}
                  formatter={(v: number | number[], n: string) => [Array.isArray(v) ? `${nf1(v[0])} a ${nf1(v[1])}` : nf1(v), n]}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: t.texto }} />
                <Area dataKey="ica" name={`Faixa ${a.nome}`} stroke="none" fill={a.cor} fillOpacity={0.18} isAnimationActive={false} legendType="none" connectNulls />
                <Area dataKey="icb" name={`Faixa ${b.nome}`} stroke="none" fill={b.cor} fillOpacity={0.18} isAnimationActive={false} legendType="none" connectNulls />
                <Line dataKey="p2a" name={`Projeção ${a.nome}`} stroke={a.cor} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                <Line dataKey="p2b" name={`Projeção ${b.nome}`} stroke={b.cor} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                <Line dataKey="oa" name={`Oficial ${a.nome}`} stroke={a.cor} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                <Line dataKey="ob" name={`Oficial ${b.nome}`} stroke={b.cor} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Aviso className="mt-2" />
        </figure>
      )}
      {mostrar.includes('prob') && temProj && (
        <figure className="card">
          <figcaption>
            <h3 className="titulo-secao">Probabilidade ao longo do tempo</h3>
            <p className="mini">Chance de cada candidato terminar à frente, segundo a simulação do modelo.</p>
          </figcaption>
          <div className="mt-2 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dados} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
                <CartesianGrid stroke={t.grade} vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(v) => horaISO(new Date(v).toISOString())} {...eixo} />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} {...eixo} />
                <ReferenceLine y={50} stroke={t.eixo} strokeDasharray="3 3" />
                <Tooltip {...tip} labelFormatter={(v) => horaISO(new Date(Number(v)).toISOString())} formatter={(v: number) => `${Math.round(v)}%`} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.texto }} />
                <Line dataKey="proba" name={a.nome} stroke={a.cor} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                <Line dataKey="probb" name={b.nome} stroke={b.cor} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Aviso className="mt-2" />
        </figure>
      )}
    </div>
  );
}
