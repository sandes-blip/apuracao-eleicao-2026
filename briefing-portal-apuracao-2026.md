# Briefing: Portal Público de Apuração e Projeção | 2º Turno Presidencial 2026

**Versão:** 1.1
**Data:** 25/10/2026
**Responsável:** Yvess Sandes (Inovaxio)
**Destino:** desenvolvimento no Claude Code

---

## 1. Contexto e objetivo

Portal web aberto ao público para acompanhar em tempo real a apuração do 2º turno da eleição presidencial de 2026 e exibir uma **projeção estatística do resultado final**, recalculada continuamente conforme os votos são totalizados, com análise textual gerada por IA a cada 10 minutos.

**Disputa:** Luiz Inácio Lula da Silva (PT, 13) x Flávio Bolsonaro (PL, 22).

**Data do 2º turno:** 25/10/2026, votação das 8h às 17h (horário de Brasília). A apuração começa às 17h e historicamente o resultado nacional fica definido em poucas horas.

**Referência do 1º turno (04/10/2026):** Flávio 47,03% x Lula 45,16% dos votos válidos. Lula venceu nos nove estados do Nordeste; Flávio liderou nas demais regiões. Esses números devem ser carregados diretamente dos arquivos oficiais do TSE (eleição 6257), e não digitados no código.

### Pergunta que o portal responde

> "Se a apuração seguir o padrão observado até agora, qual será o resultado final, com qual margem de erro e com qual probabilidade?"

### Princípio central

**O algoritmo calcula, a IA explica.** Toda projeção numérica sai de um motor estatístico determinístico e auditável. A IA nunca calcula números; ela recebe os números prontos e redige a análise.

---

## 2. A lógica da projeção (a intuição e o ajuste)

### O que a intuição acerta

Os votos não chegam de forma uniforme. Regiões com perfis de voto diferentes são apuradas em ritmos diferentes. Em 2022, Bolsonaro liderou o início da apuração do 2º turno e Lula só assumiu a frente por volta de dois terços das urnas apuradas, porque parte relevante do Nordeste e de grandes centros entrou mais tarde. Quem olhava só o placar parcial era enganado pela **ordem de chegada dos votos**.

### O ajuste necessário

Não é "aumentou X% da apuração, aumenta X% do candidato". O correto é:

1. Saber **quantos votos ainda faltam em cada lugar** (eleitorado das seções não apuradas).
2. Saber **como cada lugar tende a votar** (base histórica do 1º turno de 2026).
3. Medir **quanto o 2º turno está se desviando do 1º turno** nos lugares já apurados (o "swing").
4. Aplicar esse desvio aos lugares que ainda faltam e somar tudo.

Exemplo simples: se faltam 8 milhões de votos válidos no Nordeste, onde Lula tende a fazer cerca de 64%, e 6 milhões no Sul, onde Flávio tende a fazer cerca de 60%, a projeção soma esses votos esperados ao placar atual. O placar parcial pode mostrar um candidato à frente enquanto a projeção já mostra o outro vencendo.

### Três camadas de projeção (todas exibidas, com pesos de destaque diferentes)

| Camada | Nome no portal | Lógica | Uso |
|---|---|---|---|
| P0 | Placar oficial | Números do TSE, sem ajuste | Sempre em destaque |
| P1 | Projeção por região | Mantém o % atual de cada região e completa os votos que faltam em cada uma | Didática, fácil de explicar |
| P2 | Projeção por município (principal) | Swing hierárquico município/UF/região sobre a base do 1º turno, com faixa de incerteza | Número principal da projeção |

---

## 3. Escopo do projeto

O sistema é entregue completo, com os módulos abaixo.

| Módulo | Entrega |
|---|---|
| Coleta | Brasil, 27 UFs, exterior e 5.570 municípios, de forma incremental, com gravação de cada arquivo bruto para auditoria |
| Base histórica | 1º turno de 2026 completo por município; 2º turno de 2022 para backtest |
| Motor de projeção | P1 por região e P2 municipal com hierarquia, Monte Carlo, probabilidade e nível de confiança |
| Detecção de eventos | viradas, anomalias, marcos de apuração, fonte parada |
| IA | análise a cada 10 min e por evento, com validação automática e histórico |
| Portal | Início, Região, Estado, Município, Linha do tempo, Replay, Metodologia, Sobre |
| Mapa | Brasil por UF e por município, seis camadas, navegação do país até o município |
| Replay | reprodução da apuração minuto a minuto (2026 e 2022), com a projeção que o modelo fazia em cada momento |
| Backtest | medição de erro por ponto da apuração e calibração dos parâmetros |
| Reuso | códigos de eleição, cargos e candidatos definidos por configuração, para reaproveitar em 2028, 2030 e em versão white-label para veículos de imprensa |
| Infraestrutura | Docker, nginx, CDN, monitoramento e alertas |

---

## 4. Fontes de dados

### 4.1 TSE: divulgação oficial em JSON

