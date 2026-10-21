"""API do RAG (FastAPI): a API Node do agente chama POST /buscar quando a ferramenta
consultar_manual é usada (D28).

    uvicorn rag_manual.servico:app --host 0.0.0.0 --port 8001
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from fastapi import Depends, FastAPI
from pydantic import BaseModel, Field

from rag_manual.indice import DISTANCIA_MAXIMA, Buscador, BuscadorPgVector, abrir

app = FastAPI(
    title="RAG do manual comercial",
    description="Busca semântica nas políticas e definições da rede (dados fictícios).",
    version="1.0.0",
)


class Pedido(BaseModel):
    pergunta: str = Field(min_length=3, max_length=500)
    k: int = Field(default=4, ge=1, le=8)


class Trecho(BaseModel):
    arquivo: str
    documento: str
    secao: str
    texto: str
    distancia: float


class Resultado(BaseModel):
    trechos: list[Trecho]
    descartados: int = Field(description="Trechos longe no sentido e sem palavras da pergunta")
    distancia_maxima: float


@lru_cache(maxsize=1)
def buscador_padrao() -> Buscador:
    from rag_manual.embeddings import EmbeddingsLocais

    return BuscadorPgVector(abrir(EmbeddingsLocais()))


@app.get("/saude")
def saude(buscador: Annotated[Buscador, Depends(buscador_padrao)]) -> dict[str, object]:
    return {"ok": True, "trechos_indexados": buscador.contar()}


@app.post("/buscar")
def buscar(pedido: Pedido, buscador: Annotated[Buscador, Depends(buscador_padrao)]) -> Resultado:
    achados = buscador.buscar(pedido.pergunta.strip(), pedido.k)
    # Fica o que está perto no sentido OU tem palavras da pergunta (D29).
    perto = [a for a in achados if a.distancia <= DISTANCIA_MAXIMA or a.nota_texto > 0]
    return Resultado(
        trechos=[
            Trecho(
                arquivo=a.documento.metadata.get("arquivo", ""),
                documento=a.documento.metadata.get("documento", ""),
                secao=a.documento.metadata.get("secao", ""),
                texto=a.documento.page_content,
                distancia=round(a.distancia, 4),
            )
            for a in perto
        ],
        descartados=len(achados) - len(perto),
        distancia_maxima=DISTANCIA_MAXIMA,
    )
