"""Gera os dados fictícios e carrega no banco, numa transação só.

Uso:
    python -m analista.carga            # banco principal
    python -m analista.carga teste      # banco de testes

Apaga e recarrega tudo (TRUNCATE + COPY): a carga é idempotente, e rodar duas vezes dá
exatamente o mesmo banco (mesma semente, mesma impressão digital). Se algo falhar no
meio, o ROLLBACK deixa o banco como estava.
"""

from __future__ import annotations

import argparse
import sys

import psycopg

from analista.banco import Conexao, conectar
from analista.config import ConfigBanco, ConfigError, carregar_config_banco
from analista.gerador import Dados, gerar


def carregar(con: Conexao, dados: Dados) -> None:
    """Substitui o conteúdo do schema vendas pelos dados. Não faz commit (quem chama decide)."""
    con.execute(
        "TRUNCATE vendas.vendas, vendas.metas_mensais, vendas.vendedores, vendas.gerentes, "
        "vendas.modelos, vendas.lojas, vendas.parametros RESTART IDENTITY"
    )
    con.execute(
        "INSERT INTO vendas.parametros (data_referencia) VALUES (%s)", (dados.data_referencia,)
    )
    with con.cursor() as cur:
        cur.executemany(
            "INSERT INTO vendas.lojas (id, nome, cidade) VALUES (%s, %s, %s)",
            [(loja.id, loja.nome, loja.cidade) for loja in dados.lojas],
        )
        cur.executemany(
            "INSERT INTO vendas.gerentes (id, nome, loja_id) VALUES (%s, %s, %s)",
            [(g.id, g.nome, g.loja_id) for g in dados.gerentes],
        )
        cur.executemany(
            "INSERT INTO vendas.vendedores (id, nome, loja_id, admitido_em, desligado_em) "
            "VALUES (%s, %s, %s, %s, %s)",
            [(v.id, v.nome, v.loja_id, v.admitido_em, v.desligado_em) for v in dados.vendedores],
        )
        cur.executemany(
            "INSERT INTO vendas.modelos (id, nome, linha, categoria, preco_tabela) "
            "VALUES (%s, %s, %s, %s, %s)",
            [(m.id, m.nome, m.linha, m.categoria, m.preco_tabela) for m in dados.modelos],
        )
        with cur.copy(
            "COPY vendas.metas_mensais (loja_id, mes, meta_unidades) FROM STDIN"
        ) as copia:
            for meta in dados.metas:
                copia.write_row((meta.loja_id, meta.mes, meta.meta_unidades))
        # Vendas em ordem cronológica: o id cresce com a data.
        with cur.copy(
            "COPY vendas.vendas (vendido_em, loja_id, vendedor_id, modelo_id, quantidade, "
            "preco_tabela, valor_unitario, forma_pagamento, cliente_nome) FROM STDIN"
        ) as copia:
            for v in dados.vendas:
                copia.write_row(
                    (
                        v.vendido_em, v.loja_id, v.vendedor_id, v.modelo_id, v.quantidade,
                        v.preco_tabela, v.valor_unitario, v.forma_pagamento, v.cliente_nome,
                    )
                )  # fmt: skip
    # Estatísticas atualizadas: o planejador escolhe bem os índices logo na primeira consulta.
    con.execute("ANALYZE vendas.vendas, vendas.metas_mensais")


def carregar_banco(config: ConfigBanco) -> Dados:
    dados = gerar()
    with conectar(config) as con:
        carregar(con, dados)
        con.commit()
    return dados


def main(argumentos: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Gera e carrega os dados fictícios.")
    parser.add_argument("banco", nargs="?", choices=["principal", "teste"], default="principal")
    args = parser.parse_args(argumentos)
    try:
        config = carregar_config_banco()
        if args.banco == "teste":
            config = config.do_banco_de_teste()
        dados = carregar_banco(config)
    except ConfigError as erro:
        print(f"Erro: {erro}", file=sys.stderr)
        return 1
    except psycopg.OperationalError as erro:
        print(f"Erro: banco inacessível ({erro}).", file=sys.stderr)
        return 1
    unidades = sum(v.quantidade for v in dados.vendas)
    print(
        f"Banco {config.nome!r}: {len(dados.vendas)} vendas ({unidades} unidades), "
        f"{len(dados.metas)} metas. Impressão digital: {dados.impressao_digital()[:16]}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