- **Host:** `https://resultados.tse.jus.br`
- **Ambiente:** `oficial`
- **Códigos de eleição:**
  - 1º turno (04/10/2026): **6257** (Eleição Geral Federal, inclui Presidente)
  - 2º turno (25/10/2026): **6258** (Eleição Geral Federal, inclui Presidente)
- **Cargo Presidente:** `c0001`
- Não é necessário cadastro nem autorização. A divulgação segue os artigos 264 a 269 da Resolução TSE nº 23.751/2026.
- **Atenção:** em 2026 a pasta `dados-simplificados` usada em eleições anteriores não existe mais. O arquivo correto é o **resultado unificado (EA20), sufixo `-u.json`**.

#### Arquivos utilizados

| Código | Arquivo | Padrão de URL (2º turno) | Uso |
|---|---|---|---|
| EA11 | Configuração de eleições | `/oficial/comum/config/ele-c.json` | Confirmar ciclo, códigos e pleito |
| EA12 | Configuração de municípios | `/oficial/ele2026/6258/config/mun-e006258-cm.json` | Lista de municípios, códigos TSE, código IBGE, capitais |
| EA14 | Acompanhamento Brasil | `/oficial/ele2026/6258/dados/br/br-e006258-ab.json` | Saber quais UFs foram atualizadas |
| EA15 | Acompanhamento UF | `/oficial/ele2026/6258/dados/{uf}/{uf}-e006258-ab.json` | Saber quais municípios foram atualizados |
| EA20 | Resultado Brasil | `/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json` | Placar nacional |
| EA20 | Resultado UF | `/oficial/ele2026/6258/dados/{uf}/{uf}-c0001-e006258-u.json` | Placar por estado |
| EA20 | Resultado município | `/oficial/ele2026/6258/dados/{uf}/{uf}{cdmun5}-c0001-e006258-u.json` | Placar por município |
| EA10 | Eleitos | conforme especificação | Não existe para Presidente; o resultado vem do EA20 Brasil |

Para a **base do 1º turno**, os mesmos padrões com `6257` no lugar de `6258`.

`{uf}` em minúsculas (`al`, `sp`...). Exterior usa `zz`. `{cdmun5}` é o código TSE do município com **5 dígitos, mantendo zeros à esquerda**.

> Antes de codar, baixar e ler as especificações oficiais EA11, EA12, EA14, EA15 e EA20 na página "Informações técnicas sobre a divulgação de resultados 2026" do TSE. Os nomes de campos citados neste briefing são referência e **devem ser confirmados contra a especificação EA20**.

#### Regras de acesso (obrigatórias)

- Limite de **100 requisições por segundo por IP**. Excedeu: bloqueio de 10 minutos, renovado se insistir.
- **Erros 404 repetidos podem bloquear o IP.** Nunca montar URL "no chute". Gerar URLs só a partir do EA12.
- Requisições com resposta 304 (ETag/Last-Modified) também contam no limite.
- Não existe arquivo de índice. Para saber o que mudou, usar EA14 (UFs) e EA15 (municípios) e só então buscar o EA20 correspondente.
- O `IDG` identifica cada geração de arquivo; usar para detectar versão nova.
- Arquivos podem ser assinados (JWS). Há manual de verificação; implementar a verificação.

#### Ambiente simulado

`https://resultados-sim.tse.jus.br/simulado`, ambiente `simulado2026`. Útil para testes de integração e para o modo replay. Os simulados de 2º turno já ocorreram (22 e 23/10), mas os arquivos podem continuar disponíveis.

### 4.2 Base histórica

- **1º turno 2026 (prioritária):** puxar o EA20 de todos os municípios da eleição 6257. É a melhor base para prever o 2º turno.
- **2º turno 2022 (backtest):** Portal de Dados Abertos do TSE (`dadosabertos.tse.jus.br`), conjuntos de votação por município e por seção.
- **Eleitorado:** vem no próprio EA20/EA12. Se faltar, usar o conjunto de perfil do eleitorado nos Dados Abertos.

### 4.3 Malhas geográficas (mapa)

- **IBGE, API de Malhas v3:** GeoJSON/TopoJSON do Brasil por UF e por município, em qualidade reduzida para a web.
- **De-para TSE x IBGE:** os códigos de município do TSE são diferentes dos do IBGE. O EA12 traz o código IBGE de cada município (confirmar o campo na especificação). Se não trouxer, montar a tabela de equivalência a partir dos Dados Abertos.
- Simplificar a malha municipal (ex.: `mapshaper`) para algo abaixo de 3 MB em TopoJSON.

---

## 5. Arquitetura

