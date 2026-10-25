# Backtest real 2022 (1º turno → 2º turno, Lula × Bolsonaro): calibração do P2

Gerado por `backtest/b2022.py` (re-executável: `.venv/bin/python -m backtest.b2022 [realismo|calibrar|replay] [--md]`).

## 1. Dados (somente Portal de Dados Abertos do TSE / cdn.tse.jus.br)

| Arquivo | Uso |
|---|---|
| `votacao_candidato_munzona_2022.zip` (CSV `_BR`, cargo Presidente) | votos por candidato × município × zona, turnos 1 e 2 |
| `detalhe_votacao_munzona_2022.zip` (CSV `_BR`) | aptos, comparecimento, válidos, brancos, nulos, seções por zona; base do 1º turno |
| `bweb_2t_{UF}_311020221535.zip` (dataset "Resultados 2022 – Boletim de Urna", 28 arquivos, 67 MB) | **um registro por seção com `DT_BU_RECEBIDO`**: ordem real de chegada no 2º turno |

Nenhuma requisição foi feita a `resultados.tse.jus.br`. Os arquivos ficam em `data/backtest2022/` (gitignored), com caches parquet.

Checagens:
* Os totais dos boletins batem exatamente com o oficial: Lula 60.345.999 × Bolsonaro 58.206.354 (50,902%), comparecimento 124.252.796.
* Base do 1º turno: 5.710 municípios (incluindo 140 cidades do exterior, UF `zz` → região EXT). Covariáveis individuais: `o_12` (Ciro) e `o_15` (Tebet); os demais candidatos entram somados em `o_resto`. Capital e código IBGE vêm de um join por `cd_tse` com a base de 2026. Dois municípios do 2º turno não têm base no 1º (6 votos ao todo) e recebem a média da UF.

## 2. Ordem de chegada: a REAL, não simulada

A ordem de 2022 foi reconstruída por seção a partir de `DT_BU_RECEBIDO`. Os BUs do exterior recebidos antes das 17h entram todos no primeiro lote, porque o TSE só divulga a partir das 17h de Brasília. Validação contra fatos conhecidos:

| | reconstrução | histórico (imprensa) |
|---|---|---|
| Lula passa à frente no placar oficial (P0) | **67,6% das seções, 18h43** | 67,76%, 18h44 (50,01 × 49,99) |
| % apurado às 19h55/19h56 | 98,8% | 98,8% a 98,9% (TSE declara a definição matemática) |
| Lula na frente no início; Bolsonaro passa à frente | 17h07, com 0,22% das seções | 17h09 |

Observações:
* **O exterior NÃO chegou por último em 2022.** Dos 1.018 BUs do exterior, 56% foram recebidos antes das 17h (mediana 16h09), então ele entra logo no início. A instrução "exterior por último" não bate com os dados. Segui os dados.
* A abordagem anterior, com rampa sintética por zona e o horário da última totalização da zona, produziu a virada em ~38%, e com ajuste chegou a ~68%. Mas tornava cada zona uma amostra quase aleatória das suas seções, e com isso o erro da P2 caía artificialmente para ~0,07 p.p. já a 5%. **Uma ordem sintética "aleatória dentro do município" é otimista demais.** Isso também vale para `backtest/sintetico.py`, cujo viés de ordem é aleatório e de média zero.
* Sementes: seed 0 = ordem real exata. Seeds 1 a 5 = ordem real perturbada (atraso aleatório por UF σ=8 min, por zona σ=10 min, por seção σ=5 min). Nessas sementes a virada do P0 cai entre 58% e 80%. São apurações alternativas plausíveis em torno da mesma verdade.

## 3. Protocolo

Pontos: 5, 10, 20, …, 90% das seções. Métricas: |erro| de P0/P1/P2 contra o final (50,902%), viés da P2, cobertura e largura do IC95, z = (P2 − final)/(largura/3,92), probabilidade de Lula e Brier.
Busca: coordenada, em paralelo, com n_sim=1000, seeds 0 a 3 e 3 passadas. Perda = 10·média(max(|z|−1,5, 0)²) + 5·Σ_pontos max(0,95 − cobertura, 0) + 0,5·largura média + |erro P2| médio.
A margem em |z|>1,5 e o veto a reduzir `sig_nat0`, `sig_reg0` e `kappa` abaixo do default são deliberados. Há **uma única eleição real**, e as sementes são fortemente correlacionadas (mesma verdade). Estreitar o IC do início da apuração porque 2022 teve erro pequeno nessa fase seria sobreajuste.
Tabelas finais: seeds 0 a 5, n_sim=5000.

