"""Do manual em Markdown aos trechos que vão para o índice.

Cada arquivo de manual/ é cortado primeiro pelos títulos (## seção), para um trecho nunca
misturar duas regras; seções longas são cortadas de novo por tamanho, com sobreposição.
Cada trecho leva o arquivo, o título do documento e a seção: é isso que o agente cita como
fonte. O id do trecho é o hash do conteúdo, então reindexar o mesmo manual dá os mesmos ids.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from langchain_core.documents import Document
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter

TAMANHO = 900  # caracteres: uma seção típica do manual cabe inteira
SOBREPOSICAO = 120

_por_titulo = MarkdownHeaderTextSplitter(
    headers_to_split_on=[("#", "documento"), ("##", "secao")], strip_headers=True
)
_por_tamanho = RecursiveCharacterTextSplitter(
    chunk_size=TAMANHO, chunk_overlap=SOBREPOSICAO, separators=["\n\n", "\n", ". ", " "]
)


def id_do_trecho(doc: Document) -> str:
    base = f"{doc.metadata['arquivo']}|{doc.metadata.get('secao', '')}|{doc.page_content}"
    return hashlib.sha256(base.encode("utf-8")).hexdigest()[:32]


def cortar(texto: str, arquivo: str) -> list[Document]:
    trechos: list[Document] = []
    for secao in _por_titulo.split_text(texto):
        for pedaco in _por_tamanho.split_text(secao.page_content):
            meta = {
                "arquivo": arquivo,
                "documento": secao.metadata.get("documento", arquivo),
                "secao": secao.metadata.get("secao", ""),
            }
            # O título vai junto no texto indexado: "Bônus de equipe" ajuda a achar o trecho
            # mesmo quando a pergunta usa as palavras do título e não as do corpo.
            titulo = " > ".join(t for t in (meta["documento"], meta["secao"]) if t)
            trechos.append(Document(page_content=f"{titulo}\n{pedaco.strip()}", metadata=meta))
    for doc in trechos:
        doc.id = id_do_trecho(doc)
    return trechos


def carregar(pasta: Path) -> list[Document]:
    arquivos = sorted(pasta.glob("*.md"))
    if not arquivos:
        raise FileNotFoundError(f"nenhum .md em {pasta}")
    trechos: list[Document] = []
    for arquivo in arquivos:
        trechos += cortar(arquivo.read_text(encoding="utf-8"), arquivo.name)
    return trechos
