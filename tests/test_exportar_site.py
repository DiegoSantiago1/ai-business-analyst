"""Testes do exportador da página: escolhe conversas reais, corta tabelas e calcula custos."""

from typing import Any

import pytest

from analista.exportar_site import (
    CONVERSAS,
    LINHAS_POR_PASSO,
    custos,
    montar,
    resumo_com_processamento,
)


def item(id_: str, tipo: str = "numero", ok: bool = True, status: int = 200) -> dict[str, Any]:
    return {
        "id": id_,
        "tipo": tipo,
        "pergunta": f"pergunta {id_}",
        "ok": ok,
        "motivos": [] if ok else ["x"],
        "status": status,
        "resposta": {
            "resposta": "texto",
            "numeros": [{"rotulo": "a", "valor": 1, "unidade": "R$", "conferido": True}],
            "tabela": {
                "colunas": ["loja", "v"],
                "linhas": [{"loja": str(n), "v": n} for n in range(40)],
            },
            "passos": [
                {
                    "ferramenta": "consultar_metrica",
                    "argumentos": {},
                    "sql": "SELECT 1",
                    "colunas": ["v"],
                    "linhas": [{"v": n} for n in range(40)],
                    "totalLinhas": 40,
                    "duracaoMs": 3,
                },
                {
                    "ferramenta": "descrever_tabelas",
                    "argumentos": {},
                    "linhas": [{"descricao": "longa"}],
                    "duracaoMs": 2,
                },
            ],
            "uso": {
                "tokensEntrada": 4000,
                "tokensSaida": 200,
                "tokensTotal": 4200,
                "latenciaMs": 9000,
                "esperaCotaMs": 7000,
                "voltas": 2,
                "modelo": "openai/gpt-oss-120b",
                "versaoPrompt": "v3",
            },
        }
        if status == 200
        else {"erro": "falha_ia"},
    }


def rodada(itens: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "modelo": "openai/gpt-oss-120b",
        "inicio": "2026-10-05T03:00:00+00:00",
        "banco_intacto": True,
        "itens": itens,
        "resumo": {"perguntas": len(itens), "acertos": 1},
    }


def test_conversas_na_ordem_escolhida_e_so_as_respondidas() -> None:
    ids = list(CONVERSAS)
    r = rodada([item(ids[1]), item(ids[0]), item(ids[2], status=502), item("zz")])
    pagina = montar(r)
    assert [c["id"] for c in pagina["conversas"]] == [ids[0], ids[1]]
    assert pagina["conversas"][0]["pergunta_en"] == CONVERSAS[ids[0]]


def test_tabelas_cortadas_e_descricao_sem_texto_longo() -> None:
    c = montar(rodada([item(next(iter(CONVERSAS)))]))["conversas"][0]
    assert len(c["passos"][0]["linhas"]) == LINHAS_POR_PASSO
    assert "linhas" not in c["passos"][1]
    assert len(c["tabela"]["linhas"]) == 24


def test_custo_por_pergunta_pelos_tokens_medidos() -> None:
    c = custos(rodada([item("a"), item("b")]))
    # 4000 x 0,15/1e6 + 200 x 0,60/1e6 = 0,00072
    assert c["custo_por_pergunta_usd"] == pytest.approx(0.00072)
    assert c["perguntas_por_dolar"] == 1389


def test_processamento_desconta_a_espera_da_cota() -> None:
    resumo = resumo_com_processamento(rodada([item("a"), item("b", status=502)]))
    assert resumo["processamento_ms"] == {"p50": 2000, "p95": 2000, "n": 1}


def test_rodada_parcial_e_identificavel() -> None:
    pagina = montar(rodada([item("a")]))
    assert pagina["avaliacao"]["perguntas_planejadas"] == 36
    assert pagina["avaliacao"]["resumo"]["perguntas"] == 1


def test_conversa_que_faltou_vem_da_complementar() -> None:
    ids = list(CONVERSAS)
    oficial = rodada([item(ids[0]), item(ids[1], status=502)])
    extra = rodada([item(ids[1]), item(ids[0], ok=False)])
    pagina = montar(oficial, complementares=[extra])
    assert [c["id"] for c in pagina["conversas"]] == [ids[0], ids[1]]
    # A oficial tem prioridade quando as duas responderam.
    assert pagina["conversas"][0]["ok"] is True
    assert pagina["complementares"][0]["versao_prompt"] == "v3"
    assert len(pagina["complementares"][0]["itens"]) == 2


def test_url_ao_vivo_opcional() -> None:
    assert montar(rodada([item("a")]))["url_ao_vivo"] is None
    pagina = montar(rodada([item("a")]), url_ao_vivo="https://exemplo.onrender.com")
    assert pagina["url_ao_vivo"] == "https://exemplo.onrender.com"


def test_url_codigo_opcional() -> None:
    assert montar(rodada([item("a")]))["url_codigo"] is None
    pagina = montar(rodada([item("a")]), url_codigo="https://github.com/x/y")
    assert pagina["url_codigo"] == "https://github.com/x/y"
