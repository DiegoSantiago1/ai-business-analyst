"""Tabelas de origem do schema vendas (modelo do Projeto 1, ampliado).

Diferenças em relação ao Projeto 1 (docs/DECISOES.md D2):
- metas_mensais: meta de unidades por loja e mês (com 2 anos de história a meta muda);
- vendedores com admissão e desligamento (vendedor novo, vendedor que saiu);
- modelos com a linha (HR-V, City Sedan...), além da versão e da categoria;
- vendas guardam o preço de tabela do dia da venda, para medir o desconto;
- parametros: a data de referência fixa (D3), numa tabela de uma linha só.

Toda regra que dá para garantir no banco fica no banco (CHECK, UNIQUE, FK), testada com
entrada hostil em tests/test_tabelas.py.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-04

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE vendas.parametros (
            -- Tabela de uma linha só: a PK é sempre TRUE.
            unica            BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (unica),
            data_referencia  DATE NOT NULL
        );
        COMMENT ON TABLE vendas.parametros IS
            'Data de referência fixa: "hoje" e "este mês" são relativos a ela (D3).';

        CREATE TABLE vendas.lojas (
            id      SMALLINT PRIMARY KEY,
            nome    TEXT NOT NULL UNIQUE CHECK (btrim(nome) <> ''),
            cidade  TEXT NOT NULL CHECK (btrim(cidade) <> '')
        );

        CREATE TABLE vendas.gerentes (
            id       SMALLINT PRIMARY KEY,
            nome     TEXT NOT NULL CHECK (btrim(nome) <> ''),
            loja_id  SMALLINT NOT NULL UNIQUE REFERENCES vendas.lojas (id)
        );

        CREATE TABLE vendas.vendedores (
            id            SMALLINT PRIMARY KEY,
            nome          TEXT NOT NULL CHECK (btrim(nome) <> ''),
            loja_id       SMALLINT NOT NULL REFERENCES vendas.lojas (id),
            admitido_em   DATE NOT NULL,
            desligado_em  DATE,
            CONSTRAINT ck_vendedores_periodo CHECK (desligado_em IS NULL OR desligado_em >= admitido_em),
            -- Alvo da FK composta de vendas: o vendedor tem de ser da loja da venda.
            CONSTRAINT uq_vendedores_id_loja UNIQUE (id, loja_id)
        );
        CREATE UNIQUE INDEX uq_vendedores_nome ON vendas.vendedores (lower(nome));

        CREATE TABLE vendas.modelos (
            id            SMALLINT PRIMARY KEY,
            nome          TEXT NOT NULL UNIQUE CHECK (btrim(nome) <> ''),
            linha         TEXT NOT NULL CHECK (btrim(linha) <> ''),
            categoria     TEXT NOT NULL CHECK (categoria IN ('Hatch', 'Sedan', 'SUV')),
            -- Preço de tabela ATUAL (ilustrativo, não é tabela oficial).
            preco_tabela  NUMERIC(12, 2) NOT NULL CHECK (preco_tabela > 0)
        );

        CREATE TABLE vendas.metas_mensais (
            loja_id        SMALLINT NOT NULL REFERENCES vendas.lojas (id),
            mes            DATE NOT NULL CHECK (mes = date_trunc('month', mes)::date),
            meta_unidades  INT NOT NULL CHECK (meta_unidades > 0),
            PRIMARY KEY (loja_id, mes)
        );

        CREATE TABLE vendas.vendas (
            id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            vendido_em        TIMESTAMPTZ NOT NULL,
            loja_id           SMALLINT NOT NULL REFERENCES vendas.lojas (id),
            vendedor_id       SMALLINT NOT NULL,
            modelo_id         SMALLINT NOT NULL REFERENCES vendas.modelos (id),
            quantidade        SMALLINT NOT NULL CHECK (quantidade BETWEEN 1 AND 10),
            -- Preço de tabela no dia da venda (os preços sobem com o tempo).
            preco_tabela      NUMERIC(12, 2) NOT NULL CHECK (preco_tabela > 0),
            valor_unitario    NUMERIC(12, 2) NOT NULL CHECK (valor_unitario > 0),
            forma_pagamento   TEXT NOT NULL CHECK (forma_pagamento IN ('A vista', 'Financiado', 'Consorcio')),
            cliente_nome      TEXT NOT NULL CHECK (btrim(cliente_nome) <> ''),
            -- Desconto de no máximo 15%: venda acima da tabela ou com desconto absurdo é
            -- erro de digitação, e o banco recusa.
            CONSTRAINT ck_vendas_desconto CHECK (
                valor_unitario <= preco_tabela AND valor_unitario >= preco_tabela * 0.85
            ),
            CONSTRAINT fk_vendas_vendedor_loja
                FOREIGN KEY (vendedor_id, loja_id) REFERENCES vendas.vendedores (id, loja_id)
        );
        -- As consultas filtram período por FAIXA (vendido_em >= x AND vendido_em < y).
        CREATE INDEX idx_vendas_vendido_em ON vendas.vendas (vendido_em);
        CREATE INDEX idx_vendas_loja_vendido_em ON vendas.vendas (loja_id, vendido_em);
        CREATE INDEX idx_vendas_vendedor ON vendas.vendas (vendedor_id);
        CREATE INDEX idx_vendas_modelo ON vendas.vendas (modelo_id);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE vendas.vendas;
        DROP TABLE vendas.metas_mensais;
        DROP TABLE vendas.modelos;
        DROP TABLE vendas.vendedores;
        DROP TABLE vendas.gerentes;
        DROP TABLE vendas.lojas;
        DROP TABLE vendas.parametros;
        """
    )
