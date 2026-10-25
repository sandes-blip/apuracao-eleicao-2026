"""Camada de IA (briefing seção 8): o algoritmo calcula, a IA explica.
Claude recebe só números prontos e devolve JSON; a saída passa por validação de números e termos antes de publicar.
Sem chave, com erro ou reprovação dupla: texto de template preenchido pelo sistema."""
from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime

from apuracao.config import settings

log = logging.getLogger("ia")

AVISO_IA = "Projeção estatística independente. Resultado oficial: TSE."

SCHEMA = {
    "type": "object",
    "properties": {
        "titulo": {"type": "string"},
        "resumo": {"type": "string"},
        "destaques": {"type": "array", "items": {"type": "string"}},
        "o_que_falta": {"type": "string"},
        "confianca": {"type": "string", "enum": ["baixa", "media", "alta", "insuficiente"]},
        "aviso": {"type": "string"},
    },
    "required": ["titulo", "resumo", "destaques", "o_que_falta", "confianca", "aviso"],
    "additionalProperties": False,
}

SYSTEM = """Você redige, em português do Brasil, a análise curta de um portal independente que acompanha a apuração do 2º turno da eleição presidencial de 2026 e exibe uma projeção estatística.

Você recebe um JSON com números já calculados por um motor estatístico auditável. Seu papel é explicar, não calcular.

Regras obrigatórias:
1. Use somente números que aparecem no JSON recebido, com no máximo uma casa decimal e vírgula decimal (ex.: 49,2%). Não faça contas novas, não some, não subtraia, não estime e não cite dados externos (pesquisas, eleições anteriores que não estejam no JSON, notícias). Se precisar de um número que não está no JSON, escreva sem o número.
2. Tom jornalístico, sóbrio e neutro. Dê o mesmo tratamento e use os mesmos verbos para os dois candidatos. Cite os candidatos sempre pelo nome que aparece no JSON.
3. Proibido: adjetivos sobre candidatos, opinião, especular sobre o comportamento futuro do eleitor, e expressões como "vitória garantida", "já ganhou", "derrota certa", "eleito" (exceto se o JSON indicar eleito_tse), "massacre", "virada histórica".
4. Projeção não é resultado. Use formulações como "a projeção estatística indica" ou "tende a terminar com". Só use "tendência consolidada" se o campo tendencia_consolidada for true.
5. Sempre que a projeção diferir do placar oficial, explique por quê: a ordem de chegada dos votos por região (onde ainda há votos a apurar e como essas regiões votaram).
6. Se projecao.disponivel for false, não cite números de projeção; explique que ainda não há dados suficientes e descreva apenas o placar oficial.
7. Nunca use travessão (o caractere — ou –). Use vírgula, ponto ou dois-pontos.
8. Escreva para o leitor comum: nunca mencione nomes de campos, chaves, "JSON", "campo" ou "verdadeiro/falso". Números grandes de votos sempre arredondados com uma casa decimal em milhões ou mil (ex.: "17,1 milhões", "850 mil"), nunca com todos os dígitos.
9. Formato: titulo com até 90 caracteres; resumo com 3 a 5 frases; destaques com até 4 itens curtos; o_que_falta com 1 a 2 frases sobre os votos restantes e onde estão; confianca igual ao campo projecao.confianca recebido; aviso exatamente "Projeção estatística independente. Resultado oficial: TSE."."""

PROIBIDOS = [
    "vitória garantida", "já ganhou", "ja ganhou", "derrota certa", "massacre", "virada histórica", "esmagador",
    "humilhante", "lavada", "vitória certa", "garantid", "imbatível", "favoritíssimo", "pesquisa", "datafolha",
    "quaest", "ipec", "atlas", "acredito", "na minha opinião", "infelizmente", "felizmente", "—", "–",
]