```
                 ┌──────────────────────────┐
                 │  TSE (resultados.tse)    │
                 └────────────┬─────────────┘
                              │ polling controlado (só o servidor acessa o TSE)
                 ┌────────────▼─────────────┐
                 │ 1. COLETOR               │  EA14 > EA15 > EA20 alterados
                 │    rate limiter + ETag   │
                 └────────────┬─────────────┘
                              │
                 ┌────────────▼─────────────┐
                 │ 2. BANCO (PostgreSQL)    │  snapshots brutos + séries
                 └────────────┬─────────────┘
                              │
          ┌───────────────────┼────────────────────┐
┌─────────▼────────┐ ┌────────▼─────────┐ ┌────────▼─────────┐
│ 3. MOTOR DE      │ │ 4. MOTOR DE IA   │ │ 5. PUBLICADOR    │
│ PROJEÇÃO         │ │ a cada 10 min    │ │ gera JSON        │
│ a cada ciclo     │ │ (Claude API)     │ │ estáticos        │
└─────────┬────────┘ └────────┬─────────┘ └────────┬─────────┘
          └───────────────────┴────────────────────┘
                              │
                 ┌────────────▼─────────────┐
                 │ 6. nginx / CDN           │  cache curto (15 a 30 s)
                 └────────────┬─────────────┘
                              │
                 ┌────────────▼─────────────┐
                 │ 7. FRONTEND (público)    │  lê só os JSON publicados
                 └──────────────────────────┘
```

### Decisão importante

**O navegador do visitante nunca consulta o TSE nem o banco.** Só o servidor consulta o TSE (respeitando o limite por IP) e publica arquivos JSON estáticos. O público lê esses arquivos via nginx com cache. Isso aguenta pico de acesso em noite de eleição com custo baixo e evita bloqueio de IP.

### Stack sugerida

| Camada | Tecnologia |
|---|---|
| Coletor, motor de projeção, publicador | Python 3.12, `httpx` (async), `pandas`/`numpy`, `APScheduler` |
| API interna (opcional) | FastAPI |
| Banco | PostgreSQL |
| IA | Claude API (modelo Sonnet), saída em JSON |
| Frontend | Next.js com export estático (ou Vite + React), Tailwind |
| Mapa | MapLibre GL JS ou D3 + TopoJSON |
| Gráficos | Recharts ou ECharts |
| Infra | VPS Ubuntu, Docker Compose, nginx, Cloudflare na frente |

### Ciclos de atualização

| Processo | Frequência |
|---|---|
| Leitura EA14 (Brasil) | a cada 30 s |
| Leitura EA15 das UFs alteradas | logo após o EA14 |
| Leitura EA20 dos municípios alterados | logo após o EA15, com fila e limite de 20 req/s |
| Recalcular projeção | a cada ciclo com dados novos (no máximo 1 vez por minuto) |
| Análise da IA | a cada 10 min (e extra quando houver evento relevante, ver 8.4) |
| Publicação dos JSON | a cada ciclo |
| Frontend busca dados | a cada 30 s |

---

## 6. Modelo de dados

### `municipios` (carga única, a partir do EA12 + IBGE)
| Campo | Descrição |
|---|---|
| cd_tse | código TSE, 5 dígitos |
| cd_ibge | código IBGE, 7 dígitos |
| nome | nome |
| uf | sigla |
| regiao | N, NE, CO, SE, S, EXT (exterior) |
| capital | booleano |
| eleitorado_apto | total de aptos |
| porte | faixa de eleitorado (até 10 mil, 10 a 50 mil, 50 a 200 mil, 200 mil a 1 mi, acima de 1 mi) |

### `base_1turno` (carga única, a partir do EA20 da eleição 6257)
| Campo | Descrição |
|---|---|
| cd_tse | município |
| votos_lula, votos_flavio, votos_outros | votos nominais |
| brancos, nulos, validos | totais |
| comparecimento, abstencao | totais |
| share2_lula | votos_lula / (votos_lula + votos_flavio) |
| taxa_comparecimento | comparecimento / aptos |
| taxa_validos | válidos / comparecimento |

### `snapshot_raw`
Guarda o JSON bruto de cada arquivo baixado: `arquivo`, `idg`, `data_hora_tse`, `baixado_em`, `payload` (JSONB). Essencial para auditoria e para o modo replay.

### `apuracao_atual` (uma linha por abrangência: BR, UF, município)
| Campo | Descrição |
|---|---|
| abrangencia, codigo | BR / UF / município |
| secoes_total, secoes_totalizadas, pct_secoes | andamento |
| eleitorado_apurado | eleitores das seções já totalizadas |
| comparecimento, abstencao | totais apurados |
| votos_lula, votos_flavio, brancos, nulos, validos | totais apurados |
| pct_lula, pct_flavio | sobre válidos |
| matematicamente_definido | indicador oficial do TSE, se houver no EA20 |
| atualizado_tse | data/hora informada pelo TSE |

### `serie_temporal`
Uma linha por ciclo e por abrangência (BR, regiões, UFs): `momento`, `pct_secoes`, `pct_lula`, `pct_flavio`, `proj_p1_lula`, `proj_p2_lula`, `ic_inf`, `ic_sup`, `prob_lula`, `prob_flavio`. Alimenta os gráficos de linha do tempo.

### `analises_ia`
`momento`, `entrada_json`, `saida_json`, `modelo`, `validacao_ok`, `publicada`.

---

## 7. Algoritmos

### 7.1 Coleta incremental