## 4. Resultados (seeds 0 a 5, n_sim=5000, final = 50,902% Lula)

Colunas: `err_*` = |erro| médio em p.p.; `vies_p2` = P2 − final; `cobre` = fração das sementes com o final dentro do IC95 nacional; `z_abs_max` = pior |z| entre as sementes; `prob`/`prob_min` = P(Lula) média/mínima; `cob_uf`/`zrms_uf` = cobertura do IC95 e z RMS **por UF** (só UFs não concluídas).

### 4.1 Params default

Perda 2,441 · err_p2 0,425 · cobertura 98,3% · largura 2,64 · Brier 0,071 · cobertura UF 83,1%

| ponto | secoes | err_p0 | err_p1 | err_p2 | vies_p2 | largura | cobre | z_abs_max | prob | prob_min | brier | cob_uf | zrms_uf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 5% | 5.000 | 3.749 | 1.000 | 0.235 | -0.167 | 5.782 | 1.000 | 0.237 | 0.705 | 0.671 | 0.088 | 0.970 | 0.703 |
| 10% | 10.000 | 2.974 | 0.670 | 0.486 | -0.486 | 5.142 | 1.000 | 0.578 | 0.639 | 0.562 | 0.132 | 0.970 | 0.712 |
| 20% | 20.000 | 2.402 | 0.773 | 0.677 | -0.677 | 4.244 | 1.000 | 0.749 | 0.592 | 0.545 | 0.168 | 0.964 | 0.794 |
| 30% | 30.000 | 2.019 | 0.785 | 0.685 | -0.685 | 3.480 | 1.000 | 0.798 | 0.609 | 0.591 | 0.153 | 0.940 | 0.960 |
| 40% | 40.000 | 1.670 | 0.784 | 0.634 | -0.634 | 2.679 | 1.000 | 0.998 | 0.670 | 0.636 | 0.109 | 0.917 | 1.117 |
| 50% | 50.000 | 1.383 | 0.756 | 0.542 | -0.542 | 2.028 | 1.000 | 1.103 | 0.779 | 0.763 | 0.049 | 0.845 | 1.313 |
| 60% | 60.000 | 1.145 | 0.679 | 0.427 | -0.427 | 1.416 | 1.000 | 1.335 | 0.919 | 0.912 | 0.007 | 0.796 | 1.515 |
| 70% | 70.000 | 0.932 | 0.581 | 0.296 | -0.296 | 0.908 | 1.000 | 1.430 | 0.992 | 0.990 | 0.000 | 0.697 | 1.843 |
| 80% | 80.000 | 0.699 | 0.447 | 0.180 | -0.180 | 0.501 | 1.000 | 1.650 | 1.000 | 1.000 | 0.000 | 0.625 | 2.323 |
| 90% | 90.000 | 0.444 | 0.285 | 0.090 | -0.090 | 0.198 | 0.833 | 2.063 | 1.000 | 1.000 | 0.000 | 0.590 | 3.218 |

### 4.2 Params calibrados (`backtest/params_calibrados.json`)

Perda 1,598 · err_p2 0,167 · cobertura 100% · largura 2,86 · Brier 0,029 · cobertura UF 94,6%

