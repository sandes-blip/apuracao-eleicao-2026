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
| Lula passa à frente no placar oficial (P0) | **67,62% das seções, 18h43** | 67,76%, 18h44 (50,01 × 49,99) |
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

## 4. Resultados

(preenchido abaixo)