# ---------------- entrada ----------------
def montar_entrada(calc: dict, eventos: list[dict], anterior: dict | None) -> dict:
    s = settings()
    A, B = s.cand_a, s.cand_b
    nomes = {c["n"]: c["nome"] for c in s.candidatos}
    ap, pj = calc["apuracao"], calc["projecao"]

    def r(x, nd=1):
        return None if x is None else round(float(x), nd)

    regioes = []
    for g in calc["regioes"]:
        item = {"regiao": g["nome"], "pct_secoes": r(g["pct_secoes"]),
                f"pct_{nomes[A]}": r(g["pct"][A]), f"pct_{nomes[B]}": r(g["pct"][B]),
                "validos_restantes": g["validos_restantes"], "saldo_esperado_votos": g["saldo_esperado"],
                "saldo_esperado_favorece": nomes[A] if g["saldo_esperado"] > 0 else (nomes[B] if g["saldo_esperado"] < 0 else None),
                "swing_vs_1turno_pp": r(g["swing_pp"])}
        regioes.append(item)
    ufs = sorted(calc["ufs"], key=lambda u: -u["validos_restantes"])[:6]
    ufs_d = [{"uf": u["nome"], "pct_secoes": r(u["pct_secoes"]), f"pct_{nomes[A]}": r(u["pct"][A]),
              f"pct_{nomes[B]}": r(u["pct"][B]), "validos_restantes": u["validos_restantes"],
              "saldo_esperado_votos": u["saldo_esperado"]} for u in ufs]
    dif = ap["dif_votos"]
    entrada = {
        "momento": calc["gerado_em"],
        "candidatos": [nomes[A], nomes[B]],
        "apuracao": {"pct_secoes": r(ap["pct_secoes"]), f"pct_{nomes[A]}": r(ap["pct"][A]), f"pct_{nomes[B]}": r(ap["pct"][B]),
                     f"votos_{nomes[A]}": ap["votos"][A], f"votos_{nomes[B]}": ap["votos"][B],
                     "diferenca_votos": abs(dif), "lider_placar": nomes.get(ap["lider"]) if ap["lider"] else None,
                     "diferenca_pp": r(abs(ap["dif_pp"])) if ap["dif_pp"] is not None else None,
                     "eleito_tse": nomes.get(ap["eleito"]) if ap["eleito"] else None},
        "projecao": {"disponivel": pj["disponivel"], "motivo": pj["motivo"], "confianca": pj["confianca"],
                     "tendencia_consolidada": pj["tendencia_consolidada"]},
        "regioes": regioes,
        "ufs_com_mais_votos_restantes": ufs_d,
        "eventos_desde_ultima_analise": [e["texto"] for e in eventos][-8:],
        "analise_anterior_resumo": (anterior or {}).get("resumo"),
        "comparacao_1turno": {f"pct_{nomes[A]}_1turno": r(ap["pct_1t"][A]), f"pct_{nomes[B]}_1turno": r(ap["pct_1t"][B])},
    }
    if pj["disponivel"]:
        entrada["projecao"].update({
            "p1_regional": {f"pct_{nomes[A]}": r(pj["p1"]["pct"][A]), f"pct_{nomes[B]}": r(pj["p1"]["pct"][B])},
            "p2_principal": {f"pct_{nomes[A]}": r(pj["p2"]["pct"][A]), f"pct_{nomes[B]}": r(pj["p2"]["pct"][B]),
                             f"ic95_{nomes[A]}": [r(x) for x in pj["p2"]["ic95"][A]],
                             f"ic95_{nomes[B]}": [r(x) for x in pj["p2"]["ic95"][B]],
                             f"probabilidade_{nomes[A]}_pct": r(100 * pj["p2"]["prob"][A]),
                             f"probabilidade_{nomes[B]}_pct": r(100 * pj["p2"]["prob"][B])},
            "validos_restantes": pj["validos_restantes"], "saldo_esperado_votos": abs(pj["saldo_esperado"]),
            "saldo_esperado_favorece": nomes[A] if pj["saldo_esperado"] > 0 else nomes[B],
            "vantagem_supera_eleitores_restantes": pj["vantagem_supera_restantes"],
            "ponto_virada_pct_secoes": pj["ponto_virada_pct_secoes"],
        })
    return entrada


# ---------------- validação ----------------
_NUM = re.compile(r"(?<![\w])(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?(\s*(?:milhões|milhão|milhoes|milhao|bilhões|bilhão|mil)\b)?", re.I)


