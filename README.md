# AI Business Analyst

> 🚧 Em construção. O README completo (inglês e português) e a página de resultados entram no fim do projeto.

Um analista de dados com IA para uma rede de concessionárias (dados 100% fictícios): o gerente pergunta em português, a IA escolhe as ferramentas, consulta o banco **só para leitura** e responde com números conferíveis, mostrando o SQL executado.

Plano e decisões: [docs/PLAN.md](docs/PLAN.md) e [docs/DECISOES.md](docs/DECISOES.md).

## Como rodar (estado atual: fundação)

Pré-requisitos: Python 3.14, Node 24 e um PostgreSQL 16 em Docker.

```powershell
copy .env.example .env          # e defina senhas próprias
py -3.14 -m venv .venv
.venv\Scripts\pip install -r requirements-dev.txt
.venv\Scripts\python -m analista.bootstrap   # usuários e bancos (via docker exec)
.venv\Scripts\alembic upgrade head            # schemas e permissões
.venv\Scripts\pytest                          # testes Python (migra o banco de testes)

cd api
npm ci
npm run verificar                             # lint, tipos e testes da API
```