```
loop a cada 30 s:
    ab_br = GET br-e006258-ab.json (com If-None-Match)
    se não mudou: continua
    ufs_alteradas = UFs cuja data/hora de totalização mudou desde o último ciclo
    para cada uf em ufs_alteradas:
        GET {uf}-c0001-e006258-u.json   (placar da UF)
        ab_uf = GET {uf}-e006258-ab.json
        muns_alterados = municípios com data/hora alterada
        enfileira EA20 de cada município alterado
    GET br-c0001-e006258-u.json (placar nacional)
    worker da fila: token bucket de 20 req/s, retry com backoff,
                    nunca reenvia URL que deu 404 (marca e alerta)
```

- Validar sempre: soma dos municípios da UF bate com o arquivo da UF (tolerância por defasagem de sincronização da CDN).
- Se o TSE não responder, manter último dado e exibir aviso "dados oficiais sem atualização desde HH:MM". Nunca inventar número.

### 7.2 Indicadores diretos (placar oficial, P0)

Para cada abrangência:
- `% seções totalizadas`
- `% Lula` e `% Flávio` sobre válidos
- `diferença em votos` e `diferença em pontos percentuais`
- `comparecimento` e `abstenção` (comparar com o 1º turno do mesmo local)
- `brancos e nulos`
- `swing observado` = `% Lula 2º turno` menos `share2_lula do 1º turno`, nos locais com apuração relevante

### 7.3 Votos que faltam (base de todas as projeções)

Para cada município `m`:

```
eleitores_restantes_m = eleitorado_apto_m - eleitorado_apurado_m
```

Se o EA20 não trouxer o eleitorado apurado, aproximar por `eleitorado_apto_m × (1 - pct_secoes_m)`.

Taxa de comparecimento esperada nos eleitores restantes:

```
se pct_secoes_m >= 20%:
    t_m = comparecimento_apurado_m / eleitorado_apurado_m
senão:
    t_m = taxa_comparecimento_1turno_m × fator_comparecimento_uf
```

onde `fator_comparecimento_uf` é a razão entre o comparecimento do 2º e do 1º turno nos municípios da UF já bem apurados (cai para o fator da região e depois para o nacional se a UF tiver pouca apuração).

Taxa de válidos esperada (`v_m`): mesma lógica, usando válidos / comparecimento.

```
validos_restantes_m = eleitores_restantes_m × t_m × v_m
```

### 7.4 Projeção P1: por região (a versão didática)

Para cada região `r` (N, NE, CO, SE, S, Exterior):

```
validos_restantes_r = soma de validos_restantes_m na região
pct_lula_r = % atual de Lula na região
              (se a região tiver menos de 5% apurado, usar share2_lula do 1º turno da região)
lula_proj_r = votos_lula_apurados_r + validos_restantes_r × pct_lula_r
```

Somar todas as regiões e dividir pelo total projetado de válidos.

É exatamente a ideia "se seguir assim em cada região, o resultado final será este". Fácil de explicar ao público. Limitação: assume que o que falta em cada região vota igual ao que já foi apurado, o que nem sempre é verdade (capital x interior, por exemplo).

### 7.5 Projeção P2: modelo de swing hierárquico (principal)

**Ideia:** cada município tende a repetir o comportamento do 1º turno, ajustado por um desvio (swing) que é medido em tempo real nos municípios já apurados, primeiro em nível de UF, depois região, depois Brasil.

**Passo 1: base de cada município (prior)**
```
p0_m = share2_lula_1turno_m          # Lula / (Lula + Flávio) no 1º turno
```
Os votos dos demais candidatos do 1º turno (cerca de 8% dos válidos) se redistribuem no 2º turno. Essa transferência não é modelada à parte: ela já aparece dentro do swing medido.

**Passo 2: trabalhar em escala logit** (evita projeções abaixo de 0% ou acima de 100% em municípios muito polarizados)
```
logit(p) = ln(p / (1 - p))
```

**Passo 3: medir o swing nos municípios bem apurados**

Usar municípios com `pct_secoes_m >= 50%`:
```
d_m = logit(pct_lula_atual_m) - logit(p0_m)
```

Swing de cada nível, ponderado pelos votos válidos apurados:
```
swing_br  = média ponderada de d_m no Brasil
swing_reg = média ponderada de d_m na região
swing_uf  = média ponderada de d_m na UF
```

**Passo 4: encolhimento (shrinkage)** para não confiar demais em poucas amostras
```
n_uf = votos válidos apurados nos municípios usados da UF
swing_reg_aj = (n_reg × swing_reg + K_reg × swing_br)     / (n_reg + K_reg)
swing_uf_aj  = (n_uf  × swing_uf  + K_uf  × swing_reg_aj) / (n_uf  + K_uf)
```
Valores iniciais sugeridos: `K_uf = 200.000` e `K_reg = 1.000.000` votos. Calibrar no backtest.

**Passo 5: share esperado nos votos que faltam de cada município**
```
p_prior_m = inv_logit( logit(p0_m) + swing_uf_aj(uf de m) )

w_m = votos_validos_apurados_m / (votos_validos_apurados_m + TAU)    # TAU inicial: 2.000
p_rest_m = w_m × pct_lula_atual_m + (1 - w_m) × p_prior_m
```
Quanto mais o município já apurou, mais pesa o resultado real dele; quanto menos apurou, mais pesa a base histórica ajustada.

