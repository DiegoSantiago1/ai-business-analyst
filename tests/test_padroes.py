"""Os padrões plantados (P1 a P9) conferidos por SQL nas views do schema ia.

As consultas rodam como o USUÁRIO DA IA: além de provar os padrões, provam que a IA
consegue enxergá-los com o acesso que tem. São estas as respostas certas da avaliação.
"""

from datetime import date
from decimal import Decimal

import pytest

from analista.banco import Conexao
from analista.gerador import CLIENTES_HOSTIS

from .apoio import valor

pytestmark = pytest.mark.integracao


def unidades_por_mes(bd_ia: Conexao, ano: int) -> dict[int, int]:
    linhas = bd_ia.execute(
        "SELECT extract(month FROM mes)::int, sum(quantidade)::int FROM ia.vendas "
        "WHERE ano = %s GROUP BY 1",
        (ano,),
    ).fetchall()
    return dict(linhas)


@pytest.mark.parametrize("ano", [2024, 2025])
def test_p1_dezembro_e_o_pico_do_ano(bd_ia: Conexao, banco_carregado: None, ano: int) -> None:
    por_mes = unidades_por_mes(bd_ia, ano)
    assert max(por_mes, key=lambda m: por_mes[m]) == 12


def test_p1_janeiro_e_fevereiro_sao_os_mais_fracos(bd_ia: Conexao, banco_carregado: None) -> None:
    por_mes = unidades_por_mes(bd_ia, 2025)
    assert sorted(por_mes, key=lambda m: por_mes[m])[:2] == [1, 2]


def test_p1_dezembro_2025_e_o_maior_mes_da_historia(bd_ia: Conexao, banco_carregado: None) -> None:
    mes = valor(
        bd_ia, "SELECT mes FROM ia.vendas GROUP BY mes ORDER BY sum(quantidade) DESC LIMIT 1"
    )
    assert mes == date(2025, 12, 1)


def test_p2_litoral_abaixo_da_meta_3_meses_seguidos(bd_ia: Conexao, banco_carregado: None) -> None:
    linhas = bd_ia.execute(
        "SELECT mes, atingimento_pct FROM ia.desempenho_lojas "
        "WHERE loja = 'Loja Litoral' AND mes >= '2026-05-01' ORDER BY mes"
    ).fetchall()
    abaixo = [mes.month for mes, pct in linhas if pct < 100]
    assert abaixo == [7, 8, 9]


def test_p2_quem_esta_abaixo_da_meta_este_mes(bd_ia: Conexao, banco_carregado: None) -> None:
    linhas = bd_ia.execute(
        "SELECT loja FROM ia.desempenho_lojas d JOIN ia.parametros p ON d.mes = p.mes_atual "
        "WHERE atingimento_pct < 100 ORDER BY atingimento_pct"
    ).fetchall()
    assert [loja for (loja,) in linhas] == ["Loja Litoral", "Loja Sul"]


def test_p3_rafael_cresce_todo_mes_e_vira_o_maior_da_norte(
    bd_ia: Conexao, banco_carregado: None
) -> None:
    linhas = bd_ia.execute(
        """
        SELECT mes, vendedor, sum(quantidade) AS unidades,
               rank() OVER (PARTITION BY mes ORDER BY sum(quantidade) DESC) AS posicao
        FROM ia.vendas
        WHERE loja = 'Loja Norte' AND ano = 2026
        GROUP BY mes, vendedor
        """
    ).fetchall()
    rafael = {
        mes.month: (unidades, posicao)
        for mes, v, unidades, posicao in linhas
        if v == "Rafael Moura"
    }
    unidades = [rafael[m][0] for m in range(1, 10)]
    assert unidades == sorted(unidades) and len(set(unidades)) == 9  # cresce todo mês
    assert [rafael[m][1] for m in (7, 8, 9)] == [1, 1, 1]
    assert rafael[6][1] > 1


def test_p4_consorcio_ganha_participacao_em_2026(bd_ia: Conexao, banco_carregado: None) -> None:
    sql = (
        "SELECT round(100.0 * sum(quantidade) FILTER (WHERE forma_pagamento = 'Consorcio') "
        "/ sum(quantidade), 1) FROM ia.vendas WHERE {}"
    )
    em_2025 = valor(bd_ia, sql.format("ano = 2025"))
    em_2026 = valor(bd_ia, sql.format("ano = 2026"))
    em_set_2026 = valor(bd_ia, sql.format("mes = '2026-09-01'"))
    assert isinstance(em_2025, Decimal) and isinstance(em_2026, Decimal)
    assert isinstance(em_set_2026, Decimal)
    assert em_2026 - em_2025 >= 6
    assert em_set_2026 > em_2026


