import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RegiaoUF } from '../types/contrato';
import { useCandidatos } from '../lib/dados';
import { fmtPct, fmtPP, fmtVotosCurto } from '../lib/format';

type Col = 'nome' | 'pct_secoes' | 'a' | 'b' | 'swing' | 'proj' | 'saldo';

/** Tabela ordenável das UFs. */
export default function RankingUF({ itens, titulo = 'Ranking dos estados', link = true, comProjecao = true }: { itens: RegiaoUF[]; titulo?: string; link?: boolean; comProjecao?: boolean }) {
  const [a, b] = useCandidatos();
  const [col, setCol] = useState<Col>('pct_secoes');
  const [desc, setDesc] = useState(true);
  const val = (u: RegiaoUF, c: Col): number | string => {
    switch (c) {
      case 'nome': return u.nome;
      case 'pct_secoes': return u.pct_secoes;
      case 'a': return u.pct?.[a.n] ?? -1;
      case 'b': return u.pct?.[b.n] ?? -1;
      case 'swing': return u.swing_pp ?? -999;
      case 'proj': return u.proj?.pct?.[a.n] ?? -1;
      case 'saldo': return u.saldo_esperado ?? 0;
    }
  };
  const ord = useMemo(() => {
    const l = [...itens];
    l.sort((x, y) => {
      const vx = val(x, col), vy = val(y, col);
      const r = typeof vx === 'string' ? vx.localeCompare(String(vy), 'pt-BR') : (vx as number) - (vy as number);
      return desc ? -r : r;
    });
    return l;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, col, desc, a.n, b.n]);

  const Th = ({ c, children }: { c: Col; children: React.ReactNode }) => (
    <th scope="col" aria-sort={col === c ? (desc ? 'descending' : 'ascending') : 'none'}>
      <button
        type="button"
        className="inline-flex items-center gap-1 uppercase hover:text-slate-900 dark:hover:text-white"
        onClick={() => {
          if (col === c) setDesc(!desc);
          else {
            setCol(c);
            setDesc(c !== 'nome');
          }
        }}
      >
        {children}
        <span aria-hidden="true">{col === c ? (desc ? '▼' : '▲') : '↕'}</span>
      </button>
    </th>
  );

  return (
    <section className="card" aria-labelledby="ranking-titulo">
      <h2 id="ranking-titulo" className="titulo-secao">{titulo}</h2>
      <p className="mini mt-1">Clique no cabeçalho para ordenar. Variação: diferença de {a.nome} em relação ao 1º turno (entre os dois finalistas), nos mesmos municípios. Saldo positivo favorece {a.nome}; negativo, {b.nome}.</p>
      <div className="-mx-4 mt-2 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
        <table className="tabela">
          <thead>
            <tr>
              <Th c="nome">Estado</Th>
              <Th c="pct_secoes">Apurado</Th>
              <Th c="a">{a.nome.split(' ')[0]}</Th>
              <Th c="b">{b.nome.split(' ')[0]}</Th>
              <Th c="swing">Variação</Th>
              <Th c="proj">Projeção {a.nome.split(' ')[0]}</Th>
              <Th c="saldo">Saldo a apurar</Th>
            </tr>
          </thead>
          <tbody>
            {ord.map((u) => (
              <tr key={u.codigo}>
                <td className="font-medium">
                  {link && u.codigo !== 'zz' ? <Link className="link" to={`/uf/${u.codigo}`}>{u.nome}</Link> : u.nome}
                </td>
                <td>{fmtPct(u.pct_secoes, 1)}</td>
                <td>{fmtPct(u.pct?.[a.n], 1)}</td>
                <td>{fmtPct(u.pct?.[b.n], 1)}</td>
                <td>{fmtPP(u.swing_pp)}</td>
                <td>{comProjecao && u.proj ? fmtPct(u.proj.pct[a.n], 1) : '-'}</td>
                <td>
                  {comProjecao && u.saldo_esperado ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: u.saldo_esperado > 0 ? a.cor : b.cor }} aria-hidden="true" />
                      {u.saldo_esperado > 0 ? '+' : '−'}{fmtVotosCurto(Math.abs(u.saldo_esperado))}
                    </span>
                  ) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mini mt-2">Coluna de projeção: projeção estatística independente, não é resultado oficial.</p>
    </section>
  );
}
