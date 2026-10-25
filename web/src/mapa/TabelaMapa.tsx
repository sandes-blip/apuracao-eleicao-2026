import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Candidato } from '../types/contrato';
import type { MapaDatum } from './dados';
import { fmtPct, fmtPP, fmtVotosCurto } from '../lib/format';

type Col = 'nome' | 'pct_secoes' | 'pctA' | 'share1tA' | 'swing' | 'projA' | 'restantes' | 'eleitorado';

/** Alternativa acessível ao mapa: mesma informação em tabela ordenável. */
export default function TabelaMapa({ itens, cands, municipios }: { itens: MapaDatum[]; cands: Candidato[]; municipios: boolean }) {
  const [a, b] = cands;
  const [col, setCol] = useState<Col>('eleitorado');
  const [desc, setDesc] = useState(true);
  const [n, setN] = useState(50);
  const ord = useMemo(() => {
    const l = [...itens];
    l.sort((x, y) => {
      if (col === 'nome') return (desc ? -1 : 1) * x.nome.localeCompare(y.nome, 'pt-BR');
      const vx = (x[col] as number | null) ?? -Infinity, vy = (y[col] as number | null) ?? -Infinity;
      return desc ? vy - vx : vx - vy;
    });
    return l;
  }, [itens, col, desc]);
  const Th = ({ c, children }: { c: Col; children: React.ReactNode }) => (
    <th scope="col" aria-sort={col === c ? (desc ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className="inline-flex items-center gap-1 uppercase" onClick={() => (col === c ? setDesc(!desc) : (setCol(c), setDesc(c !== 'nome')))}>
        {children}<span aria-hidden="true">{col === c ? (desc ? '▼' : '▲') : '↕'}</span>
      </button>
    </th>
  );
  const pa = a.nome.split(' ')[0], pb = b.nome.split(' ')[0];
  return (
    <div>
      <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
        <table className="tabela">
          <caption className="sr-only">Dados do mapa em formato de tabela</caption>
          <thead>
            <tr>
              <Th c="nome">{municipios ? 'Município' : 'Estado'}</Th>
              <Th c="eleitorado">Eleitorado</Th>
              <Th c="pct_secoes">Apurado</Th>
              <Th c="pctA">{pa} / {pb}</Th>
              <Th c="share1tA">1º turno</Th>
              <Th c="swing">Variação</Th>
              <Th c="projA">Projeção</Th>
              <Th c="restantes">Faltam</Th>
            </tr>
          </thead>
          <tbody>
            {ord.slice(0, n).map((d) => (
              <tr key={d.chave}>
                <td className="font-medium">
                  {municipios && d.cd ? (
                    <Link className="link" to={`/municipio/${d.uf}/${d.cd}`}>{d.nome}</Link>
                  ) : !municipios && d.uf !== 'zz' ? (
                    <Link className="link" to={`/uf/${d.uf}`}>{d.nome}</Link>
                  ) : d.nome}
                  {municipios && <span className="ml-1 text-xs uppercase text-slate-500">{d.uf}</span>}
                </td>
                <td>{fmtVotosCurto(d.eleitorado)}</td>
                <td>{fmtPct(d.pct_secoes, 1)}</td>
                <td>{d.pctA == null ? '-' : `${fmtPct(d.pctA, 1)} / ${fmtPct(100 - d.pctA, 1)}`}</td>
                <td>{d.share1tA == null ? '-' : `${fmtPct(d.share1tA, 1)} / ${fmtPct(100 - d.share1tA, 1)}`}</td>
                <td>{fmtPP(d.swing)}</td>
                <td>{d.projA == null ? '-' : `${fmtPct(d.projA, 1)} / ${fmtPct(100 - d.projA, 1)}`}</td>
                <td>{fmtVotosCurto(d.restantes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mini mt-2">
        Percentuais na ordem {a.nome} / {b.nome}. 1º turno: divisão entre os dois finalistas. Projeção: estatística, não é resultado oficial.
      </p>
      {ord.length > n && (
        <button type="button" className="btn mt-2" onClick={() => setN(n + 100)}>
          Mostrar mais ({(ord.length - n).toLocaleString('pt-BR')} restantes)
        </button>
      )}
    </div>
  );
}
