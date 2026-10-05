"""Testes hostis da camada 4 da defesa (D6): o que o usuário da IA NÃO consegue fazer.

O usuário da IA é o mesmo que a API vai usar. Aqui ele tenta escrever e criar coisas
direto no banco, sem passar por nenhuma trava da aplicação. Cada tentativa tem de ser
barrada pelo próprio PostgreSQL.
"""

import psycopg
import pytest
from psycopg import errors

from analista.banco import Conexao
from analista.config import GRUPO_LEITURA, ConfigBanco

from .apoio import valor

pytestmark = pytest.mark.integracao

TENTATIVAS_DE_CRIAR = [
    "CREATE TABLE ia.invasora (id int)",
    "CREATE VIEW ia.invasora AS SELECT 1 AS x",
    "CREATE TABLE vendas.invasora (id int)",
    "CREATE TABLE public.invasora (id int)",
    "CREATE TEMP TABLE invasora (id int)",
    "CREATE SCHEMA invasor",
    "CREATE FUNCTION ia.invasora() RETURNS int LANGUAGE sql AS 'SELECT 1'",
]


def test_usuario_da_ia_nao_tem_privilegios_especiais(bd: Conexao, banco_teste: ConfigBanco) -> None:
    linha = bd.execute(
        """
        SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls,
               rolconnlimit, rolconfig
        FROM pg_roles WHERE rolname = %(u)s
        """,
        {"u": banco_teste.usuario_ia},
    ).fetchone()
    assert linha is not None, "usuário da IA não existe: rode python -m analista.bootstrap"
    *atributos, limite, padroes = linha
    assert atributos == [False] * 5
    assert limite == 5
    assert sorted(padroes) == [
        "default_transaction_read_only=on",
        "idle_in_transaction_session_timeout=10s",
        "search_path=ia",
        "statement_timeout=5s",
    ]


def test_dono_tambem_nao_e_superusuario(bd: Conexao, banco_teste: ConfigBanco) -> None:
    assert valor(bd, "SELECT rolsuper FROM pg_roles WHERE rolname = current_user") is False
    assert valor(bd, "SELECT current_user") == banco_teste.usuario


def test_sessao_da_ia_ja_comeca_travada(bd_ia: Conexao) -> None:
    assert valor(bd_ia, "SHOW default_transaction_read_only") == "on"
    assert valor(bd_ia, "SHOW transaction_read_only") == "on"
    assert valor(bd_ia, "SHOW statement_timeout") == "5s"
    assert valor(bd_ia, "SHOW idle_in_transaction_session_timeout") == "10s"
    assert valor(bd_ia, "SHOW search_path") == "ia"


@pytest.mark.parametrize("comando", TENTATIVAS_DE_CRIAR)
def test_transacao_somente_leitura_barra_escrita(bd_ia: Conexao, comando: str) -> None:
    with pytest.raises(errors.ReadOnlySqlTransaction):
        bd_ia.execute(comando)


@pytest.mark.parametrize("comando", TENTATIVAS_DE_CRIAR)
def test_mesmo_desligando_o_somente_leitura_os_privilegios_barram(
    bd_ia: Conexao, comando: str
) -> None:
    # O usuário consegue desligar o padrão de somente leitura (é só um SET). É por isso
    # que ele não é a garantia: a garantia é ele não ter privilégio para criar nada.
    bd_ia.execute("SET default_transaction_read_only = off")
    bd_ia.commit()
    assert valor(bd_ia, "SHOW transaction_read_only") == "off"
    with pytest.raises(errors.InsufficientPrivilege):
        bd_ia.execute(comando)


def test_ia_so_enxerga_o_schema_ia(bd_ia: Conexao) -> None:
    privilegios = bd_ia.execute(
        """
        SELECT s, has_schema_privilege(s, 'USAGE'), has_schema_privilege(s, 'CREATE')
        FROM unnest(ARRAY['ia', 'vendas', 'public']) AS s
        ORDER BY s
        """
    ).fetchall()
    assert privilegios == [
        ("ia", True, False),
        ("public", False, False),
        ("vendas", False, False),
    ]


def test_ia_nao_le_tabelas_de_vendas(bd_ia: Conexao) -> None:
    # Nesta fase o schema vendas ainda está vazio; o nome não precisa existir para o
    # PostgreSQL barrar: sem USAGE no schema, nada dele é resolvido.
    with pytest.raises(errors.InsufficientPrivilege):
        bd_ia.execute("SELECT * FROM vendas.vendas")


@pytest.mark.parametrize(
    ("papel", "privilegio", "esperado"),
    [
        ("public", "CONNECT", False),
        ("public", "TEMPORARY", False),
        ("public", "CREATE", False),
        (GRUPO_LEITURA, "CONNECT", True),
        (GRUPO_LEITURA, "TEMPORARY", False),
        (GRUPO_LEITURA, "CREATE", False),
    ],
)
def test_privilegios_no_banco(
    bd: Conexao, banco_teste: ConfigBanco, papel: str, privilegio: str, esperado: bool
) -> None:
    obtido = valor(
        bd,
        "SELECT has_database_privilege(%(p)s, %(b)s, %(priv)s)",
        {"p": papel, "b": banco_teste.nome, "priv": privilegio},
    )
    assert obtido is esperado


def test_ia_nao_entra_com_senha_errada(banco_teste: ConfigBanco) -> None:
    with pytest.raises(psycopg.OperationalError):
        psycopg.connect(
            host=banco_teste.host,
            port=banco_teste.porta,
            dbname=banco_teste.nome,
            user=banco_teste.usuario_ia,
            password="senha_errada",
            connect_timeout=5,
        ).close()


VIEWS_DA_IA = [
    "parametros", "lojas", "vendedores", "modelos", "metas", "vendas", "desempenho_lojas",
]  # fmt: skip


@pytest.mark.parametrize("view", VIEWS_DA_IA)
def test_ia_le_cada_view_liberada(bd_ia: Conexao, banco_carregado: None, view: str) -> None:
    assert valor(bd_ia, f"SELECT count(*) FROM ia.{view}") > 0  # type: ignore[operator]


def test_lista_de_views_liberadas_e_exatamente_esta(bd: Conexao, banco_carregado: None) -> None:
    # Allowlist: qualquer view nova sem GRANT, ou GRANT a mais, quebra este teste.
    linhas = bd.execute(
        "SELECT table_name FROM information_schema.role_table_grants "
        "WHERE grantee = %s AND privilege_type = 'SELECT' ORDER BY 1",
        (GRUPO_LEITURA,),
    ).fetchall()
    assert [t for (t,) in linhas] == sorted(VIEWS_DA_IA)


@pytest.mark.parametrize("tabela", ["vendas", "lojas", "vendedores", "metas_mensais", "parametros"])
def test_ia_nao_le_nenhuma_tabela_de_origem(
    bd_ia: Conexao, banco_carregado: None, tabela: str
) -> None:
    with pytest.raises(errors.InsufficientPrivilege):
        bd_ia.execute(f"SELECT * FROM vendas.{tabela}")
