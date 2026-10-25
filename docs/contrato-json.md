# Contrato dos JSON publicados (motor → portal)

Every file is served by nginx under `/data/...` (on disk: `data/public/...`). The frontend **only** reads these files and polls every 30 s (`latest/*`, `status.json`).
Candidates are always identified by their ballot number as a string (`"13"`, `"22"`). Display order is always the order of `candidatos` (13 first), **never** by who leads.
Percentages are numbers on a 0 to 100 scale (e.g. `49.87`). Probabilities are on a 0 to 1 scale. Votes are integers. Times are ISO 8601 with offset `-03:00`, except `*_tse`, which is the TSE string (`"25/10/2026 19:20:01"`).
`saldo_esperado` > 0 means a net advantage for the **first** candidate (13) in the votes still to be counted. A negative value means advantage for the second (22).

## /data/latest/br.json
```jsonc
{
  "gerado_em": "2026-10-25T19:20:05-03:00",
  "eleicao": "6258",
  "titulo": "2º turno presidencial 2026",
  "status": "aguardando | ao_vivo | parado | final",   // parado = TSE sem atualização há > 5 min durante a apuração
  "atualizado_tse": "25/10/2026 19:20:01",
  "candidatos": [
    {"n": "13", "nome": "Lula", "partido": "PT", "cor": "#2563eb", "foto": "/data/fotos/13.jpeg"},
    {"n": "22", "nome": "Flávio Bolsonaro", "partido": "PL", "cor": "#d97706", "foto": "/data/fotos/22.jpeg"}
  ],
  "apuracao": {
    "pct_secoes": 71.4, "secoes_tot": 356000, "secoes_total": 499248,
    "eleitorado": 158745502, "eleitorado_apurado": 113000000,
    "comparecimento": 89000000, "abstencao": 24000000, "pct_comparecimento": 78.8, "pct_comparecimento_1t": 78.9,
    "validos": 85000000, "brancos": 1500000, "nulos": 2500000,
    "votos": {"13": 41820000, "22": 43180000},
    "pct": {"13": 49.2, "22": 50.8},
    "pct_1t": {"13": 45.16, "22": 47.03},          // % of valid votes in the 1st round (same scope)
    "dif_votos": -1360000,                        // votos[13] - votos[22]
    "dif_pp": -1.6,
    "lider": "22",                                 // null if tied or nothing counted
    "eleito": null,                                // "13"/"22" ONLY when the TSE flags it in the BR file
    "definido_tse": false
  },
  "projecao": {
    "disponivel": true,
    "motivo": null,                                // text when disponivel=false (e.g. "Menos de 5% das seções apuradas")
    "confianca": "insuficiente | baixa | media | alta",
    "tendencia_consolidada": false,
    "p1": {"pct": {"13": 50.6, "22": 49.4}},
    "p2": {
      "pct": {"13": 50.9, "22": 49.1},
      "ic95": {"13": [50.1, 51.7], "22": [48.3, 49.9]},
      "prob": {"13": 0.97, "22": 0.03},
      "votos": {"13": 60100000, "22": 58000000},
      "validos_total": 118100000
    },
    "validos_restantes": 33100000,
    "eleitores_restantes": 45745502,
    "saldo_esperado": 3460000,
    "vantagem_supera_restantes": false,            // deterministic fact: the lead is larger than all remaining voters
    "virada": {"atras": "13", "pct_necessario": 52.05, "pct_projetado": 55.2},  // share of the remaining votes the trailing candidate needs; null if nothing is left
    "ponto_virada_pct_secoes": 78.5,               // projected % of sections at which the official count flips; null if no flip is expected
    "divergencia_p1_p2": false,
    "modelo": {"n_municipios_ajuste": 3120, "swing_nacional_pp": 2.1, "versao": "p2-ridge-hier-1"}
  },
  "regioes": [ /* RegiaoUF objects, codigo in N, NE, CO, SE, S, EXT */ ],
  "ufs": [ /* RegiaoUF objects, codigo = "sp", ... */ ],
  "ia": { "titulo": "...", "resumo": "...", "destaques": ["..."], "o_que_falta": "...", "confianca": "media",
          "aviso": "Projeção estatística independente. Resultado oficial: TSE.", "momento": "2026-10-25T19:20:00-03:00",
          "origem": "ia | template" },   // may be null
  "eventos_recentes": [ {"momento": "...", "tipo": "virada_oficial", "texto": "...", "abrangencia": "br"} ],
  "aviso": "Projeção estatística independente. Não é resultado oficial. Resultado oficial: TSE."
}
```

### RegiaoUF
```jsonc
{
  "codigo": "NE", "nome": "Nordeste", "regiao": "NE",          // for a UF: codigo "ba", nome "Bahia", regiao "NE"
  "pct_secoes": 58.0, "eleitorado": 43000000, "eleitorado_apurado": 25000000,
  "votos": {"13": 13000000, "22": 6700000}, "pct": {"13": 66.1, "22": 33.9},
  "pct_1t": {"13": 61.0, "22": 31.0},                          // % of valid votes in the 1st round
  "share2_1t": {"13": 66.3, "22": 33.7},                       // 13/(13+22) in the 1st round, used for the swing
  "swing_pp": 1.8,                                             // pct[13] counted - share2_1t[13] in the same municipalities
  "pct_comparecimento": 77.0, "pct_comparecimento_1t": 78.5,
  "validos_restantes": 7900000, "saldo_esperado": 2500000,
  "proj": {"pct": {"13": 65.4, "22": 34.6}, "ic95": {"13": [63.9, 66.8], "22": [33.2, 36.1]}, "prob": {"13": 1.0, "22": 0.0}},
  "proj_p1": {"13": 65.9, "22": 34.1},
  "status": "nao_iniciada | parcial | concluida"
}
```