def _numeros_texto(txt: str) -> list[float]:
    out = []
    for m in _NUM.finditer(txt):
        inteiro = m.group(1).replace(".", "")
        val = float(f"{inteiro}.{m.group(2)}") if m.group(2) else float(inteiro)
        mult = (m.group(3) or "").strip().lower()
        if mult.startswith("mil") and not mult.startswith("milh"):
            val *= 1e3
        elif mult.startswith("milh"):
            val *= 1e6
        elif mult.startswith("bilh"):
            val *= 1e9
        out.append(val)
    return out


def _numeros_entrada(obj) -> list[float]:
    out: list[float] = []
    if isinstance(obj, bool) or obj is None:
        return out
    if isinstance(obj, (int, float)):
        return [float(obj)]
    if isinstance(obj, str):
        return [float(x.replace(",", ".")) for x in re.findall(r"\d+(?:[.,]\d+)?", obj)]
    if isinstance(obj, dict):
        for v in obj.values():
            out += _numeros_entrada(v)
    if isinstance(obj, list):
        for v in obj:
            out += _numeros_entrada(v)
    return out


BENIGNOS = {1.0, 2.0, 95.0, 100.0, 13.0, 22.0, 2026.0, 10.0}


def numero_ok(x: float, permitidos: list[float]) -> bool:
    if x in BENIGNOS:
        return True
    for p in permitidos:
        ap = abs(p)
        if abs(x - ap) <= 0.1 + 1e-9:
            return True
        # valores grandes citados de forma arredondada (ex.: 1,2 milhão para 1.180.000)
        if ap >= 1000 and abs(x - ap) <= max(0.05 * ap, 0.1):
            return True
    return False


def validar(saida: dict, entrada: dict) -> list[str]:
    erros = []
    for k in SCHEMA["required"]:
        if k not in saida:
            erros.append(f"campo ausente: {k}")
    if erros:
        return erros
    if len(saida["titulo"]) > 90:
        erros.append("título com mais de 90 caracteres")
    if not isinstance(saida["destaques"], list) or len(saida["destaques"]) > 4:
        erros.append("destaques: no máximo 4")
    texto = " ".join([saida["titulo"], saida["resumo"], " ".join(saida["destaques"]), saida["o_que_falta"]])
    baixo = texto.lower()
    for t in PROIBIDOS:
        if t in baixo:
            erros.append(f"termo proibido: {t!r}")
    if re.search(r"\beleit[oa]s?\b", baixo) and not entrada["apuracao"].get("eleito_tse"):
        erros.append("uso de 'eleito' sem indicação do TSE")
    if "tendência consolidada" in baixo and not entrada["projecao"].get("tendencia_consolidada"):
        erros.append("'tendência consolidada' sem critério")
    permitidos = _numeros_entrada(entrada)
    for x in _numeros_texto(texto):
        if not numero_ok(x, permitidos):
            erros.append(f"número sem origem na entrada: {x:g}")
    saida["aviso"] = AVISO_IA
    saida["confianca"] = entrada["projecao"]["confianca"]
    return erros


# ---------------- template (sem IA) ----------------
def _f(x, nd=1):
    return f"{x:.{nd}f}".replace(".", ",") if x is not None else "-"


def _mi(v):
    v = abs(v)
    return f"{_f(v / 1e6)} milhões" if v >= 1e6 else f"{_f(v / 1e3, 0)} mil"