**Passo 6: somar**
```
lula_proj   = soma( votos_lula_apurados_m   + validos_restantes_m × p_rest_m )
flavio_proj = soma( votos_flavio_apurados_m + validos_restantes_m × (1 - p_rest_m) )
pct_lula_proj = lula_proj / (lula_proj + flavio_proj)
```
Exterior (`zz`) entra como um bloco próprio, com a mesma lógica.

**Passo 7: projeção por UF e região** sai da mesma soma, filtrada.

### 7.6 Incerteza e probabilidade (Monte Carlo)

Rodar `N = 5.000` simulações a cada recálculo (com numpy vetorizado leva poucos segundos):

```
para cada simulação s:
    swing_uf_s  ~ Normal(swing_uf_aj, sigma_uf²)      # incerteza do swing de cada UF
    erro_m_s    ~ Normal(0, sigma_mun²)               # desvio próprio de cada município
    t_m_s       = t_m × Normal(1, sigma_comp²)        # incerteza do comparecimento
    recalcula p_rest_m e validos_restantes_m
    pct_lula_s = resultado nacional da simulação
```

- `sigma_uf`: erro padrão do swing da UF (dispersão dos `d_m` dividida pela raiz do número efetivo de municípios), com piso mínimo (ex.: 0,05 em logit) para não ficar otimista demais.
- `sigma_mun`: desvio padrão dos resíduos `d_m - swing_uf` nos municípios apurados.
- `sigma_comp`: 0,03 inicial.

Saídas:
- `pct_lula_proj` (mediana)
- intervalo de 95% (percentis 2,5 e 97,5)
- `prob_lula = fração das simulações com Lula acima de 50%`
- `prob_flavio = 1 - prob_lula`

### 7.7 Nível de confiança exibido

| Nível | Regra |
|---|---|
| Insuficiente | menos de 5% das seções ou menos de 15 UFs com dados. Mostrar só placar, sem projeção |
| Baixa | intervalo de 95% com mais de 4 p.p. de largura |
| Média | entre 2 e 4 p.p. |
| Alta | menos de 2 p.p. |

### 7.8 Regras de linguagem e exibição da projeção

- A projeção nunca "declara vencedor". Texto padrão: "Projeção estatística: Fulano tende a terminar com X% (faixa de Y% a Z%)".
- Só usar "tendência consolidada" quando `prob >= 99%`, confiança Alta e pelo menos 70% das seções apuradas.
- "Eleito" ou "matematicamente definido" **somente** quando o próprio TSE indicar no EA20.
- Toda tela com projeção leva o aviso: "Projeção estatística independente. Não é resultado oficial. Resultado oficial: TSE."

### 7.9 Decomposição: de onde vêm os votos que faltam

Para cada região e UF:
```
saldo_esperado_r = validos_restantes_r × (2 × p_rest_r - 1)
```
Positivo: vantagem líquida esperada para Lula nos votos que faltam. Negativo: para Flávio.

Vira o gráfico mais explicativo do portal: "Faltam X milhões de votos no Nordeste, que devem render saldo de +Y para Lula; faltam Z no Sul, com saldo de +W para Flávio."

Também calcular:
- **Votos necessários para virar:** quantos % dos votos restantes o candidato que está atrás precisa para empatar. Comparar com o que ele vem fazendo.
- **Ponto de virada projetado:** em que % da apuração a curva do placar oficial deve cruzar, se cruzar.

### 7.10 Detecção de eventos (alimenta a IA e alertas na tela)

| Evento | Regra |
|---|---|
| Virada no placar oficial | líder do P0 mudou |
| Virada projetada | líder do P2 mudou |
| Mudança forte de probabilidade | `prob` variou mais de 10 p.p. em 10 min |
| UF fora do padrão | swing da UF com mais de 2 desvios padrão de distância do swing da região |
| Município fora do padrão | resíduo do município acima de 3 desvios padrão e mais de 10 mil votos |
| Comparecimento atípico | comparecimento da UF difere mais de 5 p.p. do 1º turno |
| Fonte parada | TSE sem atualização há mais de 5 min durante apuração ativa |
| Grandes colégios | marcos de 50%, 90% e 100% em SP, MG, RJ, BA, RS, PR, PE, CE |

### 7.11 Backtest e calibração

- Reproduzir o 2º turno de 2022 usando o 1º turno de 2022 como base.
- Simular a ordem de chegada dos votos: usar a ordem real se for possível reconstruir; senão, sortear a ordem das seções com atraso maior para Nordeste e capitais (que foi o padrão de 2022).
- Medir em cada ponto da apuração (10%, 20%... 90%): erro da P1, erro da P2, cobertura do intervalo de 95% (deveria conter o resultado real em cerca de 95% dos casos).
- Calibrar `K_uf`, `K_reg`, `TAU` e os pisos de sigma.
- Depois da eleição, rodar o mesmo backtest com os snapshots reais de 2026 guardados em `snapshot_raw`.