## /data/latest/uf/{uf}.json
```jsonc
{
  "gerado_em": "...", "uf": "ba", "nome": "Bahia", "regiao": "NE",
  "resumo": { /* RegiaoUF */ },
  "municipios": [ /* Municipio */ ]
}
```
### Municipio
```jsonc
{
  "cd": "38490", "ibge": "2927408", "nome": "SALVADOR", "uf": "ba", "capital": true, "porte": "acima1m",
  "eleitorado": 1980000, "pct_secoes": 64.2,
  "votos": {"13": 500000, "22": 300000}, "pct": {"13": 62.5, "22": 37.5},
  "pct_1t": {"13": 58.0, "22": 33.0}, "share2_1t": {"13": 63.7, "22": 36.3},
  "swing_pp": -1.2, "proj_pct": {"13": 62.9, "22": 37.1}, "validos_restantes": 420000,
  "pct_comparecimento": 75.1, "pct_comparecimento_1t": 76.0,
  "status": "nao_iniciada | parcial | concluida",
  "lider_1t": "13", "lider": "13", "virou_vs_1t": false       // virou_vs_1t: leader of the 2nd round differs from the leader of the 1st round (among 13/22)
}
```
Porte: `ate10k`, `10a50k`, `50a200k`, `200ka1m`, `acima1m`.

## /data/latest/municipios.json (national map, compact)
```jsonc
{
  "gerado_em": "...",
  "campos": ["cd","ibge","uf","nome","capital","porte","eleitorado","pct_secoes","pct_a","share2_1t_a","swing_pp","proj_a","validos_restantes","pct_comp","pct_comp_1t","status"],
  "dados": [["38490","2927408","ba","SALVADOR",true,"acima1m",1980000,64.2,62.5,63.7,-1.2,62.9,420000,75.1,76.0,"parcial"], ...]
}
```
`pct_a` = % of the first candidate (13) among valid votes counted (null if nothing counted). `proj_a` = projected % of 13.

## /data/timeline/br.json, /data/timeline/uf/{uf}.json, /data/timeline/regiao/{R}.json
```jsonc
{ "pontos": [ {"momento": "2026-10-25T17:31:00-03:00", "pct_secoes": 12.3,
               "pct": {"13": 44.0, "22": 56.0}, "p1": {"13": 49.8}, "p2": {"13": 50.4},
               "ic95": {"13": [48.0, 52.9]}, "prob": {"13": 0.62}, "confianca": "baixa"} ] }
```
(p1/p2/ic95/prob are null while the projection is "insuficiente".)

## /data/ia/historico.json
`{ "analises": [ { ...the same object as br.json.ia } ] }`, newest first.

## /data/eventos.json
`{ "eventos": [ {"momento": "...", "tipo": "...", "texto": "...", "abrangencia": "br|NE|sp|38490"} ] }`, newest first.
Types: `virada_oficial`, `virada_projetada`, `mudanca_probabilidade`, `uf_fora_padrao`, `municipio_fora_padrao`, `comparecimento_atipico`, `fonte_parada`, `marco_apuracao`, `confianca_alta`, `definido_tse`.

## /data/status.json
```jsonc
{ "gerado_em": "...", "status": "ao_vivo", "atualizado_tse": "...", "segundos_desde_tse": 42,
  "coletor": {"ultimo_ciclo": "...", "requisicoes": 1234, "erros": 0, "urls_bloqueadas": 0, "ultimo_idg": "3943321"},
  "motor": {"ultimo_calculo": "...", "duracao_s": 3.2}, "alertas": [] }
```

## /data/replay/index.json and /data/replay/{eleicao}/...
- `/data/replay/index.json`: `{ "eleicoes": [ {"id": "6258", "titulo": "2º turno 2026 (ao vivo)"}, {"id": "2022", "titulo": "2º turno 2022 (simulação)"} ] }`
- `/data/replay/{eleicao}/index.json`: `{ "eleicao": "6258", "titulo": "...", "momentos": [ {"id": "20261025T173100", "momento": "...", "pct_secoes": 3.1} ] }`
- `/data/replay/{eleicao}/{id}.json`: `{ "br": <same as latest/br.json>, "municipios": <same as latest/municipios.json> }`

## /data/geo/*
- `/data/geo/br-uf.json`: TopoJSON of the UFs (object `uf`, property `sigla` lowercase, `codarea`).
- `/data/geo/mun/{uf}.json`: TopoJSON of the UF's municipalities (object `mun`, property `codarea` = 7-digit IBGE code, matching the `ibge` field).
- `/data/geo/br-mun.json`: all of Brazil's municipalities, simplified (< 3 MB).
