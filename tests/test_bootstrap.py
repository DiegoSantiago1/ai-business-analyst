"""Testes unitários do bootstrap: citação de valores para o psql e linha de comando."""

import pytest

from analista.bootstrap import (
    citar_valor_psql,
    comando_psql,
    comando_psql_remoto,
    conferir_usuarios,
    config_docker,
    montar_entrada_psql,
    usuario_da_url,
)
from analista.config import ConfigError, carregar_config_banco

from .test_config import ENV_VALIDO


@pytest.mark.parametrize(
    ("valor", "esperado"),
    [
        ("simples", "'simples'"),
        ("aspa'dentro", "'aspa''dentro'"),
        ("barra\\n", "'barra\\\\n'"),
        ("'; DROP ROLE honda; --", "'''; DROP ROLE honda; --'"),
    ],
)
def test_citar_valor_psql(valor: str, esperado: str) -> None:
    assert citar_valor_psql(valor) == esperado


@pytest.mark.parametrize("valor", ["linha\nnova", "retorno\r", "nulo\0"])
def test_quebra_de_linha_e_recusada(valor: str) -> None:
    # Uma quebra de linha encerraria o \set e o resto viraria comando do psql.
    with pytest.raises(ConfigError):
        citar_valor_psql(valor)


def test_entrada_define_todas_as_variaveis_antes_do_sql() -> None:
    entrada = montar_entrada_psql(carregar_config_banco(ENV_VALIDO), "SELECT 1;")
    linhas = entrada.splitlines()
    assert linhas[-1] == "SELECT 1;"
    nomes = [linha.split()[1] for linha in linhas[:-1]]
    assert nomes == ["usuario", "senha", "banco", "banco_teste", "ia_usuario", "ia_senha"]


def test_comando_psql_nao_leva_senha() -> None:
    comando = comando_psql("docker", "honda-vendas-db", "honda")
    assert not any("senha" in parte for parte in comando)
    assert comando[:4] == ["docker", "exec", "-i", "honda-vendas-db"]


@pytest.mark.parametrize("container", ["", "-x", "a b", "a;rm"])
def test_container_invalido(container: str) -> None:
    env = {"ANALISTA_DOCKER_CONTAINER": container, "ANALISTA_DOCKER_SUPERUSER": "honda"}
    with pytest.raises(ConfigError, match="ANALISTA_DOCKER_CONTAINER"):
        config_docker(env)


def test_superusuario_invalido() -> None:
    env = {"ANALISTA_DOCKER_CONTAINER": "honda-vendas-db", "ANALISTA_DOCKER_SUPERUSER": "Honda;"}
    with pytest.raises(ConfigError, match="ANALISTA_DOCKER_SUPERUSER"):
        config_docker(env)


@pytest.mark.parametrize("variavel", ["ANALISTA_DB_USER", "ANALISTA_IA_USER"])
def test_nenhum_usuario_do_projeto_pode_ser_o_superusuario(variavel: str) -> None:
    config = carregar_config_banco({**ENV_VALIDO, variavel: "honda"})
    with pytest.raises(ConfigError, match=variavel):
        conferir_usuarios(config, "honda")


def test_usuarios_proprios_passam() -> None:
    conferir_usuarios(carregar_config_banco(ENV_VALIDO), "honda")


def test_comando_remoto_nao_leva_a_url_nem_a_senha() -> None:
    comando = comando_psql_remoto("docker")
    assert "-e" in comando and "PGURL" in comando
    assert not any("postgresql://" in parte or "senha" in parte for parte in comando)


@pytest.mark.parametrize(
    ("url", "usuario"),
    [
        ("postgresql://neondb_owner:abc@ep-x.neon.tech/neondb?sslmode=require", "neondb_owner"),
        ("postgres://admin:x@host.docker.internal:55432/postgres", "admin"),
    ],
)
def test_usuario_da_url(url: str, usuario: str) -> None:
    assert usuario_da_url(url) == usuario


@pytest.mark.parametrize("url", ["", "mysql://a:b@h/x", "postgresql://h/x", "não é url"])
def test_url_invalida(url: str) -> None:
    with pytest.raises(ConfigError, match="ANALISTA_ADMIN_URL"):
        usuario_da_url(url)
