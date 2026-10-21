"""Índice vetorial do manual no PostgreSQL com pgvector, pelo PGVector do LangChain.

- indexar(): apaga a coleção e grava de novo todos os trechos (o manual é pequeno; reindexar
  inteiro é mais simples e seguro que atualizar trecho por trecho). Os ids vêm do hash do
  conteúdo, então o mesmo manual gera sempre os mesmos ids.
- Buscador.buscar(): busca HÍBRIDA (D29). Dois rankings sobre os mesmos trechos, numa
  consulta SQL só: o vetorial (distância de cosseno no pgvector: 0 = mesmo sentido) e o textual
  (full-text do PostgreSQL em português, que compara o radical das palavras: "reduzida" acha
  "reduz"). Os dois são fundidos por Reciprocal Rank Fusion (soma de 1/(60 + posição)).
  Medido: a busca só vetorial errava perguntas cuja palavra-chave estava no texto certo.
- O filtro do serviço descarta o trecho só se ele estiver longe no sentido (acima do limiar)
  E não tiver nenhuma palavra da pergunta. Quem pergunta ao manual é o modelo, com as frases
  dele, e o limiar foi calibrado com as minhas; perder uma regra que existe é pior que mostrar
  um trecho a mais, porque quem decide que o manual não cobre o assunto é o modelo (regra 10).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Protocol

import psycopg
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_postgres import PGVector

COLECAO = "manual_comercial"
# Calibrado com avaliacao_busca.py em 21/10/2026 (D29): a pergunta legítima mais distante teve
# o melhor trecho a 0,674; as de fora do manual ficaram entre 0,531 e 0,949. As faixas se
# sobrepõem, então nenhum limiar separa tudo: 0,70 mantém as 20 legítimas e descarta 4 das 6 de
# fora. As que passam (ex.: "previsão do tempo em Recife") são barradas pela regra 10 do prompt.
DISTANCIA_MAXIMA = float(os.environ.get("RAG_DISTANCIA_MAXIMA", "0.70"))


def url_banco() -> str:
    url = os.environ.get("RAG_DB_URL", "").strip()
    if not url:
        raise RuntimeError(
            "RAG_DB_URL não definida (postgresql+psycopg://usuario:senha@host/banco)"
        )
    return url


def abrir(embeddings: Embeddings, url: str | None = None, recriar: bool = False) -> PGVector:
    return PGVector(
        embeddings=embeddings,
        collection_name=COLECAO,
        connection=url or url_banco(),
        use_jsonb=True,
        pre_delete_collection=recriar,
    )


def indexar(trechos: list[Document], embeddings: Embeddings, url: str | None = None) -> int:
    loja = abrir(embeddings, url, recriar=True)
    loja.add_documents(trechos, ids=[t.id for t in trechos])
    return len(trechos)


@dataclass(frozen=True)
class Achado:
    documento: Document
    distancia: float
    nota_texto: float = 0.0  # > 0 = casou na busca textual (palavras da pergunta no trecho)


class Buscador(Protocol):
    def buscar(self, pergunta: str, k: int) -> list[Achado]: ...

    def contar(self) -> int: ...


RRF_K = 60  # constante usual do Reciprocal Rank Fusion (Cormack et al., 2009)
CANDIDATOS = 10  # quantos de cada ranking entram na fusão

# Com dezenas de trechos, calcular as duas notas para todos é instantâneo. Com milhares, cada
# lado ganharia o próprio índice (HNSW no vetor, GIN no tsvector) e um LIMIT.
SQL_HIBRIDA = """
WITH q AS (
    SELECT %(vetor)s::vector AS v,
           replace(plainto_tsquery('portuguese', %(texto)s)::text, '&', '|')::tsquery AS t
)
SELECT e.document, e.cmetadata,
       e.embedding <=> q.v AS distancia,
       ts_rank_cd(to_tsvector('portuguese', e.document), q.t) AS nota_texto
FROM langchain_pg_embedding e
JOIN langchain_pg_collection c ON c.uuid = e.collection_id
CROSS JOIN q
WHERE c.name = %(colecao)s
"""


def fundir(linhas: list[tuple[str, dict[str, object], float, float]], k: int) -> list[Achado]:
    """Reciprocal Rank Fusion dos rankings vetorial e textual; devolve os k melhores."""
    vetorial = sorted(range(len(linhas)), key=lambda i: linhas[i][2])[:CANDIDATOS]
    com_texto = [i for i in range(len(linhas)) if linhas[i][3] > 0]
    textual = sorted(com_texto, key=lambda i: -linhas[i][3])[:CANDIDATOS]
    nota: dict[int, float] = {}
    for ranking in (vetorial, textual):
        for posicao, i in enumerate(ranking, start=1):
            nota[i] = nota.get(i, 0.0) + 1 / (RRF_K + posicao)
    melhores = sorted(nota, key=lambda i: (-nota[i], linhas[i][2]))[:k]
    achados = []
    for i in melhores:
        texto, meta, distancia, nota_texto = linhas[i]
        doc = Document(page_content=texto, metadata=dict(meta))
        achados.append(Achado(doc, float(distancia), float(nota_texto)))
    return achados


class BuscadorPgVector:
    def __init__(self, loja: PGVector, hibrida: bool = True, url: str | None = None) -> None:
        self.loja = loja
        self.hibrida = hibrida
        self._url = (url or url_banco()).replace("postgresql+psycopg://", "postgresql://")

    def buscar(self, pergunta: str, k: int) -> list[Achado]:
        if not self.hibrida:
            return [
                Achado(doc, float(dist))
                for doc, dist in self.loja.similarity_search_with_score(pergunta, k=k)
            ]
        vetor = self.loja.embeddings.embed_query(pergunta)
        with psycopg.connect(self._url) as conexao:
            linhas = conexao.execute(
                SQL_HIBRIDA,
                {"vetor": str(vetor), "texto": pergunta, "colecao": COLECAO},
            ).fetchall()
        return fundir([(d, m, float(dist), float(n)) for d, m, dist, n in linhas], k)

    def contar(self) -> int:
        with psycopg.connect(self._url) as conexao:
            linha = conexao.execute(
                "SELECT count(*) FROM langchain_pg_embedding e JOIN langchain_pg_collection c"
                " ON c.uuid = e.collection_id WHERE c.name = %s",
                (COLECAO,),
            ).fetchone()
        return int(linha[0]) if linha else 0