| ponto | secoes | err_p0 | err_p1 | err_p2 | vies_p2 | largura | cobre | z_abs_max | prob | prob_min | brier | cob_uf | zrms_uf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 5% | 5.000 | 3.749 | 1.000 | 0.110 | 0.110 | 5.906 | 1.000 | 0.133 | 0.768 | 0.745 | 0.054 | 1.000 | 0.219 |
| 10% | 10.000 | 2.974 | 0.670 | 0.135 | -0.122 | 5.421 | 1.000 | 0.187 | 0.731 | 0.690 | 0.073 | 1.000 | 0.281 |
| 20% | 20.000 | 2.402 | 0.773 | 0.208 | -0.208 | 4.578 | 1.000 | 0.235 | 0.739 | 0.716 | 0.068 | 1.000 | 0.400 |
| 30% | 30.000 | 2.019 | 0.785 | 0.224 | -0.224 | 3.793 | 1.000 | 0.322 | 0.772 | 0.737 | 0.052 | 0.994 | 0.546 |
| 40% | 40.000 | 1.670 | 0.784 | 0.235 | -0.235 | 2.996 | 1.000 | 0.338 | 0.826 | 0.813 | 0.030 | 0.982 | 0.659 |
| 50% | 50.000 | 1.383 | 0.756 | 0.217 | -0.217 | 2.291 | 1.000 | 0.412 | 0.891 | 0.870 | 0.012 | 0.970 | 0.777 |
| 60% | 60.000 | 1.145 | 0.679 | 0.198 | -0.198 | 1.634 | 1.000 | 0.543 | 0.957 | 0.947 | 0.002 | 0.946 | 0.870 |
| 70% | 70.000 | 0.932 | 0.581 | 0.161 | -0.161 | 1.087 | 1.000 | 0.720 | 0.995 | 0.993 | 0.000 | 0.899 | 1.033 |
| 80% | 80.000 | 0.699 | 0.447 | 0.116 | -0.116 | 0.631 | 1.000 | 0.905 | 1.000 | 1.000 | 0.000 | 0.874 | 1.230 |
| 90% | 90.000 | 0.444 | 0.285 | 0.069 | -0.069 | 0.269 | 1.000 | 1.242 | 1.000 | 1.000 | 0.000 | 0.794 | 1.730 |

Parâmetros escolhidos (os demais ficam no default):

| campo | default | calibrado | comentário |
|---|---|---|---|
| s_ord | 0,15 | **1,0** | maior ganho: confia pouco na parcial de município incompleto (ver §5.1). Perda plana para s_ord ≥ 1 |
| s_mun | 0,12 | **0,045** | plano entre 0,03 e 0,045 |
| k_uf | 12 | **6** | pouca sensibilidade (±0,01 na perda). Atenção: os k são multiplicados por 1/s_mun²; com s_mun 0,12→0,045 a unidade cresceu ~7×, então em termos absolutos o encolhimento ficou **mais forte**, não mais fraco |
| k_reg | 40 | **10** | pouca sensibilidade |
| k_cov | 60 | **120** | 15 a 30 piora; 60 a 240 praticamente igual |
| sig_uf_min | 0,015 | **0,05** | escolhido pela cobertura por UF (§5.2); custa ~0,2 p.p. de largura nacional |
| sig_nat0 / sig_reg0 / kappa | 0,045 / 0,05 / 1,0 | **iguais** | a busca queria reduzir; vetado por segurança (uma eleição só) |
| sig_nat_min | 0,012 | **0,012** | 0,008 sub-cobre a 90%; 0,02 ou mais só alarga |
| sig_reg_min | 0,010 | **0,005** | |
| min_mun_cov | 200 | 200 | **sem efeito**: já a 5% há mais de 1.400 municípios com dados |

Leitura:
* O erro médio da P2 calibrada fica ≤ 0,24 p.p. em todos os pontos, e ela acerta o lado em todos os pontos e sementes: P(Lula) ≥ 0,69 desde 5%, enquanto o placar oficial mostrava Bolsonaro à frente até 67,6%. Com os defaults, P(Lula) ficava em 0,55 a 0,67 entre 10% e 40% (viés de −0,68 p.p.). A P1 erra 0,3 a 1,0 p.p.; o P0, até 3,7 p.p.
* A cobertura nacional ficou em 100% com folga (|z| máx 1,24). É levemente conservadora, como pedido, e a largura média é quase a mesma do default (2,86 × 2,64).
* O Brier caiu de 0,071 para 0,029. Ressalva: com um único resultado real o Brier é quase degenerado, então olhe a trajetória de `prob`.
* Bandeiras do portal no Replay (seed 0, params calibrados): "insuficiente" até 4,5%; "baixa" de 6,9% a 25,8%; "média" de 28,7% a 51,8%; "alta" a partir de 56,1% (18h32). **`tendencia_consolidada` liga a 72,2% (18h48, P(Lula)=0,997)** e não desliga mais. É ~4 min depois da virada do placar e ~67 min antes da definição matemática do TSE (19h55). A tendência nunca foi consolidada para Bolsonaro. O líder da P2 foi Lula em todos os momentos, e `divergencia_p1_p2` nunca ficou verdadeira.
* Com o modelo projetando a 44% das seções, o portal (replay) já indicava `ponto_virada_pct_secoes` ≈ 68%, e a virada real foi a 67,6%.

