"""Acesso ao banco: conexão do psycopg."""

from __future__ import annotations

import psycopg
from psycopg.rows import TupleRow

from analista.config import ConfigBanco

type Conexao = psycopg.Connection[TupleRow]


def conectar(config: ConfigBanco) -> Conexao:
    """Conecta com o usuário e o banco da config."""
    return psycopg.connect(
        host=config.host,
        port=config.porta,
        dbname=config.nome,
        user=config.usuario,
        password=config.senha,
        connect_timeout=5,
        # Banco gerenciado (Neon): conexão cifrada obrigatória. No local, "prefer" (o padrão
        # do libpq) usa TLS só se o servidor oferecer.
        sslmode="require" if config.ssl else "prefer",
    )
