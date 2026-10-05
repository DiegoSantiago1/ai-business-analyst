"""Testes unitários do gerador (sem banco): determinismo e coerência dos dados."""

from collections import Counter
from datetime import date
from decimal import Decimal

import pytest

from analista.gerador import (
    CLIENTES_HOSTIS,
    DATA_REFERENCIA,
    LOJAS,
    MODELOS,
    VENDEDORES,
    Dados,
    gerar,
    meses,
    repartir,
)


@pytest.fixture(scope="module")
def dados() -> Dados:
    return gerar()


def test_mesma_semente_mesmos_dados(dados: Dados) -> None:
    assert gerar().impressao_digital() == dados.impressao_digital()


def test_outra_semente_outros_dados(dados: Dados) -> None:
    assert gerar(7).impressao_digital() != dados.impressao_digital()


def test_volume_esperado(dados: Dados) -> None:
    # Plano: ~250-350 vendas por mês, ~7 mil no total (estimativa da fase 0).
    assert 5_500 <= len(dados.vendas) <= 7_500
    assert len(dados.metas) == 24 * len(LOJAS)


def test_24_meses_de_out_2024_a_set_2026() -> None:
    lista = list(meses())
    assert (lista[0], lista[-1], len(lista)) == (date(2024, 10, 1), date(2026, 9, 1), 24)


def test_nenhuma_venda_depois_da_data_de_referencia(dados: Dados) -> None:
    datas = [v.vendido_em.date() for v in dados.vendas]
    assert min(datas) >= date(2024, 10, 1)
    assert max(datas) <= DATA_REFERENCIA


def test_vendedor_e_da_loja_e_estava_empregado_no_dia(dados: Dados) -> None:
    por_id = {v.id: v for v in VENDEDORES}
    for venda in dados.vendas:
        vendedor = por_id[venda.vendedor_id]
        dia = venda.vendido_em.date()
        assert vendedor.loja_id == venda.loja_id
        assert vendedor.admitido_em <= dia
        assert vendedor.desligado_em is None or dia <= vendedor.desligado_em


def test_unidades_do_mes_batem_com_meta_vezes_atingimento(dados: Dados) -> None:
    # A soma por loja e mês fecha exatamente (repartição pelo maior resto, sem perda).
    unidades: Counter[tuple[int, date]] = Counter()
    for v in dados.vendas:
        unidades[(v.loja_id, v.vendido_em.date().replace(day=1))] += v.quantidade
    for meta in dados.metas:
        razao = unidades[(meta.loja_id, meta.mes)] / meta.meta_unidades
        assert 0.65 <= razao <= 1.15, (meta, razao)


def test_desconto_e_preco_coerentes(dados: Dados) -> None:
    for v in dados.vendas:
        assert v.valor_unitario <= v.preco_tabela
        assert v.valor_unitario >= v.preco_tabela * Decimal("0.85")
        if v.forma_pagamento == "Consorcio":
            assert v.valor_unitario == v.preco_tabela


def test_quantidade_e_forma_de_pagamento_validas(dados: Dados) -> None:
    assert {v.quantidade for v in dados.vendas} <= {1, 2}
    assert {v.forma_pagamento for v in dados.vendas} == {"A vista", "Financiado", "Consorcio"}


def test_clientes_hostis_plantados_uma_vez_cada(dados: Dados) -> None:
    contagem = Counter(v.cliente_nome for v in dados.vendas)
    for nome in CLIENTES_HOSTIS:
        assert contagem[nome] == 1


def test_ids_unicos_nos_cadastros() -> None:
    for itens in (LOJAS, VENDEDORES, MODELOS):
        ids = [i.id for i in itens]
        assert len(ids) == len(set(ids))


@pytest.mark.parametrize(
    ("total", "pesos", "esperado"),
    [
        (10, [1, 1], [5, 5]),
        (10, [1, 1, 1], [4, 3, 3]),  # empate no resto: ganha quem vem primeiro
        (7, [0.0, 1.0], [0, 7]),
        (0, [1, 2], [0, 0]),
        (100, [0.3, 0.7], [30, 70]),
    ],
)
def test_repartir_pelo_maior_resto(total: int, pesos: list[float], esperado: list[int]) -> None:
    assert repartir(total, pesos) == esperado


@pytest.mark.parametrize(("total", "pesos"), [(-1, [1.0]), (5, [0.0, 0.0]), (5, [])])
def test_repartir_recusa_entrada_invalida(total: int, pesos: list[float]) -> None:
    with pytest.raises(ValueError, match="pesos"):
        repartir(total, pesos)
