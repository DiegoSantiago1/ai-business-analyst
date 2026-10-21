"""API do RAG com um buscador falso: contrato da resposta, limiar e validação de entrada."""

import pytest
from fastapi.testclient import TestClient
from langchain_core.documents import Document

from rag_manual import servico
from rag_manual.indice import DISTANCIA_MAXIMA, Achado


class BuscadorFalso:
    def __init__(self, achados: list[Achado]) -> None:
        self.achados = achados
        self.pedidos: list[tuple[str, int]] = []

    def buscar(self, pergunta: str, k: int) -> list[Achado]:
        self.pedidos.append((pergunta, k))
        return self.achados[:k]

    def contar(self) -> int:
        return 42


def _doc(secao: str) -> Document:
    return Document(
        page_content=f"Política > {secao}\ntexto",
        metadata={"arquivo": "02_politica_metas_bonus.md", "documento": "Política", "secao": secao},
    )


@pytest.fixture
def cliente():
    falso = BuscadorFalso(
        [
            Achado(_doc("Bônus de equipe"), 0.21),
            Achado(_doc("Plano de ação"), 0.40),
            Achado(_doc("Sem relação"), DISTANCIA_MAXIMA + 0.1),
            # Longe no sentido, mas com palavras da pergunta: fica (D29).
            Achado(_doc("Mesmas palavras"), DISTANCIA_MAXIMA + 0.1, nota_texto=0.05),
        ]
    )
    servico.app.dependency_overrides[servico.buscador_padrao] = lambda: falso
    yield TestClient(servico.app), falso
    servico.app.dependency_overrides.clear()


def test_busca_devolve_trechos_com_fonte_e_descarta_os_distantes(cliente) -> None:
    c, falso = cliente
    r = c.post("/buscar", json={"pergunta": "  qual o bônus?  ", "k": 4})
    assert r.status_code == 200
    corpo = r.json()
    secoes = [t["secao"] for t in corpo["trechos"]]
    assert secoes == ["Bônus de equipe", "Plano de ação", "Mesmas palavras"]
    assert corpo["trechos"][0]["arquivo"] == "02_politica_metas_bonus.md"
    assert corpo["descartados"] == 1
    assert corpo["distancia_maxima"] == DISTANCIA_MAXIMA
    assert falso.pedidos == [("qual o bônus?", 4)]  # pergunta aparada


def test_k_padrao_e_quatro(cliente) -> None:
    c, falso = cliente
    c.post("/buscar", json={"pergunta": "metas"})
    assert falso.pedidos[-1][1] == 4


@pytest.mark.parametrize(
    "corpo",
    [
        {"pergunta": "oi"},  # curta demais
        {"pergunta": "x" * 501},  # longa demais
        {"pergunta": "metas", "k": 0},
        {"pergunta": "metas", "k": 9},
        {},
    ],
)
def test_entrada_invalida_e_recusada(cliente, corpo) -> None:
    c, _ = cliente
    assert c.post("/buscar", json=corpo).status_code == 422


def test_saude(cliente) -> None:
    c, _ = cliente
    assert c.get("/saude").json() == {"ok": True, "trechos_indexados": 42}
