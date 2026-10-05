"""Schemas vendas e ia, e as permissões de base do usuário da IA.

- vendas: tabelas de origem (lojas, vendedores, modelos, vendas, metas). Só o dono vê.
- ia: views que a IA pode consultar. O grupo analista_leitura recebe USAGE aqui e, nas
  migrações seguintes, SELECT em cada view, uma por uma (lista explícita do que a IA
  pode ver, sem ALTER DEFAULT PRIVILEGES: nada fica visível por acidente).

Revision ID: 0001
Revises:
Create Date: 2026-10-04

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        -- O PostgreSQL 15+ já tira o CREATE do PUBLIC no schema public, mas deixa o USAGE.
        -- Aqui o public fica fechado: ninguém além do dono usa esse schema.
        REVOKE ALL ON SCHEMA public FROM PUBLIC;

        CREATE SCHEMA vendas;
        COMMENT ON SCHEMA vendas IS
            'Tabelas de origem (dados fictícios de vendas). Só o dono acessa; a IA nunca lê daqui.';

        CREATE SCHEMA ia;
        COMMENT ON SCHEMA ia IS
            'Views que a IA pode consultar (SELECT concedido view por view ao grupo analista_leitura).';

        -- USAGE deixa o grupo enxergar os nomes do schema; não dá acesso a nenhuma view.
        -- Sem CREATE: a IA não cria nada aqui.
        GRANT USAGE ON SCHEMA ia TO analista_leitura;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        -- Sem CASCADE: se sobrou algum objeto (migração seguinte mal desfeita), o
        -- downgrade falha em vez de apagar em silêncio.
        DROP SCHEMA ia;
        DROP SCHEMA vendas;
        GRANT USAGE ON SCHEMA public TO PUBLIC;
        """
    )
