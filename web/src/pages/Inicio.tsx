import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Timeline } from '../types/contrato';
import { useDados, useJson, useMunicipios } from '../lib/dados';
import { deLinha } from '../mapa/dados';
import Placar from '../components/Placar';
import Projecao from '../components/Projecao';
import ResumoIA from '../components/ResumoIA';
import VotosFaltam from '../components/VotosFaltam';
import RankingUF from '../components/RankingUF';
import Comparacao1t2t from '../components/Comparacao1t2t';
import Eventos from '../components/Eventos';
import AoVivo from '../components/AoVivo';
import Compartilhar from '../components/Compartilhar';
import BuscaMunicipio from '../components/BuscaMunicipio';
import { Graficos, Mapa } from '../components/Lazy';
import { Carregando } from '../components/Carregando';
import SemDados from '../components/SemDados';
import { horaTSE } from '../lib/format';

export default function Inicio() {
  const { br, status, statusRecebidoEm, carregando, semDados, versao } = useDados();
  const [sp] = useSearchParams();
  const tl = useJson<Timeline>(br ? 'timeline/br.json' : null, versao);
  const precisaMun = sp.get('mapa') === 'mun';
  const mun = useMunicipios(precisaMun);
  const munDatum = useMemo(() => (mun.linhas ? mun.linhas.map(deLinha) : null), [mun.linhas]);

  if (carregando && !br) return <Carregando texto="Carregando apuração…" />;
  if (!br) return <SemDados semDados={semDados} />;

  const st = status?.status ?? br.status;
  const ufsSemExt = br.ufs.filter((u) => u.codigo !== 'zz');

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{br.titulo}</h1>
          <p className="sub">
            {br.atualizado_tse ? `Atualização do TSE: ${horaTSE(br.atualizado_tse, true)} (horário de Brasília)` : 'Sem divulgação do TSE até agora'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AoVivo
            status={st}
            atualizadoTse={status?.atualizado_tse ?? br.atualizado_tse}
            segundosDesdeTse={status?.segundos_desde_tse}
            recebidoEm={statusRecebidoEm}
          />
          <Compartilhar br={br} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Placar pct={br.apuracao.pct} votos={br.apuracao.votos} pctSecoes={br.apuracao.pct_secoes} eleito={br.apuracao.eleito} />
        <Projecao projecao={br.projecao} apuracao={br.apuracao} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ResumoIA ia={br.ia} />
        <VotosFaltam itens={br.regioes} comSaldo={br.projecao.disponivel} />
      </div>

      {tl.data ? <Graficos pontos={tl.data.pontos} /> : tl.carregando ? <Carregando texto="Carregando gráficos…" /> : null}

      <div className="card">
        <BuscaMunicipio />
      </div>

      <Mapa
        ufs={br.ufs}
        municipios={munDatum}
        detalheAoVivo
        versao={versao}
        projecaoDisponivel={br.projecao.disponivel}
      />

      <RankingUF itens={br.ufs} comProjecao={br.projecao.disponivel} />
      <Comparacao1t2t itens={ufsSemExt} />
      {br.eventos_recentes && <Eventos eventos={br.eventos_recentes} />}
    </div>
  );
}
