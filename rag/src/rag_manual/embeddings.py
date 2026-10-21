"""Embeddings locais e gratuitos (fastembed, modelo ONNX que roda na CPU, sem GPU e sem API).

O modelo é multilíngue (português incluído) e baixado UMA vez, na construção da imagem; em
execução o serviço não acessa a internet. A classe segue a interface Embeddings do LangChain,
então trocar por um provedor pago no futuro é trocar só esta classe.
"""

from __future__ import annotations

import os

from langchain_core.embeddings import Embeddings

MODELO = os.environ.get(
    "RAG_MODELO_EMBEDDINGS", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
)


class EmbeddingsLocais(Embeddings):
    def __init__(self, modelo: str = MODELO) -> None:
        from fastembed import TextEmbedding  # carregar o modelo é lento: só quando usado

        self.modelo = modelo
        self._motor = TextEmbedding(
            model_name=modelo, cache_dir=os.environ.get("FASTEMBED_CACHE_PATH") or None
        )

    # Pergunta e trecho são embutidos por métodos diferentes: modelos como o e5 esperam os
    # prefixos "query:" e "passage:", e o fastembed põe o certo em cada caso.
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [vetor.tolist() for vetor in self._motor.passage_embed(texts)]

    def embed_query(self, text: str) -> list[float]:
        return next(iter(self._motor.query_embed(text))).tolist()