---

## 8. Camada de IA

### 8.1 Papel

Redigir, a cada 10 minutos, uma análise curta, neutra e verificável do momento da apuração. Ela não calcula nada.

### 8.2 Entrada (JSON montado pelo motor)

```json
{
  "momento": "2026-10-25T19:20:00-03:00",
  "apuracao": { "pct_secoes": 71.4, "pct_lula": 49.2, "pct_flavio": 50.8, "dif_votos": -1180000 },
  "projecao_p1": { "pct_lula": 50.6 },
  "projecao_p2": { "pct_lula": 50.9, "ic95": [50.1, 51.7], "prob_lula": 0.97, "confianca": "media" },
  "regioes": [
    { "regiao": "NE", "pct_secoes": 58.0, "pct_lula": 66.1, "validos_restantes": 7900000, "saldo_esperado": 2500000, "swing_vs_1turno": 1.8 }
  ],
  "ufs_destaque": [],
  "eventos_desde_ultima_analise": ["virada_projetada", "SP passou de 90% apurado"],
  "analise_anterior_resumo": "...",
  "comparacao_1turno": {}
}
```
(Os números acima são apenas ilustrativos do formato.)

### 8.3 Saída exigida (JSON)

```json
{
  "titulo": "até 90 caracteres",
  "resumo": "3 a 5 frases",
  "destaques": ["até 4 itens curtos"],
  "o_que_falta": "1 a 2 frases sobre os votos restantes e onde estão",
  "confianca": "baixa | media | alta",
  "aviso": "Projeção estatística independente. Resultado oficial: TSE."
}
```

### 8.4 Regras do prompt de sistema

- Usar somente os números recebidos. Proibido estimar, arredondar de forma diferente ou citar dados externos.
- Tom jornalístico, sóbrio e neutro. Mesmo tratamento e mesmos verbos para os dois candidatos.
- Proibido: adjetivos sobre candidatos, opinião, previsão de comportamento futuro do eleitor, expressões como "vitória garantida", "já ganhou", "derrota certa".
- Sempre explicar *por que* a projeção difere do placar (ordem de chegada dos votos por região).
- Nunca usar travessão.
- Temperatura baixa (0,2).

### 8.5 Validação antes de publicar

1. JSON válido e com todos os campos.
2. **Checagem de números:** extrair todos os números do texto e conferir se cada um existe na entrada (tolerância de arredondamento de 0,1). Número sem origem: reprovar.
3. Lista de termos proibidos.
4. Reprovou: tentar mais uma vez; reprovou de novo, publicar **texto de template** preenchido pelo próprio sistema (sem IA) e registrar o erro.

### 8.6 Gatilhos extras

Além do ciclo de 10 min, disparar análise imediata em: virada no placar oficial, virada projetada, mudança de confiança para Alta, indicação oficial de resultado definido pelo TSE. Intervalo mínimo entre análises: 3 min.

### 8.7 Histórico

Todas as análises publicadas ficam visíveis numa linha do tempo ("19h20: ...", "19h30: ..."), o que vira conteúdo por si só e mostra a evolução da leitura.

---

## 9. O portal

### 9.1 Páginas

| Página | Conteúdo |
|---|---|
| **Início** | Placar oficial, projeção, mapa, curva da apuração, análise da IA, "de onde vêm os votos que faltam" |
| **Região** | Mesmo layout filtrado por região |
| **Estado** | Placar e projeção da UF, mapa municipal da UF, ranking de municípios, comparação com o 1º turno |
| **Município** | Placar, % apurado, comparação com 1º turno, posição no contexto da UF |
| **Linha do tempo** | Todas as análises da IA e eventos, em ordem |
| **Replay** | Controle de reprodução (play, pausa, velocidade, barra de tempo) que recompõe placar, mapa, projeção e análises da IA em qualquer momento da apuração, a partir de `snapshot_raw` |
| **Metodologia** | Explicação em linguagem simples das três camadas, fontes, limitações, fórmula resumida |
| **Sobre e avisos** | Independência, ausência de vínculo partidário, fonte oficial, contato |

### 9.2 Bloco principal (topo da Início)

- **Placar oficial:** barras horizontais com % e votos dos dois candidatos, % de seções totalizadas, horário da última atualização do TSE.
- **Projeção:** % projetado de cada um, faixa de 95%, probabilidade, selo de confiança.
- **Frase-resumo da IA** (título + resumo).
- Selo "Projeção não é resultado oficial" sempre visível ao lado.

### 9.3 Mapa interativo

- **Níveis:** Brasil por UF > clique na UF > municípios da UF. Botão para ver todos os municípios do Brasil (com malha simplificada).
- **Camadas (seletor):**
  1. Quem lidera e por quanto (escala divergente pela margem)
  2. % apurado (escala sequencial)
  3. Variação em relação ao 1º turno (swing)
  4. Projeção final
  5. Votos que faltam (círculos proporcionais)
  6. Comparecimento x 1º turno