def template(entrada: dict) -> dict:
    s = settings()
    na, nb = entrada["candidatos"]
    ap, pj = entrada["apuracao"], entrada["projecao"]
    lider = ap.get("lider_placar")
    frases = [f"Com {_f(ap['pct_secoes'])}% das seções apuradas, {na} tem {_f(ap[f'pct_{na}'])}% dos votos válidos "
              f"e {nb} tem {_f(ap[f'pct_{nb}'])}%."]
    if lider:
        frases.append(f"A diferença no placar oficial é de {_mi(ap['diferenca_votos'])} de votos a favor de {lider}.")
    destaques = []
    if pj["disponivel"]:
        p2 = pj["p2_principal"]
        frases.append(f"A projeção estatística indica {na} com {_f(p2[f'pct_{na}'])}% (faixa de {_f(p2[f'ic95_{na}'][0])}% "
                      f"a {_f(p2[f'ic95_{na}'][1])}%) e {nb} com {_f(p2[f'pct_{nb}'])}%.")
        if pj.get("validos_restantes", 0) > 0 and abs(p2[f"pct_{na}"] - (ap.get(f"pct_{na}") or 0)) >= 0.3:
            frases.append("A diferença entre placar e projeção vem da ordem de chegada dos votos: regiões que ainda têm "
                          "muitos votos a apurar votam de forma diferente das já apuradas.")
        destaques.append(f"Probabilidade estimada: {na} {_f(p2[f'probabilidade_{na}_pct'])}%, {nb} {_f(p2[f'probabilidade_{nb}_pct'])}%")
        destaques.append(f"Confiança da projeção: {pj['confianca']}")
        titulo = f"Projeção indica {na} {_f(p2[f'pct_{na}'])}% e {nb} {_f(p2[f'pct_{nb}'])}%"
    else:
        frases.append(f"A projeção ainda não é exibida: {(pj.get('motivo') or 'dados insuficientes').lower()}.")
        titulo = f"Apuração em {_f(ap['pct_secoes'])}% das seções"
    regs = sorted(entrada["regioes"], key=lambda r: -r["validos_restantes"])
    falta = ""
    if regs and regs[0]["validos_restantes"] > 0:
        top = regs[0]
        falta = f"A maior parte dos votos que faltam está na região {top['regiao']}, com cerca de {_mi(top['validos_restantes'])} de votos válidos restantes."
        if top.get("saldo_esperado_favorece"):
            destaques.append(f"{top['regiao']}: saldo esperado favorece {top['saldo_esperado_favorece']}")
    else:
        falta = "Não há votos relevantes a apurar."
    return {"titulo": titulo[:90], "resumo": " ".join(frases[:5]), "destaques": destaques[:4],
            "o_que_falta": falta, "confianca": pj["confianca"], "aviso": AVISO_IA}


# ---------------- chamada ----------------
def chamar_claude(entrada: dict, feedback: str | None = None) -> dict:
    import anthropic
    s = settings()
    client = anthropic.Anthropic(timeout=60, max_retries=2)
    content = "Dados da apuração (JSON):\n" + json.dumps(entrada, ensure_ascii=False)
    if feedback:
        content += f"\n\nSua resposta anterior foi reprovada pela validação automática pelos motivos: {feedback}. Corrija."
    kwargs = dict(model=s.anthropic_model, max_tokens=4000, system=SYSTEM,
                  messages=[{"role": "user", "content": content}],
                  output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}})
    try:
        resp = client.beta.messages.create(betas=["server-side-fallback-2026-07-01"], fallbacks="default", **kwargs)
    except anthropic.BadRequestError:
        resp = client.messages.create(**kwargs)
    if resp.stop_reason == "refusal":
        raise RuntimeError("modelo recusou")
    txt = next((b.text for b in resp.content if getattr(b, "type", "") == "text"), "")
    return json.loads(txt)


def gerar_analise(calc: dict, eventos: list[dict], anterior: dict | None) -> tuple[dict, dict]:
    """Retorna (analise_publicavel, registro_para_auditoria)."""
    from apuracao.store import db
    s = settings()
    entrada = montar_entrada(calc, eventos, anterior)
    reg = {"entrada": entrada, "tentativas": []}
    if os.getenv("ANTHROPIC_API_KEY"):
        feedback = None
        for tent in range(2):
            try:
                saida = chamar_claude(entrada, feedback)
                erros = validar(saida, entrada)
                reg["tentativas"].append({"saida": saida, "erros": erros})
                db.salvar_analise(calc["gerado_em"], entrada, saida, s.anthropic_model, not erros, not erros,
                                  "; ".join(erros) or None)
                if not erros:
                    saida.update({"momento": calc["gerado_em"], "origem": "ia"})
                    return saida, reg
                feedback = "; ".join(erros)
                log.warning("IA reprovada (%d): %s", tent + 1, feedback)
            except Exception as e:
                log.warning("falha na chamada da IA: %s", e)
                reg["tentativas"].append({"erro": str(e)})
                db.salvar_analise(calc["gerado_em"], entrada, None, s.anthropic_model, False, False, str(e))
        from apuracao import alertas
        alertas.alertar("Análise da IA reprovada duas vezes; publicado texto de template.", chave="ia-reprovada")
    t = template(entrada)
    t.update({"momento": calc["gerado_em"], "origem": "template"})
    return t, reg