## 5. Achados sobre o modelo (para o dono de `modelo.py`)

### 5.1 FALHA ESTRUTURAL: viés de ordem dentro do município é sistemático, não ruído de média zero

Evidência (seed 0 = ordem real). Nos municípios **parcialmente** apurados, as seções que faltam são sistematicamente mais pró-Lula que as já apuradas, em todas as regiões e em todos os pontos:

| ponto | erro da P2 (default) vindo de municípios parciais | vindo de municípios não iniciados | logit(restante) − logit(apurado), média ponderada |
|---|---|---|---|
| 20% | −0,36 p.p. | −0,19 p.p. | ≈ 0,00 |
| 50% | −0,49 p.p. | −0,03 p.p. | +0,053 |
| 70% | −0,30 p.p. | −0,01 p.p. | +0,060 |
| 90% | −0,08 p.p. | −0,00 p.p. | +0,057 |

A diferença cresce com a fração apurada q do município. Seed 0, a 50%: q<25% → ≈0; 25 a 50% → +0,14; 50 a 75% → +0,21; ≥75% → +0,23 logit. As seções que chegam por último (rurais e periféricas) são as mais pró-Lula. O padrão se repete nas seeds 1 a 3. Ajustando "restante − apurado ≈ c·q", c fica entre 0,10 e 0,19 em todos os pontos e sementes, sempre positivo.

Hoje o modelo trata isso como variância de média zero e independente por município: `s_ord²·(1−q)` em `var_obs`, e `eps` independente no Monte Carlo, que some na soma nacional. Por isso (a) a P2 herda o viés da parcial (p_rest ≈ p_obs) e (b) o IC não cobre o erro, que é **comum** a todos os municípios. O comparecimento está bem: erro de R < 0,1%.

**Mitigação só com parâmetros (aplicada):** s_ord=1,0 faz o BLUP e o ajuste ignorarem praticamente a parcial de municípios incompletos. A projeção passa a se apoiar em municípios (quase) concluídos e na regressão. Isso explica o ganho de 0,43 para 0,17 p.p.

**Correção estrutural proposta** (protótipo em `backtest/modelo_proposto.py`, diferenças marcadas com `[ORD]`, ~25 linhas):
1. Estimar ao vivo um coeficiente comum c a partir dos **incrementos entre snapshots**: para cada município com snapshot anterior (≈10 min antes), y = logit(share das seções novas) − logit(share anterior), regredido em q por WLS com prior N(c0, sc0²). Requer passar `a_prev`/`b_prev` do snapshot anterior para `projetar`. A série temporal já é guardada.
   No backtest o estimador atrasa no começo (c_inc ≈ 0 a 10%, 0,03 a 0,08 a 20 a 30%) e converge para o valor real a partir de ~40%.
2. Alvo do ajuste = município inteiro: `d = logit(p_obs) − lp0 + c·q(1−q)` nos parciais.
3. Restante: `lp_rest += c·q²` nos parciais.
4. Monte Carlo: choque **comum** `N(0, sd_c²)·q²` nos parciais, com sd_c = max(EP de c, sig_c_min).

Resultado (6 seeds, n_sim=5000, demais params = calibrados):

| config | err_p2 | cobertura nac. | largura | z RMS | cobertura UF | cobertura UF a 90% |
|---|---|---|---|---|---|---|
| modelo atual, default | 0,425 | 98,3% | 2,64 | 1,07 | 83,1% | 59% |
| modelo atual, calibrado | 0,167 | 100% | 2,86 | 0,50 | 94,6% | 79% |
| **proposto + calibrado** (c0=0, sc0=0,05, sig_c_min=0,02, s_inc=0,05) | **0,090** | 100% | 2,86 | 0,29 | **97,9%** | **85%** |
| proposto com s_ord=0,15 (confia na parcial) | 0,252 | 100% | 2,93 | 0,45 | 96,9% | 82% |
| atual com s_ord=0,15 (mesmos demais) | 0,428 | 100% | 2,92 | 0,87 | 91,7% | 72% |

