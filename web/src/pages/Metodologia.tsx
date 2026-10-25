import Aviso from '../components/Aviso';

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-2">
      <h2 className="titulo-secao">{titulo}</h2>
      <div className="space-y-2 text-[15px] leading-relaxed text-slate-700 dark:text-slate-200">{children}</div>
    </section>
  );
}

export default function Metodologia() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Metodologia</h1>
        <p className="sub mt-1">
          Como calculamos o que aparece no portal, em linguagem simples. Todos os números saem de um motor estatístico
          determinístico e auditável. A inteligência artificial apenas escreve os textos a partir desses números; ela não calcula nada.
        </p>
      </div>
      <Aviso />

      <Bloco titulo="Por que o placar parcial engana">
        <p>
          Os votos não chegam todos ao mesmo tempo. Regiões que votam de forma diferente são apuradas em ritmos diferentes.
          Em 2022, por exemplo, um candidato liderou o início da apuração do 2º turno e o outro só passou à frente perto de dois
          terços das urnas apuradas, porque parte do Nordeste e de grandes cidades entrou mais tarde. Por isso, além do placar,
          estimamos quantos votos ainda faltam em cada lugar e como esses lugares tendem a votar.
        </p>
      </Bloco>

      <Bloco titulo="As três camadas">
        <p>
          <strong>P0, placar oficial.</strong> Os números divulgados pelo TSE, sem nenhum ajuste. É sempre o destaque principal.
        </p>
        <p>
          <strong>P1, projeção por região.</strong> Responde à pergunta: "e se cada região seguir o ritmo atual?". Mantemos o
          percentual que cada candidato tem hoje em cada região (Norte, Nordeste, Centro-Oeste, Sudeste, Sul e Exterior) e aplicamos
          esse percentual aos votos que ainda faltam ali. Enquanto uma região tem menos de 5% apurado, usamos a divisão do 1º turno.
          É fácil de entender, mas supõe que o que falta numa região vota igual ao que já foi contado, o que nem sempre é verdade
          (capital e interior, por exemplo).
        </p>
        <p>
          <strong>P2, projeção por município (principal).</strong> Detalhada a seguir. É o número principal da projeção.
        </p>
      </Bloco>

      <Bloco titulo="Como funciona a projeção principal (P2)">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>Ponto de partida.</strong> Cada município começa pelo próprio resultado do 1º turno: a fatia de Lula entre os dois
            finalistas, ou seja, Lula ÷ (Lula + Flávio).
          </li>
          <li>
            <strong>Quanto o 2º turno se afasta do 1º.</strong> Nos municípios que já foram apurados, medimos em tempo real quanto o
            resultado do 2º turno está se distanciando do 1º turno. Uma regressão estima esse afastamento usando informações do próprio
            1º turno: a votação de cada finalista, os votos dos candidatos eliminados (Cury, Renan Santos, Caiado e os demais),
            o comparecimento, os votos brancos e nulos, o tamanho do município e se ele é capital.
          </li>
          <li>
            <strong>Efeitos de região e de estado.</strong> O modelo permite que cada região e cada estado se comportem de um jeito
            próprio. Quando ainda há poucos dados num estado ou numa região, esse efeito é puxado para a média nacional, para não
            confiar demais em poucas urnas.
          </li>
          <li>
            <strong>O resultado do próprio município pesa mais conforme ele é apurado.</strong> Um município com poucas seções contadas
            segue principalmente a estimativa do modelo; um município quase todo apurado segue praticamente o próprio resultado.
          </li>
          <li>
            <strong>Comparecimento e votos válidos.</strong> São projetados do mesmo jeito, para estimar quantos votos válidos ainda
            faltam em cada lugar.
          </li>
          <li>
            <strong>Soma.</strong> Somamos os votos já apurados com os votos esperados no que falta, município a município. O Exterior
            entra como um bloco próprio.
          </li>
        </ol>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[13px] leading-6 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100">
          <p className="mb-1 font-sans text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Fórmula resumida</p>
          <p>base<sub>m</sub> = Lula ÷ (Lula + Flávio) no 1º turno</p>
          <p>esperado<sub>m</sub> = base<sub>m</sub> ajustada pelo afastamento estimado (nacional + região + estado + perfil do município)</p>
          <p>peso<sub>m</sub> = votos apurados<sub>m</sub> ÷ (votos apurados<sub>m</sub> + constante)</p>
          <p>fatia no que falta<sub>m</sub> = peso<sub>m</sub> × atual<sub>m</sub> + (1 − peso<sub>m</sub>) × esperado<sub>m</sub></p>
          <p>Lula projetado = Σ [ apurados<sub>m</sub> + válidos que faltam<sub>m</sub> × fatia no que falta<sub>m</sub> ]</p>
        </div>
      </Bloco>

      <Bloco titulo="Incerteza e probabilidade">
        <p>
          A cada recálculo, rodamos 5.000 simulações. Em cada uma, sorteamos erros possíveis em vários níveis ao mesmo tempo: um erro
          nacional, um por região, um por estado, um por município e uma variação no comparecimento. Esses erros são correlacionados,
          isto é, se o modelo erra num estado, tende a errar na mesma direção em estados parecidos. Isso evita uma probabilidade
          confiante demais.
        </p>
        <p>
          A <strong>faixa de 95%</strong> vai do valor que fica abaixo de 2,5% das simulações ao que fica acima de 97,5% delas. A{' '}
          <strong>probabilidade</strong> é a fração das simulações em que cada candidato termina à frente.
        </p>
      </Bloco>

      <Bloco titulo="Quando a projeção aparece e níveis de confiança">
        <p>
          A projeção só é exibida quando há pelo menos 5% das seções apuradas, dados de pelo menos 15 estados e de pelo menos 3 regiões.
          Antes disso, mostramos apenas o placar oficial.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Confiança baixa:</strong> a faixa de 95% tem mais de 4 pontos percentuais de largura.</li>
          <li><strong>Confiança média:</strong> a faixa tem entre 2 e 4 pontos.</li>
          <li><strong>Confiança alta:</strong> a faixa tem menos de 2 pontos.</li>
        </ul>
        <p>
          Só usamos a expressão <strong>"tendência consolidada"</strong> quando a probabilidade é de pelo menos 99%, a confiança é alta e
          pelo menos 70% das seções foram apuradas. A palavra <strong>"eleito"</strong> só aparece quando o próprio TSE indica isso nos
          dados oficiais. A projeção nunca declara vencedor.
        </p>
      </Bloco>

      <Bloco titulo="A vantagem supera os eleitores restantes">
        <p>
          Esta nota não depende do modelo: é uma conta simples. Quando a diferença de votos entre os candidatos é maior do que o número
          total de eleitores das seções que ainda não foram apuradas, mostramos o aviso "A vantagem supera o total de eleitores das
          seções ainda não apuradas". Ainda assim, só o TSE declara o resultado.
        </p>
      </Bloco>

      <Bloco titulo="Fonte dos dados">
        <p>
          Usamos exclusivamente os arquivos oficiais de divulgação do TSE: os resultados do 1º turno (como base) e os do 2º turno,
          conforme são totalizados. Nenhuma pesquisa de opinião entra no modelo. A projeção não é pesquisa eleitoral: não há entrevistas,
          só votos oficiais já contados.
        </p>
      </Bloco>

      <Bloco titulo="Limitações">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Ordem de chegada dentro das grandes cidades.</strong> Se os bairros apurados primeiro numa capital votam de forma
            diferente dos que faltam, a projeção daquela cidade pode errar até que mais seções entrem.
          </li>
          <li>
            <strong>Votos no exterior.</strong> São poucos, chegam mais tarde e têm padrão próprio; entram como um bloco separado, com
            mais incerteza.
          </li>
          <li>
            <strong>Comparecimento.</strong> Se o comparecimento do 2º turno mudar muito em relação ao 1º em alguns lugares, a estimativa
            de votos que faltam fica menos precisa. Essa incerteza está incluída nas simulações.
          </li>
          <li>
            <strong>Mudanças de comportamento.</strong> O modelo assume que o afastamento medido nos municípios já apurados vale para
            municípios parecidos que ainda faltam. Se isso não acontecer, a faixa de incerteza tende a refletir a dúvida, mas não a
            elimina.
          </li>
        </ul>
      </Bloco>
      <Aviso />
    </div>
  );
}
