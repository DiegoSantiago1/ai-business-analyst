"""Corte do manual em trechos: por seção, com fonte e id estável."""

import os
from pathlib import Path

import pytest

from rag_manual.documentos import TAMANHO, carregar, cortar

# No container o manual é montado em /app/manual (docker-compose.yml); no repositório fica na raiz.
MANUAL = Path(os.environ.get("RAG_MANUAL") or Path(__file__).resolve().parents[2] / "manual")

TEXTO = """# Política X

## Regra A

Texto da regra A.

## Regra B

Texto da regra B, que não pode cair no mesmo trecho da A.
"""


def test_corta_por_secao_e_guarda_a_fonte() -> None:
    trechos = cortar(TEXTO, "x.md")
    assert [t.metadata["secao"] for t in trechos] == ["Regra A", "Regra B"]
    assert all(t.metadata["arquivo"] == "x.md" for t in trechos)
    assert all(t.metadata["documento"] == "Política X" for t in trechos)
    # O título vai no texto indexado; o corpo da outra seção não.
    assert trechos[0].page_content.startswith("Política X > Regra A\n")
    assert "regra B" not in trechos[0].page_content


def test_id_e_estavel_e_muda_com_o_conteudo() -> None:
    a = cortar(TEXTO, "x.md")
    b = cortar(TEXTO, "x.md")
    c = cortar(TEXTO.replace("regra A.", "regra A alterada."), "x.md")
    assert [t.id for t in a] == [t.id for t in b]
    assert a[0].id != c[0].id
    assert a[1].id == c[1].id  # só a seção alterada muda


def test_secao_longa_e_cortada_com_sobreposicao() -> None:
    longa = "# Doc\n\n## Longa\n\n" + " ".join(f"frase número {i}." for i in range(400))
    trechos = cortar(longa, "longa.md")
    assert len(trechos) > 1
    assert all(len(t.page_content) <= TAMANHO + 40 for t in trechos)  # + título
    assert all(t.metadata["secao"] == "Longa" for t in trechos)


def test_manual_de_verdade() -> None:
    trechos = carregar(MANUAL)
    arquivos = {t.metadata["arquivo"] for t in trechos}
    assert len(arquivos) == len(list(MANUAL.glob("*.md"))) >= 9
    assert len({t.id for t in trechos}) == len(trechos)  # sem ids repetidos
    assert all(t.metadata["secao"] or t.metadata["documento"] for t in trechos)


def test_pasta_sem_manual(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        carregar(tmp_path)
