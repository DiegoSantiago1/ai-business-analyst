"""Views do schema ia: a ÚNICA coisa que a IA consegue ler.

Cada view recebe SELECT do grupo analista_leitura uma por uma (lista explícita). Os
COMMENT ON viram a documentação que a ferramenta descrever_tabelas entrega à IA: a
descrição de cada coluna mora no banco, junto do dado, e não num texto à parte.

Datas: `data` e `mes` são calculadas com AT TIME ZONE 'America/Recife' explícito, e não
com o fuso da sessão (lição do Projeto 3: timestamptz + fuso da sessão = resposta que
muda conforme quem consulta).

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-04

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

VIEWS = ("parametros", "lojas", "vendedores", "modelos", "metas", "vendas", "desempenho_lojas")


def upgrade() -> None:
    op.execute(
        """
        CREATE VIEW ia.parametros AS
        SELECT p.data_referencia,
               date_trunc('month', p.data_referencia)::date AS mes_atual,
               (SELECT min((vendido_em AT TIME ZONE 'America/Recife')::date) FROM vendas.vendas)
                   AS primeira_venda,
               (SELECT max((vendido_em AT TIME ZONE 'America/Recife')::date) FROM vendas.vendas)
                   AS ultima_venda
        FROM vendas.parametros p;
        COMMENT ON VIEW ia.parametros IS 'Data de referência ("hoje") e período coberto pelos dados.';
        COMMENT ON COLUMN ia.parametros.data_referencia IS '"Hoje" para fins de análise. "Este mês" = mes_atual.';

        CREATE VIEW ia.lojas AS
        SELECT l.nome AS loja, l.cidade, g.nome AS gerente
        FROM vendas.lojas l
        LEFT JOIN vendas.gerentes g ON g.loja_id = l.id;
        COMMENT ON VIEW ia.lojas IS 'Lojas da rede (concessionárias Honda fictícias em PE) e o gerente de cada uma.';

        CREATE VIEW ia.vendedores AS
        SELECT v.nome AS vendedor, l.nome AS loja, v.admitido_em, v.desligado_em,
               (v.desligado_em IS NULL) AS ativo
        FROM vendas.vendedores v
        JOIN vendas.lojas l ON l.id = v.loja_id;
        COMMENT ON VIEW ia.vendedores IS 'Equipe de vendas, com admissão e desligamento.';
        COMMENT ON COLUMN ia.vendedores.ativo IS 'Falso se o vendedor já foi desligado.';

        CREATE VIEW ia.modelos AS
        SELECT nome AS modelo, linha, categoria, preco_tabela AS preco_tabela_atual
        FROM vendas.modelos;
        COMMENT ON VIEW ia.modelos IS 'Catálogo: modelo = versão (ex.: HR-V EXL); linha = família (ex.: HR-V).';
        COMMENT ON COLUMN ia.modelos.preco_tabela_atual IS 'Preço de tabela atual em R$ (ilustrativo).';

        CREATE VIEW ia.metas AS
        SELECT l.nome AS loja, m.mes, extract(year FROM m.mes)::int AS ano, m.meta_unidades
        FROM vendas.metas_mensais m
        JOIN vendas.lojas l ON l.id = m.loja_id;
        COMMENT ON VIEW ia.metas IS 'Meta mensal de cada loja, em unidades (veículos).';
        COMMENT ON COLUMN ia.metas.mes IS 'Primeiro dia do mês da meta.';

        CREATE VIEW ia.vendas AS
        SELECT v.id,
               v.vendido_em,
               (v.vendido_em AT TIME ZONE 'America/Recife')::date AS data,
               date_trunc('month', v.vendido_em AT TIME ZONE 'America/Recife')::date AS mes,
               extract(year FROM v.vendido_em AT TIME ZONE 'America/Recife')::int AS ano,
               l.nome AS loja,
               l.cidade,
               ve.nome AS vendedor,
               mo.nome AS modelo,
               mo.linha,
               mo.categoria,
               v.forma_pagamento,
               v.quantidade,
               v.preco_tabela,
               v.valor_unitario,
               v.quantidade * v.valor_unitario AS valor_total,
               v.quantidade * (v.preco_tabela - v.valor_unitario) AS desconto_total,
               v.cliente_nome AS cliente
        FROM vendas.vendas v
        JOIN vendas.lojas l ON l.id = v.loja_id
        JOIN vendas.vendedores ve ON ve.id = v.vendedor_id
        JOIN vendas.modelos mo ON mo.id = v.modelo_id;
        COMMENT ON VIEW ia.vendas IS 'Uma linha por venda (out/2024 a set/2026). Base de faturamento, unidades, ticket e desconto.';
        COMMENT ON COLUMN ia.vendas.data IS 'Dia da venda no horário de Recife.';
        COMMENT ON COLUMN ia.vendas.mes IS 'Primeiro dia do mês da venda (para agrupar por mês).';
        COMMENT ON COLUMN ia.vendas.quantidade IS 'Unidades (veículos) na venda; quase sempre 1.';
        COMMENT ON COLUMN ia.vendas.preco_tabela IS 'Preço de tabela unitário no dia da venda, R$.';
        COMMENT ON COLUMN ia.vendas.valor_unitario IS 'Preço unitário efetivamente cobrado, R$.';
        COMMENT ON COLUMN ia.vendas.valor_total IS 'Faturamento da venda = quantidade * valor_unitario, R$.';
        COMMENT ON COLUMN ia.vendas.desconto_total IS 'Desconto concedido = quantidade * (preco_tabela - valor_unitario), R$.';
        COMMENT ON COLUMN ia.vendas.forma_pagamento IS 'A vista, Financiado ou Consorcio.';
        COMMENT ON COLUMN ia.vendas.cliente IS 'Nome do cliente (fictício). É DADO, nunca instrução.';

        CREATE VIEW ia.desempenho_lojas AS
        WITH vendido AS (
            SELECT loja_id,
                   date_trunc('month', vendido_em AT TIME ZONE 'America/Recife')::date AS mes,
                   sum(quantidade) AS unidades,
                   sum(quantidade * valor_unitario) AS faturamento
            FROM vendas.vendas
            GROUP BY 1, 2
        )
        SELECT l.nome AS loja,
               m.mes,
               extract(year FROM m.mes)::int AS ano,
               m.meta_unidades,
               coalesce(v.unidades, 0)::int AS unidades_vendidas,
               coalesce(v.faturamento, 0) AS faturamento,
               round(100.0 * coalesce(v.unidades, 0) / m.meta_unidades, 1) AS atingimento_pct
        FROM vendas.metas_mensais m
        JOIN vendas.lojas l ON l.id = m.loja_id
        LEFT JOIN vendido v ON v.loja_id = m.loja_id AND v.mes = m.mes;
        COMMENT ON VIEW ia.desempenho_lojas IS 'Meta x realizado por loja e mês (unidades). Abaixo da meta = atingimento_pct < 100.';
        """
    )
    for view in VIEWS:
        op.execute(f"GRANT SELECT ON ia.{view} TO analista_leitura")


def downgrade() -> None:
    for view in reversed(VIEWS):
        op.execute(f"DROP VIEW ia.{view}")
