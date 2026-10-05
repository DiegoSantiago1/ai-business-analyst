# syntax=docker/dockerfile:1
# Imagem da versão ao vivo: a API Node serve a interface React compilada (mesma origem,
# sem CORS). O banco fica fora (PostgreSQL gerenciado). Ver docs/DEPLOY.md.

# ------------------------------------------------------------------ 1. interface (build)
FROM node:24-alpine AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
# CA extra opcional, só durante o npm ci (segredo do BuildKit: não fica na imagem). Serve
# para máquinas cujo antivírus inspeciona HTTPS (ex.: Norton): build local com
#   docker build --secret id=ca,src=caminho/ca.pem .
# Na nuvem (Render) o segredo não existe e o Node só avisa que não achou o arquivo.
RUN --mount=type=secret,id=ca,required=false NODE_EXTRA_CA_CERTS=/run/secrets/ca npm ci
COPY web/ ./
RUN npm run build

# ------------------------------------------------------------------ 2. API (execução)
FROM node:24-alpine
# HOST 0.0.0.0: a plataforma encaminha o tráfego para dentro do container.
# TRUST_PROXY: o IP do visitante vem no X-Forwarded-For (limite por IP).
ENV NODE_ENV=production HOST=0.0.0.0 TRUST_PROXY=true
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
# Só dependências de execução (express, pg, zod): o Node 24 roda o TypeScript direto.
RUN --mount=type=secret,id=ca,required=false NODE_EXTRA_CA_CERTS=/run/secrets/ca npm ci --omit=dev && npm cache clean --force
COPY api/src ./src
COPY --from=web /app/web/dist /app/web/dist
# Registro das perguntas (JSONL): a pasta precisa ser gravável pelo usuário sem privilégio.
RUN mkdir -p /app/api/registros && chown node:node /app/api/registros
USER node
EXPOSE 3335
CMD ["node", "src/index.ts"]