- **Tooltip:** nome, % apurado, votos e % de cada candidato, resultado do 1º turno, swing, projeção.
- Legenda sempre visível, com escala numérica.
- Opção de cartograma por eleitorado, já que mapa geográfico exagera visualmente estados grandes e pouco populosos.

### 9.4 Gráficos

| Gráfico | Descrição |
|---|---|
| Curva da apuração | eixo X: % seções; eixo Y: % Lula e % Flávio. Mostra o placar mudando ao longo da noite |
| Evolução da projeção | eixo X: horário; linha da projeção P2 com faixa sombreada do intervalo; linha do placar oficial por cima |
| Probabilidade ao longo do tempo | linha de 0 a 100% |
| Votos que faltam por região | barras: apurado x restante, com o saldo esperado de cada região |
| Comparação 1º x 2º turno | por UF, barras lado a lado |
| Ranking de UFs | tabela ordenável: % apurado, % de cada candidato, swing, projeção, saldo esperado |

### 9.5 Filtros

- **Região:** Norte, Nordeste, Centro-Oeste, Sudeste, Sul, Exterior
- **Estado:** 27 UFs
- **Município:** busca por nome com autocomplete
- **Tipo de município:** capital, região metropolitana, interior
- **Porte por eleitorado:** até 10 mil, 10 a 50 mil, 50 a 200 mil, 200 mil a 1 milhão, acima de 1 milhão
- **Situação da apuração:** não iniciada, parcial, concluída
- **Resultado:** onde cada candidato lidera; onde houve virada em relação ao 1º turno
- **Swing:** municípios onde cada candidato cresceu mais em relação ao 1º turno
- Todos os filtros refletem na URL (link compartilhável)

### 9.6 Requisitos de interface

- Mobile em primeiro lugar (a maior parte do acesso será pelo celular).
- Modo claro e escuro.
- **Cores neutras e fixas por candidato**, sem usar as cores oficiais dos partidos. Ordem fixa pelo número de urna (13, depois 22) em todo o portal, nunca pelo líder.
- Fotos oficiais dos candidatos via arquivo de fotos do TSE (`.../ele2026/6258/fotos/br/{sqcand}.jpeg`, confirmar na documentação).
- Acessibilidade: contraste AA, mapa com alternativa em tabela, navegação por teclado.
- Indicador "ao vivo" com contagem do tempo desde a última atualização.
- Botão de compartilhar com imagem gerada do placar.

---

## 10. Neutralidade, transparência e conformidade

- **Fonte única:** apenas dados oficiais do TSE. Nenhuma pesquisa de opinião entra no modelo.
- **Transparência:** página de metodologia completa; publicar o código do motor de projeção (recomendado) para quem quiser auditar.
- **Distinção clara entre resultado oficial e projeção** em todas as telas, em todos os textos da IA e em toda imagem compartilhável.
- **Regras do TSE:** seguir os artigos 264 a 269 da Resolução TSE nº 23.751/2026 sobre entidades que divulgam resultados.
- **Projeção não é pesquisa eleitoral:** o portal trabalha só com votos oficiais já totalizados, sem entrevistas. Mesmo assim, **validar com assessoria jurídica eleitoral** antes de divulgar ao público, especialmente a forma de apresentar probabilidades.
- **LGPD:** sem login, sem coleta de dados pessoais; analytics anonimizado.
- **Sem publicidade política** e sem vínculo com campanhas.
- **Moderação:** sem comentários abertos no portal.

---

## 11. Infraestrutura e desempenho

- Docker Compose com serviços: `coletor`, `motor` (projeção + IA + publicador), `postgres`, `nginx`.
- nginx serve `/data/*.json` com `Cache-Control: max-age=15` e gzip/brotli.
- Cloudflare na frente para absorver pico de acesso.
- Estrutura dos JSON publicados:
  ```
  /data/latest/br.json             placar + projeções + regiões + IA
  /data/latest/uf/{uf}.json        placar + projeção da UF + municípios da UF
  /data/latest/municipios.json     resumo leve de todos os municípios (para o mapa nacional)
  /data/timeline/br.json           série temporal nacional
  /data/timeline/uf/{uf}.json      série temporal por UF
  /data/ia/historico.json          todas as análises publicadas
  /data/status.json                saúde da coleta, último IDG, último horário TSE
  /data/replay/{eleicao}/index.json        lista de momentos gravados
  /data/replay/{eleicao}/{momento}.json    estado completo naquele momento
  ```
- Monitoramento: alerta (WhatsApp via Evolution API ou e-mail) se o coletor parar, se houver 404, se a validação de somas falhar ou se a IA for reprovada.
- Ensaiar no ambiente simulado do TSE antes de apontar para o oficial.

---

## 12. Requisitos não funcionais

| Requisito | Meta |
|---|---|
| Atraso entre TSE e portal | menos de 60 s |
| Recálculo completo da P2 com Monte Carlo | menos de 15 s |
| Carregamento inicial no celular (4G) | menos de 3 s |
| Disponibilidade na noite da eleição | 99,9% |
| Requisições ao TSE | nunca acima de 20 por segundo |
| Rastreabilidade | todo número exibido deve ser reproduzível a partir de `snapshot_raw` |

