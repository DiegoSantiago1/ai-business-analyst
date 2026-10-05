# Publicar a versão ao vivo

A versão ao vivo é um container (API Node + interface React) no **Render** e o banco no **Neon**, os dois no plano gratuito. Tudo já está pronto e testado; falta só o que exige a sua conta.

**Por que esses dois** (pesquisa de 05/10/2026, conferir na hora):
- Neon: PostgreSQL gratuito sem cartão, aceita `CREATE ROLE` por SQL (o usuário somente leitura da IA) e não expira. O PostgreSQL gratuito do Render apaga o banco depois de 30 dias.
- Render: roda o `Dockerfile` direto, 750 h/mês grátis, dorme depois de 15 min sem uso (a 1ª pergunta depois disso espera ~1 min; a interface avisa "Acordando o servidor…"). Algumas fontes dizem que o Render pode pedir um cartão só para verificação; se pedir e você não quiser, a alternativa está no fim deste arquivo.

**O que já foi testado** (máquina local, 05/10/2026):
- o bootstrap num PostgreSQL em que o administrador **não** é superusuário (como no Neon), e os 195 testes Python + 173 da API passando nesse banco;
- a imagem Docker rodando como usuário sem privilégio, com TLS até o banco, servindo a interface e respondendo uma pergunta real.

## 1. Banco no Neon (~10 min)

1. Crie a conta em https://neon.com (login com o GitHub) e um projeto: nome `ai-business-analyst`, PostgreSQL 16, região **AWS US East 2 (Ohio)** (o Render também roda em Ohio: banco e chat perto um do outro).
2. No painel, em **Connect**, copie a *connection string* do usuário dono (`neondb_owner`), com `?sslmode=require`. Esse é o administrador.
3. No seu computador, na pasta do projeto, crie um arquivo `.env.nuvem` (já ignorado pelo git) com:

   ```
   ANALISTA_ADMIN_URL=postgresql://neondb_owner:SENHA@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require
   ANALISTA_DB_HOST=ep-xxxx.us-east-1.aws.neon.tech
   ANALISTA_DB_PORT=5432
   ANALISTA_DB_NAME=vendas_ia
   ANALISTA_DB_SSL=true
   ANALISTA_DB_USER=analista_dono
   ANALISTA_DB_PASSWORD=(gere uma senha nova)
   ANALISTA_IA_USER=analista_ia
   ANALISTA_IA_PASSWORD=(gere outra senha nova)
   ```

   Senhas novas, diferentes das locais (ex.: `python -c "import secrets; print(secrets.token_urlsafe(24))"`).
4. Com o Docker Desktop aberto, rode (PowerShell, na pasta do projeto):

   ```powershell
   Get-Content .env.nuvem | ForEach-Object { if ($_ -match '^([A-Z_]+)=(.*)$') { Set-Item "env:$($Matches[1])" $Matches[2] } }
   .venv\Scripts\python -m analista.bootstrap --remoto   # usuários, banco e permissões
   .venv\Scripts\alembic upgrade head                    # schemas, tabelas e views
   .venv\Scripts\python -m analista.carga                # dados fictícios (impressão digital aadf3511...)
   ```

   As variáveis do `.env.nuvem` valem só nesse terminal (feche-o depois). O banco de testes não existe na nuvem, e está certo assim.

## 2. API no Render (~10 min)

1. Crie a conta em https://render.com (login com o GitHub) e autorize o acesso ao repositório `ai-business-analyst` (funciona com o repositório privado).
2. **New → Blueprint**, escolha o repositório: o Render lê o `render.yaml` e pede os segredos:
   - `GROQ_API_KEY`: a mesma chave do seu `.env` (ou crie uma só para a nuvem em console.groq.com);
   - `ANALISTA_DB_HOST`: o host do Neon (`ep-xxxx...neon.tech`);
   - `ANALISTA_IA_PASSWORD`: a senha do `analista_ia` do `.env.nuvem`.
3. Espere o deploy (o primeiro build leva alguns minutos). Abra `https://ai-business-analyst.onrender.com/api/saude` (o nome final aparece no painel): tem de mostrar `"banco":"ok"`.
4. Faça uma pergunta pela interface no endereço do serviço.

O registro das perguntas fica no disco do container, que é apagado a cada reinício no plano gratuito: o orçamento diário próprio zera junto. Não é problema, porque o limite de verdade é o do provedor (a API trata o 429 e passa para o modelo reserva).

## 3. Botão "Experimente ao vivo" na página de resultados

Com o endereço do Render em mãos (troque pelo seu):

```powershell
.venv\Scripts\python -m analista.exportar_site avaliacao\resultados\2026-10-05_0251_gpt-oss-120b.json `
  --complementar avaliacao\resultados\2026-10-05_0314_gpt-oss-20b.json `
  --complementar avaliacao\resultados\2026-10-05_0318_gpt-oss-20b.json `
  --url-ao-vivo https://ai-business-analyst.onrender.com
Copy-Item site\* ..\Portifolio\projetos\ai-business-analyst\ -Recurse -Force
```

Depois, commit e push no repositório do portfólio. Sem `--url-ao-vivo`, o botão fica escondido (a página nunca mostra um link quebrado).

## Alternativa sem cartão: Hugging Face Spaces

Se o Render pedir cartão: crie um Space do tipo **Docker** em https://huggingface.co/new-space, envie para ele o `Dockerfile`, `api/` e `web/` deste repositório, e um `README.md` com o cabeçalho abaixo (o Spaces usa a porta 7860). Os segredos (`GROQ_API_KEY`, `ANALISTA_DB_HOST`, `ANALISTA_IA_PASSWORD`) e as variáveis do `render.yaml` vão em **Settings → Variables and secrets**.

```yaml
---
title: AI Business Analyst
sdk: docker
app_port: 7860
---
```

E a variável `PORT=7860`.

## Build local (máquina com antivírus que inspeciona HTTPS)

O Norton desta máquina intercepta o HTTPS com um certificado próprio, e o `npm ci` dentro do container falha. Para testar a imagem localmente, exporte o certificado raiz do antivírus (`Cert:\LocalMachine\Root`, "Norton Web/Mail Shield Root") para um `.pem` e passe como segredo do build, que não fica na imagem:

```powershell
docker build --secret id=ca,src=C:\caminho\norton-ca.pem -t ai-business-analyst:local .
```

Na nuvem nada disso é preciso.
