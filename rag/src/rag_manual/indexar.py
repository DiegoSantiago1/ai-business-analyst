"""Indexa o manual no pgvector.

python -m rag_manual.indexar            # lê /app/manual (ou RAG_MANUAL) e reindexa tudo
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

from rag_manual.documentos import carregar
from rag_manual.embeddings import EmbeddingsLocais
from rag_manual.indice import indexar


def main() -> int:
    pasta = Path(os.environ.get("RAG_MANUAL", "/app/manual"))
    inicio = time.perf_counter()
    trechos = carregar(pasta)
    total = indexar(trechos, EmbeddingsLocais())
    arquivos = len({t.metadata["arquivo"] for t in trechos})
    segundos = time.perf_counter() - inicio
    print(f"{total} trechos de {arquivos} documentos indexados em {segundos:.1f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