---

## 13. Testes

- **Unitários:** montagem de URLs (zeros à esquerda), parser do EA20, fórmulas de P1 e P2, logit, shrinkage.
- **Propriedade:** com 100% apurado, P1 e P2 têm que ser idênticas ao placar oficial.
- **Integração:** rodar contra o ambiente simulado do TSE.
- **Replay:** alimentar o sistema com snapshots gravados em ordem e conferir a evolução.
- **Carga:** simular milhares de acessos simultâneos aos JSON estáticos.
- **IA:** bateria de entradas com casos extremos (virada, empate técnico, dados parados) para conferir validação e linguagem.

---

## 14. Plano de execução no Claude Code

Ordem sugerida de tarefas (cada item pode ser um prompt):

1. **Estrutura do repositório:** monorepo com `/collector`, `/engine`, `/web`, `/infra`, `docker-compose.yml`, `.env.example` (chave da Claude API, URL base do TSE, ambiente oficial ou simulado, códigos de eleição).
2. **Leitura das especificações:** baixar EA11, EA12, EA14, EA15 e EA20 e gerar `docs/tse-campos.md` com o mapeamento real dos campos. Ajustar este briefing onde houver divergência.
3. **Cliente TSE:** construtor de URLs a partir do EA12, rate limiter, ETag, retry, bloqueio de URL com 404.
4. **Carga de base:** municípios + de-para IBGE + 1º turno (6257) completo.
5. **Coletor incremental** do 2º turno (6258) gravando `snapshot_raw` e `apuracao_atual`.
6. **Motor P1 e P2** com Monte Carlo, testes unitários e teste de 100% apurado.
7. **Detector de eventos.**
8. **Módulo de IA** com prompt, validação de números e fallback de template.
9. **Publicador** de JSON estáticos.
10. **Frontend:** Início, mapa por UF, curva de apuração, bloco de projeção, análise da IA.
11. **Frontend:** páginas de UF e município, filtros, mapa municipal.
12. **Metodologia e avisos.**
13. **Infra:** Docker, nginx, Cloudflare, monitoramento.
14. **Ensaio** no ambiente simulado.
15. **Modo replay e backtest.**

### Prompt inicial sugerido para o Claude Code

> Leia o arquivo `briefing-portal-apuracao-2026.md` por completo. Depois execute a tarefa 1 e a tarefa 2 do plano de execução. Na tarefa 2, baixe as especificações oficiais do TSE e compare os nomes de campos com os citados no briefing, listando divergências antes de escrever qualquer parser. Não monte nenhuma URL do TSE fora do padrão documentado e nunca faça mais de 20 requisições por segundo.

---

## 15. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Bloqueio de IP pelo TSE | rate limiter, URLs só a partir do EA12, sem 404, só o servidor acessa o TSE |
| Formato do JSON diferente do esperado | tarefa 2 obrigatória antes do parser; validação de esquema; ensaio no simulado |
| Projeção errada no início da apuração | não exibir projeção com menos de 5% apurado; faixa de incerteza larga; selo de confiança |
| Viés de ordem dentro do município (zonas apuradas primeiro) | peso `w_m` mistura resultado real e base histórica até o município avançar |
| IA inventar número ou soar parcial | validação automática de números, termos proibidos, fallback de template |
| Pico de acesso | JSON estáticos, cache, CDN |
| Interpretação do público como "resultado" | avisos em todas as telas, linguagem de projeção, metodologia aberta |
| Questionamento jurídico | validação prévia com assessoria eleitoral; transparência total do método |
| Reaproveitamento em outras eleições | códigos de eleição, cargo e candidatos em configuração; nada fixo no código |

---

## 16. Glossário de campos do EA20 (referência, confirmar na especificação)

Campos usados em versões anteriores e que provavelmente se mantêm, já que o TSE informou que o modelo de 2026 é bastante semelhante ao de 2024:

| Campo | Significado provável |
|---|---|
| `ele`, `cdabr`, `tpabr` | eleição, código e tipo de abrangência |
| `dg`, `hg` | data e hora de geração |
| `dt`, `ht` | data e hora da totalização |
| `idg` | identificador único da geração do arquivo |
| `and` | andamento (`f` = final) |
| `s.st`, `s.stt`, `s.pst` | seções totais, totalizadas, percentual |
| `e.te`, `e.ea` | eleitorado total, eleitorado apurado |
| `e.c`, `e.a` | comparecimento, abstenção |
| `v.vv`, `v.vb`, `v.vn` | votos válidos, brancos, nulos |
| `cand[].n`, `cand[].nm` | número e nome do candidato |
| `cand[].vap`, `cand[].pvap` | votos apurados e percentual |
| `cand[].e` | eleito |
| `md` | matematicamente definido |

Regra para presidente (confirmada pelo TSE): o arquivo municipal e o estadual ficam com `and=f` quando não há mais seções a totalizar; o arquivo Brasil fica com `and=f` na totalização final.

---

*Fim do briefing.*