Recomendação: **para hoje, só os parâmetros calibrados** (nenhuma mudança de código). A correção estrutural melhora (erro cai pela metade e a cobertura por UF melhora), mas a busca mostrou sensibilidade a `s_inc` (perda 1,31 → 3,68 entre passadas em configurações vizinhas), e falta teste fora de 2022. Implementar com calma depois da eleição. c0=0 (prior neutro) foi tão bom quanto c0>0, então não é preciso supor a direção do viés.

### 5.2 IC por UF estreito demais no fim da apuração

Com os defaults, a cobertura do IC95 por UF cai para 85% a 50%, 70% a 70% e 59% a 90% (z RMS 3,2 a 90%), mesmo com a nacional ok. É o mesmo viés de ordem, concentrado por UF. Grade de sig_uf_min (config B, seeds 0 a 3):

| sig_uf_min | perda nacional | cobertura UF média | pior ponto | z RMS UF |
|---|---|---|---|---|
| 0,015 | 1,41 | 86,7% | 59% | 1,53 |
| 0,03 | 1,45 | 89,8% | 67% | 1,20 |
| **0,05** | 1,58 | 94,7% | 81% | 0,88 |
| 0,08 | 1,86 | 97,9% | 88% | 0,62 |
| 0,12 | 2,31 | 99,6% | 96% | 0,43 |

Escolhi 0,05. Ainda sub-cobre UFs nos 80 a 90% finais (PI, DF, RR, MS, PA, MA são as piores). Se o portal destacar a projeção por UF no fim da noite, considere 0,08, ao custo de um IC nacional ~0,3 p.p. mais largo. O choque comum de ordem (§5.1) resolve melhor.

### 5.3 Outros
* A P1 (regional) tem viés persistente pela mesma razão. Erro de 0,6 a 0,8 p.p. entre 10% e 60%, pior que a P2 calibrada em todos os pontos.
* `min_mun_cov` é irrelevante na escala nacional (sempre há municípios suficientes).
* A dispersão entre sementes é pequena (mesma verdade), então a cobertura "100%" não significa 6×10 ensaios independentes. O z RMS e o |z| máximo são os indicadores relevantes.
* O backtest sintético (`backtest/sintetico.py`) usa viés de ordem de média zero e independente, e por isso não consegue detectar a falha 5.1. Sugestão: dar ao `revelar` um viés comum positivo, para não superestimar a precisão.

## 6. Ressalvas
* **O motor ao vivo já lê `backtest/params_calibrados.json`** (`apuracao/engine/main.py::carregar_params`, chave `params`, ou o arquivo apontado por `PARAMS_FILE`). Os parâmetros calibrados passam a valer no próximo start/reload do motor. Rodar `b2022 calibrar` reescreve esse arquivo.
* Há uma única eleição real. Parâmetros calibrados em 2022 podem não transferir: candidato b diferente, outra geografia do voto. Por isso não reduzi as escalas da fase inicial (sig_nat0, sig_reg0, kappa).
* A seleção usou as seeds 0 a 3. As seeds 4 e 5 serviram como "holdout": perda 1,75 (default) → 1,40 (B, antes de sig_uf_min).
* O % de seções conta BUs (472.028). O TSE conta 496.238 seções, incluindo agregadas. A diferença é irrelevante para a ordem.

## 7. Arquivos
* `backtest/b2022.py`: download, montagem da base, ordem real, backtest, calibração e tabela (`--md`).
* `backtest/params_calibrados.json`: `params` (para o modelo atual) e `proposto` (só para o protótipo).
  Atenção: `python -m backtest.b2022 calibrar` reescreve esse JSON a partir da perda nacional. Ele perde a seção `proposto` e a escolha manual de `sig_uf_min=0,05`, que foi feita pela cobertura por UF (§5.2).
* `backtest/modelo_proposto.py`: protótipo da correção [ORD] (não usado em produção).
* `backtest/replay2022.py` e `config/eleicao2022.yaml`: Replay em `data/public/replay/2022/` (seed 0 = ordem real, params calibrados, um momento a cada 4 min). `data/public/replay/index.json` é escrito pelo motor (`publicar_replay_index`), que já inclui 2022 quando `replay/2022/index.json` existe.
