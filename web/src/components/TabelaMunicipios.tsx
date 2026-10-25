import { useMemo } from 'react';
import type { Municipio } from '../types/contrato';
import { useCandidatos } from '../lib/dados';
import { deMunicipio } from '../mapa/dados';
import TabelaMapa from '../mapa/TabelaMapa';

export default function TabelaMunicipios({ municipios, titulo, comProjecao = true }: { municipios: Municipio[]; titulo: string; comProjecao?: boolean }) {
  const cands = useCandidatos();
  const itens = useMemo(() => municipios.map((m) => ({ ...deMunicipio(m, cands), ...(comProjecao ? {} : { projA: null }) })), [municipios, cands, comProjecao]);
  return (
    <section className="card">
      <h2 className="titulo-secao">{titulo}</h2>
      <p className="mini mb-2 mt-1">Ordenado por eleitorado. Clique no cabeçalho para mudar a ordem.</p>
      <TabelaMapa itens={itens} cands={cands} municipios />
    </section>
  );
}
