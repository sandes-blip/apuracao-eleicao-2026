from apuracao.engine import ia


def entrada(disponivel=True):
    e = {
        "momento": "2026-10-25T19:20:00-03:00", "candidatos": ["Lula", "Flávio Bolsonaro"],
        "apuracao": {"pct_secoes": 71.4, "pct_Lula": 49.2, "pct_Flávio Bolsonaro": 50.8, "votos_Lula": 41820000,
                     "votos_Flávio Bolsonaro": 43180000, "diferenca_votos": 1360000, "lider_placar": "Flávio Bolsonaro",
                     "diferenca_pp": 1.6, "eleito_tse": None},
        "projecao": {"disponivel": disponivel, "motivo": None, "confianca": "media", "tendencia_consolidada": False},
        "regioes": [{"regiao": "Nordeste", "pct_secoes": 58.0, "validos_restantes": 7900000,
                     "saldo_esperado_votos": 2500000, "saldo_esperado_favorece": "Lula"}],
        "ufs_com_mais_votos_restantes": [], "eventos_desde_ultima_analise": [], "analise_anterior_resumo": None,
        "comparacao_1turno": {"pct_Lula_1turno": 45.2, "pct_Flávio Bolsonaro_1turno": 47.0},
    }
    if disponivel:
        e["projecao"].update({"p2_principal": {"pct_Lula": 50.9, "pct_Flávio Bolsonaro": 49.1, "ic95_Lula": [50.1, 51.7],
                                               "ic95_Flávio Bolsonaro": [48.3, 49.9], "probabilidade_Lula_pct": 97.0, "probabilidade_Flávio Bolsonaro_pct": 3.0}, "validos_restantes": 33100000})
    return e


def saida(resumo):
    return {"titulo": "Projeção indica Lula com 50,9%", "resumo": resumo, "destaques": ["Nordeste com 58,0% apurado"],
            "o_que_falta": "Faltam cerca de 7,9 milhões de votos válidos no Nordeste.", "confianca": "media", "aviso": "x"}


def test_texto_valido_passa():
    assert ia.validar(saida("Com 71,4% das seções apuradas, Flávio Bolsonaro tem 50,8%. A projeção indica Lula com 50,9% "
                            "(faixa de 50,1% a 51,7%). A diferença no placar é de 1,36 milhão de votos."), entrada()) == []


def test_numero_inventado_reprovado():
    erros = ia.validar(saida("Lula deve terminar com 53,4% dos votos."), entrada())
    assert any("53.4" in e for e in erros)


def test_termos_proibidos_e_travessao():
    erros = ia.validar(saida("Vitória garantida para Lula — já ganhou."), entrada())
    assert any("vitória garantida" in e for e in erros) and any("—" in e for e in erros)


def test_eleito_sem_tse_reprovado_mas_eleitorado_ok():
    assert ia.validar(saida("O eleitorado do Nordeste ainda tem votos a apurar."), entrada()) == []
    assert any("eleito" in e for e in ia.validar(saida("Lula foi eleito."), entrada()))


def test_template_sem_ia_passa_na_validacao():
    for disp in (True, False):
        e = entrada(disp)
        t = ia.template(e)
        assert ia.validar(dict(t), e) == [], t
