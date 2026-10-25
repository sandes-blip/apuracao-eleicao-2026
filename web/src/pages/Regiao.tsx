import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { Timeline } from '../types/contrato';
import { useDados, useJson, useMunicipios } from '../lib/dados';
import { deLinha } from '../mapa/dados';
import { nomeRegiao, REGIOES } from '../lib/geo-ref';
import Placar from '../components/Placar';
import ProjecaoEntidade from '../components/ProjecaoEntidade';
import VotosFaltam from '../components/VotosFaltam';
import RankingUF from '../components/RankingUF';
import Comparacao1t2t from '../components/Comparacao1t2t';
import { Graficos, Mapa } from '../components/Lazy';
import { Carregando } from '../components/Carregando';
import SemDados from '../components/SemDados';
import NaoEncontrada from './NaoEncontrada';
import { fmtPP, fmtPct } from '../lib/format';

export default function Regiao() {
  const { r = '' } = useParams();
  const R = r.toUpperCase();
  const { br, carregando, semDados, versao } = useDados();
  const [sp] = useSearchParams();
  const tl = useJson<Timeline>(br && REGIOES.some((x) => x.codigo === R) ? `timeline/regiao/${R}.json` : null, versao);
  const mun = useMunicipios(sp.get('mapa') === 'mun');
  const munDatum = useMemo(() => (mun.linhas ? mun.linhas.map(deLinha) : null), [mun.linhas]);

  if (!REGIOES.some((x) => x.codigo === R)) return <NaoEncontrada />;
  if (carregando && !br) return <Carregando />;
  if (!br) return <SemDados semDados={semDados} />;
  const reg = br.regioes.find((x) => x.codigo.toUpperCase() === R);
  const ufs = br.ufs.filter((u) => u.regiao.toUpperCase() === R);
  if (!reg) return <SemDados semDados />;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <p className="mini"><Link className="link" to="/">Brasil</Link> / Região</p>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{nomeRegiao(R)}</h1>
        <p className="sub">
          {fmtPct(reg.pct_secoes, 1)} das seções apuradas · variação em relação ao 1º turno: {fmtPP(reg.swing_pp)} para {br.candidatos[0]?.nome}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Placar titulo={`Placar oficial: ${reg.nome}`} pct={reg.pct} votos={reg.votos} pctSecoes={reg.pct_secoes} />
        <ProjecaoEntidade r={reg} disponivelBR={br.projecao.disponivel} motivo={br.projecao.motivo} />
      </div>
      {ufs.length > 1 && <VotosFaltam itens={ufs} titulo={`De onde vêm os votos que faltam no ${reg.nome}`} comSaldo={br.projecao.disponivel} />}
      {tl.data && <Graficos pontos={tl.data.pontos} />}
      {R !== 'EXT' && (
        <Mapa ufs={br.ufs} municipios={munDatum} regiaoFixa={R} detalheAoVivo versao={versao} projecaoDisponivel={br.projecao.disponivel} />
      )}
      <RankingUF itens={ufs} titulo={`Estados do ${reg.nome}`} comProjecao={br.projecao.disponivel} />
      {R !== 'EXT' && <Comparacao1t2t itens={ufs} />}
    </div>
  );
}
