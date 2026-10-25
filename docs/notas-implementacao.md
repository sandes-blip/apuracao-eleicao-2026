# Notas de implementação (diferenças em relação ao briefing v1.1)

1. **Campos do TSE**: ver `docs/tse-campos.md` (`e.est`, `v.tvn`, sem `md`, candidatos aninhados).
2. **P2 virou regressão hierárquica** (ridge com efeitos de região/UF encolhidos), com covariáveis do 1º turno:
   votos de Cury (70), Renan Santos (14), Caiado (55) e demais, brancos/nulos, comparecimento, porte, capital.
   A transferência dos eliminados não é uniforme no país; o swing uniforme do briefing é o caso particular sem covariáveis
   (usado automaticamente enquanto há menos de 200 municípios com dados).
3. **Peso municipal por variância** em vez de `pct_secoes >= 50%` + `TAU`: cada município entra com peso
   `1/(s_mun² + ruído amostral + s_ord²·(1 - completude))`; o resíduo próprio do município entra no que falta dele
   pelo BLUP (confiabilidade), o que trata o viés de ordem dentro de cidades grandes.
4. **Monte Carlo correlacionado**: incerteza dos coeficientes (amostrados da posterior), choque nacional e regional com
   caudas pesadas (t de Student), piso por UF, desvio municipal condicional e erro de comparecimento nacional + UF.
5. **Confiança mais rígida**: além de 5% das seções e 15 UFs, exige municípios com mais da metade apurada em 3 regiões;
   se P1 e P2 apontarem líderes diferentes, a confiança não passa de Baixa.
6. **Fato determinístico**: "a vantagem supera o total de eleitores das seções não apuradas" (`|dif| > te - est`).
7. **IA**: desde 21/10/2026 a API da Anthropic não aceita mais `temperature`; usamos `effort: low` + saída em JSON
   estruturado (schema) com o modelo `claude-sonnet-5-5`. Validação de números, termos proibidos, travessão e "eleito".
8. **Armazenamento**: todo arquivo do TSE vai primeiro para disco (`data/raw/{eleicao}/hist/{arquivo}/{idg}.json.gz`
   + `index.jsonl`), depois para o PostgreSQL em fila assíncrona. Se o banco cair, a coleta continua.
9. **Replay**: o motor publica um retrato completo a cada ciclo com mudança (`/data/replay/6258/`); o replay de 2022 é
   gerado pelo backtest.
10. Ambiente simulado do TSE (`resultados-sim`) não respondia em 25/10; testes usaram os arquivos reais do 1º turno.
