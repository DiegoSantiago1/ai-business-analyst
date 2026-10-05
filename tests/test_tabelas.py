"""Regras do banco testadas com entrada hostil: o PostgreSQL recusa dado inválido.

Cada tentativa roda num savepoint dentro da transação do teste (desfeita no fim), então
o banco de testes carregado não muda.
"""

import pytest
from psycopg import errors

from analista.banco import Conexao

pytestmark = pytest.mark.integracao

VENDA_VALIDA = {
    "vendido_em": "2026-09-15 10:00-03",
    "loja_id": 1,
    "vendedor_id": 1,
    "modelo_id": 1,
    "quantidade": 1,
    "preco_tabela": 100000,
    "valor_unitario": 95000,
    "forma_pagamento": "A vista",
    "cliente_nome": "Cliente Teste",
}


def inserir_venda(bd: Conexao, **trocas: object) -> None:
    venda = {**VENDA_VALIDA, **trocas}
    colunas = ", ".join(venda)
    valores = ", ".join(f"%({c})s" for c in venda)
    with bd.transaction():
        bd.execute(f"INSERT INTO vendas.vendas ({colunas}) VALUES ({valores})", venda)


def test_venda_valida_entra(bd: Conexao, banco_carregado: None) -> None:
    inserir_venda(bd)


@pytest.mark.parametrize(
    ("trocas", "erro"),
    [
        ({"quantidade": 0}, errors.CheckViolation),
        ({"quantidade": 11}, errors.CheckViolation),
        ({"valor_unitario": 100001}, errors.CheckViolation),  # acima da tabela
        ({"valor_unitario": 84999}, errors.CheckViolation),  # desconto acima de 15%
        ({"preco_tabela": 0, "valor_unitario": 0}, errors.CheckViolation),
        ({"forma_pagamento": "Cheque"}, errors.CheckViolation),
        ({"forma_pagamento": "a vista"}, errors.CheckViolation),
        ({"cliente_nome": "   "}, errors.CheckViolation),
        ({"cliente_nome": None}, errors.NotNullViolation),
        ({"vendedor_id": 6}, errors.ForeignKeyViolation),  # vendedor da Loja Norte
        ({"modelo_id": 999}, errors.ForeignKeyViolation),
        ({"loja_id": 99}, errors.ForeignKeyViolation),
    ],
)
def test_venda_invalida_e_recusada(
    bd: Conexao, banco_carregado: None, trocas: dict[str, object], erro: type[Exception]
) -> None:
    with pytest.raises(erro):
        inserir_venda(bd, **trocas)


@pytest.mark.parametrize(
    ("comando", "erro"),
    [
        (
            "INSERT INTO vendas.metas_mensais VALUES (1, '2026-10-15', 50)",
            errors.CheckViolation,
        ),  # mês tem de ser o dia 1
        ("INSERT INTO vendas.metas_mensais VALUES (1, '2026-10-01', 0)", errors.CheckViolation),
        ("INSERT INTO vendas.metas_mensais VALUES (1, '2026-09-01', 50)", errors.UniqueViolation),
        ("INSERT INTO vendas.parametros VALUES (FALSE, '2026-01-01')", errors.CheckViolation),
        ("INSERT INTO vendas.parametros VALUES (TRUE, '2026-01-01')", errors.UniqueViolation),
        (
            "INSERT INTO vendas.vendedores VALUES (99, 'ANA PAULA RIBEIRO', 1, '2026-01-01', NULL)",
            errors.UniqueViolation,
        ),  # mesmo nome, outra caixa
        (
            "INSERT INTO vendas.vendedores VALUES (99, 'Novo', 1, '2026-01-01', '2025-12-31')",
            errors.CheckViolation,
        ),  # desligado antes de admitido
        ("INSERT INTO vendas.modelos VALUES (99, 'X', 'X', 'Pickup', 1)", errors.CheckViolation),
        ("INSERT INTO vendas.gerentes VALUES (99, 'Outro', 1)", errors.UniqueViolation),
    ],
)
def test_cadastro_invalido_e_recusado(
    bd: Conexao, banco_carregado: None, comando: str, erro: type[Exception]
) -> None:
    with pytest.raises(erro), bd.transaction():
        bd.execute(comando)


def test_nao_apaga_loja_com_vendas(bd: Conexao, banco_carregado: None) -> None:
    with pytest.raises(errors.ForeignKeyViolation), bd.transaction():
        bd.execute("DELETE FROM vendas.lojas WHERE id = 1")
