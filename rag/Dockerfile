# syntax=docker/dockerfile:1
# Serviço de RAG do manual (D28): FastAPI + LangChain + pgvector + embeddings locais (ONNX).
#
#   docker compose build rag
# Com antivírus que inspeciona HTTPS (ex.: Norton), passe o certificado como segredo (ele
# não fica em nenhuma camada):
#   docker build --secret id=ca,src=C:/dados/hmda/certs/norton-ca.pem -t ai-business-analyst-rag:local rag

FROM python:3.13-slim-trixie

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src \
    FASTEMBED_CACHE_PATH=/opt/modelos

RUN useradd --create-home --uid 1000 rag && mkdir -p /app /opt/modelos && chown rag:rag /app /opt/modelos

COPY requirements.txt /tmp/requirements.txt
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then \
      cat /etc/ssl/certs/ca-certificates.crt /run/secrets/ca > /tmp/ca.pem; export PIP_CERT=/tmp/ca.pem; \
    fi; \
    pip install --no-cache-dir -r /tmp/requirements.txt && rm -f /tmp/ca.pem /tmp/requirements.txt

USER rag
WORKDIR /app
COPY --chown=rag:rag src/ /app/src/

# Baixa o modelo de embeddings UMA vez, aqui; em execução o serviço não usa a internet.
RUN --mount=type=secret,id=ca,required=false,uid=1000 \
    if [ -f /run/secrets/ca ]; then \
      cat /etc/ssl/certs/ca-certificates.crt /run/secrets/ca > /tmp/ca.pem; \
      export SSL_CERT_FILE=/tmp/ca.pem REQUESTS_CA_BUNDLE=/tmp/ca.pem; \
    fi; \
    python -c "from rag_manual.embeddings import EmbeddingsLocais; v = EmbeddingsLocais().embed_query('teste'); print('dimensões:', len(v))" \
 && rm -f /tmp/ca.pem
ENV HF_HUB_OFFLINE=1

COPY --chown=rag:rag tests/ /app/tests/

EXPOSE 8001
CMD ["uvicorn", "rag_manual.servico:app", "--host", "0.0.0.0", "--port", "8001"]