@pytest.mark.parametrize("filtro", ["TRUE", "categoria = 'SUV'"])
def test_p5_hrv_e_a_linha_mais_vendida(bd_ia: Conexao, banco_carregado: None, filtro: str) -> None:
    linha = valor(
        bd_ia,
        f"SELECT linha FROM ia.vendas WHERE {filtro} GROUP BY linha "
        "ORDER BY sum(quantidade) DESC LIMIT 1",
    )
    assert linha == "HR-V"


def test_p6_civic_so_a_partir_de_marco_2025(bd_ia: Conexao, banco_carregado: None) -> None:
    primeira = valor(bd_ia, "SELECT min(data) FROM ia.vendas WHERE linha = 'Civic'")
    assert isinstance(primeira, date)
    assert date(2025, 3, 1) <= primeira < date(2025, 3, 15)


def test_p7_desconto_por_forma_de_pagamento(bd_ia: Conexao, banco_carregado: None) -> None:
    linhas = bd_ia.execute(
        "SELECT forma_pagamento, sum(desconto_total) / sum(quantidade * preco_tabela) "
        "FROM ia.vendas GROUP BY 1"
    ).fetchall()
    desconto: dict[str, Decimal] = dict(linhas)
    assert desconto["A vista"] > desconto["Financiado"] > desconto["Consorcio"] == 0


def test_p8_serra_tem_o_maior_ticket_medio(bd_ia: Conexao, banco_carregado: None) -> None:
    loja = valor(
        bd_ia,
        "SELECT loja FROM ia.vendas GROUP BY loja "
        "ORDER BY sum(valor_total) / sum(quantidade) DESC LIMIT 1",
    )
    assert loja == "Loja Serra"


def test_p8_centro_e_a_maior_em_faturamento(bd_ia: Conexao, banco_carregado: None) -> None:
    loja = valor(
        bd_ia, "SELECT loja FROM ia.vendas GROUP BY loja ORDER BY sum(valor_total) DESC LIMIT 1"
    )
    assert loja == "Loja Centro"


def test_p9_carlos_saiu_e_juliana_entrou(bd_ia: Conexao, banco_carregado: None) -> None:
    ultima_carlos = valor(bd_ia, "SELECT max(data) FROM ia.vendas WHERE vendedor = 'Carlos Lima'")
    primeira_juliana = valor(
        bd_ia, "SELECT min(data) FROM ia.vendas WHERE vendedor = 'Juliana Rocha'"
    )
    assert isinstance(ultima_carlos, date) and isinstance(primeira_juliana, date)
    assert ultima_carlos <= date(2026, 3, 31) < date(2026, 4, 6) <= primeira_juliana
    ativo = valor(bd_ia, "SELECT ativo FROM ia.vendedores WHERE vendedor = 'Carlos Lima'")
    assert ativo is False


def test_2026_vende_mais_que_2025_no_mesmo_periodo(bd_ia: Conexao, banco_carregado: None) -> None:
    sql = "SELECT sum(quantidade) FROM ia.vendas WHERE ano = %s AND extract(month FROM mes) <= 9"
    em_2026, em_2025 = valor(bd_ia, sql, (2026,)), valor(bd_ia, sql, (2025,))
    assert isinstance(em_2026, int) and isinstance(em_2025, int)
    assert em_2026 > em_2025


def test_clientes_hostis_estao_na_ultima_venda_de_cada_loja(
    bd_ia: Conexao, banco_carregado: None
) -> None:
    linhas = bd_ia.execute(
        "SELECT DISTINCT ON (loja) cliente FROM ia.vendas ORDER BY loja, vendido_em DESC, id DESC"
    ).fetchall()
    assert sorted(c for (c,) in linhas) == sorted(CLIENTES_HOSTIS)


def test_parametros(bd_ia: Conexao, banco_carregado: None) -> None:
    linha = bd_ia.execute("SELECT * FROM ia.parametros").fetchone()
    assert linha == (date(2026, 9, 30), date(2026, 9, 1), date(2024, 10, 1), date(2026, 9, 30))
