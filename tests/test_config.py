"""Testes unitários da configuração: validação do .env na borda."""

import pytest

from analista.config import ConfigError, carregar_config_banco

ENV_VALIDO = {
    "ANALISTA_DB_HOST": "127.0.0.1",
    "ANALISTA_DB_PORT": "5432",
    "ANALISTA_DB_NAME": "vendas_ia",
    "ANALISTA_DB_NAME_TESTE": "vendas_ia_teste",
    "ANALISTA_DB_USER": "analista_dono",
    "ANALISTA_DB_PASSWORD": "senha_de_teste",
    "ANALISTA_IA_USER": "analista_ia",
    "ANALISTA_IA_PASSWORD": "senha_ia_de_teste",
}


def test_config_valida() -> None:
    config = carregar_config_banco(ENV_VALIDO)
    assert config.nome == "vendas_ia"
    assert config.porta == 5432
    assert config.do_banco_de_teste().nome == "vendas_ia_teste"


def test_como_ia_troca_usuario_e_senha() -> None:
    ia = carregar_config_banco(ENV_VALIDO).como_ia()
    assert (ia.usuario, ia.senha) == ("analista_ia", "senha_ia_de_teste")
    assert ia.nome == "vendas_ia"


def test_senhas_nao_aparecem_no_repr() -> None:
    texto = repr(carregar_config_banco(ENV_VALIDO))
    assert "senha_de_teste" not in texto
    assert "senha_ia_de_teste" not in texto


def test_senha_com_caracteres_especiais_vai_escapada_na_url() -> None:
    config = carregar_config_banco({**ENV_VALIDO, "ANALISTA_DB_PASSWORD": "a@b:c/d"})
    assert "a@b:c/d" not in config.url().render_as_string(hide_password=False)


OBRIGATORIAS = sorted(set(ENV_VALIDO) - {"ANALISTA_DB_NAME_TESTE"})


@pytest.mark.parametrize("variavel", OBRIGATORIAS)
def test_variavel_ausente(variavel: str) -> None:
    env = {k: v for k, v in ENV_VALIDO.items() if k != variavel}
    with pytest.raises(ConfigError, match=variavel):
        carregar_config_banco(env)


@pytest.mark.parametrize("variavel", OBRIGATORIAS)
def test_variavel_em_branco(variavel: str) -> None:
    with pytest.raises(ConfigError, match=variavel):
        carregar_config_banco({**ENV_VALIDO, variavel: "   "})


@pytest.mark.parametrize(
    "nome", ["Vendas", "vendas-ia", "1vendas", 'x"; DROP DATABASE retail; --', "a" * 64]
)
def test_identificador_invalido(nome: str) -> None:
    with pytest.raises(ConfigError, match="ANALISTA_DB_NAME"):
        carregar_config_banco({**ENV_VALIDO, "ANALISTA_DB_NAME": nome})


@pytest.mark.parametrize("porta", ["abc", "0", "65536", "-1"])
def test_porta_invalida(porta: str) -> None:
    with pytest.raises(ConfigError, match="ANALISTA_DB_PORT"):
        carregar_config_banco({**ENV_VALIDO, "ANALISTA_DB_PORT": porta})


def test_banco_de_teste_igual_ao_principal_e_recusado() -> None:
    # Os testes apagam o banco de testes: se fosse o principal, perderíamos os dados.
    with pytest.raises(ConfigError, match="não pode ser igual"):
        carregar_config_banco({**ENV_VALIDO, "ANALISTA_DB_NAME_TESTE": "vendas_ia"})


@pytest.mark.parametrize("usuario_ia", ["analista_dono", "analista_leitura"])
def test_usuario_da_ia_precisa_ser_proprio(usuario_ia: str) -> None:
    # Se a IA usasse o dono, toda a defesa no banco deixaria de existir.
    with pytest.raises(ConfigError, match="ANALISTA_IA_USER"):
        carregar_config_banco({**ENV_VALIDO, "ANALISTA_IA_USER": usuario_ia})


def test_sem_banco_de_testes_vale_na_nuvem_mas_nao_para_os_testes() -> None:
    env = {k: v for k, v in ENV_VALIDO.items() if k != "ANALISTA_DB_NAME_TESTE"}
    config = carregar_config_banco(env)
    with pytest.raises(ConfigError, match="banco de testes"):
        config.do_banco_de_teste()


@pytest.mark.parametrize(
    ("texto", "esperado"), [("", False), ("false", False), ("true", True), ("1", True)]
)
def test_ssl(texto: str, esperado: bool) -> None:
    config = carregar_config_banco({**ENV_VALIDO, "ANALISTA_DB_SSL": texto})
    assert config.ssl is esperado
    assert ("sslmode=require" in config.url().render_as_string()) is esperado


def test_ssl_invalido() -> None:
    with pytest.raises(ConfigError, match="ANALISTA_DB_SSL"):
        carregar_config_banco({**ENV_VALIDO, "ANALISTA_DB_SSL": "talvez"})
