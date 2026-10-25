# Campos reais dos arquivos do TSE (2026)

Conferidos em 25/10/2026 nos arquivos oficiais de `https://resultados.tse.jus.br/oficial/ele2026/` (6257 final e 6258 zerado).
Divergências em relação à seção 16 do briefing aparecem em **negrito**.

## EA11 `comum/config/ele-c.json`
`pl[].e[]`: `cd` (6257), **`cdt2`** (código do 2º turno = 6258), `nm`, `t` (turno). `arq[]` traz os padrões de diretório
(`<base>/<ambiente>/<ciclo>/<cd_eleicao>/dados/<uf>`, fotos em `.../fotos/<uf>`).

## EA12 `config/mun-e006258-cm.json`
`abr[]`: `cd` (UF, minúscula ou `zz`), `ds`, `mu[]`: `cd` (TSE, 5 dígitos), **`cdi`** (IBGE 7 dígitos), `nm`, **`c`** (capital `s`/`n`), **`z`** (zonas).
5.757 municípios (inclui cidades do exterior em `zz`).

## EA14 `dados/br/br-e006258-ab.json` e EA15 `dados/{uf}/{uf}-e006258-ab.json`
`abr[]`: `tpabr` (`uf` no EA14, `mun` no EA15), `cdabr`, `dt`, `ht`, `and`, `s{}`, `e{}`.
No EA14: **`munnr` / `munpt` / `munf`** (municípios não recebidos / parciais / finais).
Mudança detectada por `dt + ht + s.st + and`.

## EA20 `dados/{uf}/{uf}{cdmun5}-c0001-e006258-u.json` (também `br` e `{uf}`)
| Campo | Significado |
|---|---|
| `ele`, `t`, `tpabr`, `cdabr` | eleição, turno, tipo e código da abrangência |
| `dg`, `hg` / `dt`, `ht` | geração do arquivo / totalização |
| `idg` | id da geração |
| `and` | andamento (`n` não iniciado, `p` parcial, `f` final) |
| **`tf`** | totalização final (`s`/`n`) |
| `s.ts`, `s.st`, `s.pstn` | seções totais, totalizadas, % (numérico) |
| `e.te`, **`e.est`** | eleitorado total, **eleitorado das seções totalizadas** (no briefing: `e.ea`, que não existe) |
| `e.c`, `e.a` | comparecimento, abstenção |
| `v.vv`, `v.vb`, **`v.tvn`** | válidos, brancos, **nulos totais** (`v.vn` é só nulo puro) |
| `carg[].agr[].par[].cand[]` | **candidatos aninhados** em agremiação/partido |
| `cand.n`, `nmu`, `sqcand`, `vap`, `pvapn`, `e`, `st` | número, nome de urna, sequencial, votos, % numérico, eleito (`s`/`n`), situação |

- **Não existe `md`** (matematicamente definido). "Eleito" só quando o arquivo Brasil traz `cand.e = "s"` e `st` começando com "Eleito".
  No 1º turno, `e = "s"` com `st = "2º turno"` significa "foi para o 2º turno", não eleito.
- Sempre usar os campos numéricos `*n` (ponto decimal); os campos sem `n` vêm como texto com vírgula.
- Eleitorado restante exato: `e.te - e.est` (dispensa a aproximação `aptos × (1 - pct_secoes)` do briefing).
