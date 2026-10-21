# Decisões — ai-business-analyst

Cada decisão com o motivo e a alternativa descartada. "Escolha do Diego" = respondida por ele no grill de 04/10/2026.

**D1. Nome `ai-business-analyst`, código em português, README em inglês e português.** Escolha do Diego. O código em português segue o Projeto 4 e combina com o domínio: vendas no Brasil e perguntas em português.

**D2. Dados: banco próprio com o modelo do Projeto 1, ampliado para 24 meses.** Escolha do Diego. O banco do Projeto 1 tem 191 vendas em 2 meses **(medido em 04/10/2026)**, pouco para uma IA analisar. Um banco próprio (`vendas_ia`) deixa o Projeto 1 intocado e permite plantar padrões conhecidos. Descartado: usar o varejo do Projeto 3 (é dado real, mas em inglês e sem ligação com o trabalho do Diego) e usar os dois bancos (dobra os testes e a superfície de segurança).

**D3. Data de referência fixa (30/09/2026).** "Este mês" e "hoje" são relativos a ela, não ao relógio. Sem isso, a mesma pergunta mudaria de resposta a cada dia e a avaliação não seria reproduzível.

**D4. LLM: Groq gratuito, modelo configurável.** Escolha do Diego. Não pede cartão (o cartão está sem limite), a API é no formato da OpenAI e tem tool calling em todos os modelos. Uso só modelos "production". A chamada é feita com `fetch`, sem SDK: uma dependência a menos e o formato da requisição fica visível no código. Descartados: Gemini gratuito (alternativa equivalente) e Claude (exige cartão).

**D5. Métricas oficiais + SQL travado como reserva.** Escolha do Diego. As ferramentas de métrica dão o número certo por construção. O SQL livre cobre o que não foi previsto. Descartados:
- só ferramentas fixas: vira chatbot de menu;
- só text-to-SQL: erra métrica de negócio, e a segurança fica toda no banco.

**D6. Defesa em camadas, com o banco como garantia final.** As checagens na aplicação podem ser contornadas por um SQL criativo, as permissões do banco não. Cada camada tem teste hostil próprio.

**D7. Demo: página de resultados com conversas gravadas primeiro; versão ao vivo opcional no fim.** Escolha do Diego. A página não tem custo nem risco de abuso e segue a regra de todo projeto ter página publicada. A versão ao vivo exige hospedagem e limite de uso e só entra se sobrar tempo.

**D8. Avaliação em Python com resposta certa conhecida.** "A IA responde bem" só vale com número medido. Python porque é o padrão para análise do resultado (pandas) e porque o gerador e as migrations já são Python.

**D9. Divisão de linguagens.** Python cuida do banco (migrations Alembic com SQL à mão, gerador, avaliação), seguindo o padrão dos Projetos 2 a 4. Node/TS faz a API e a orquestração da IA, e React faz a interface. Cada linguagem onde ela é o padrão do mercado.

**D10. Fora do escopo: RAG e vários bancos.** O RAG pode entrar depois, se servir ao problema (ex.: glossário de métricas). Por enquanto, o catálogo de métricas já cumpre esse papel. Limite de tecnologia nova: tool calling com LLM, avaliação de IA e React a fundo.

**D11. Teto de 90 h.** Escolha do Diego. Primeiro corte: gráfico no chat e tamanho da avaliação.

**D12. Ficar no Groq gratuito, com aviso de cota esgotada.** Escolha do Diego (04/10/2026). A conta estimada (~5–7 mil tokens por pergunta) cabe no limite diário, porque os testes não chamam a API e a avaliação tem orçamento. Quando a cota acaba, a interface avisa em vez de quebrar. O plano pago fica para depois, só se for preciso.

**D13. Travas no próprio usuário da IA, com os privilégios como garantia.** O `analista_ia` já nasce com `default_transaction_read_only = on`, `statement_timeout = 5s`, `idle_in_transaction_session_timeout = 10s`, `search_path = ia` e `CONNECTION LIMIT 5` (`db/bootstrap.sql`). Esses padrões valem mesmo se a API esquecer de configurar a sessão, mas o próprio usuário consegue mudá-los com `SET`. Por isso a garantia de verdade é ele só ter `USAGE` no schema `ia` (e, a partir da fase 3, `SELECT` view por view), sem `TEMP` nem `CREATE` em lugar nenhum. Há um teste que desliga o somente leitura de propósito e confere que os privilégios ainda barram cada escrita (`tests/test_permissoes.py`). Também foi conferido que o teste falha se um `GRANT CREATE` for dado por engano.

**D14. A API roda TypeScript direto no Node 24, sem `tsx` e sem build.** O Node 24 apaga os tipos ao carregar o arquivo ("type stripping"), medido em 04/10/2026, sem aviso, inclusive no `node --test`. O `tsc` fica só como verificador de tipos (`noEmit`), com `erasableSyntaxOnly` (nada de `enum` nem `namespace`) e imports com extensão `.ts`. Descartados: `tsx` (usado nos Projetos 1 e 2; uma dependência a mais) e compilar para `dist/` (um passo a mais no CI e no deploy).

**D15. A API só conhece a senha do usuário da IA.** O `api/src/config.ts` lê `ANALISTA_IA_USER`/`ANALISTA_IA_PASSWORD` e recusa subir se o usuário da IA for o dono ou o grupo. A senha do dono nunca é lida pela API: mesmo que a IA seja enganada, a API não tem credencial com mais privilégio.

**D16. Repositório privado desde a fase 1.** Escolha do Diego (04/10/2026). O CI testa cada commit desde o começo e o código tem cópia fora do OneDrive. Fica público só no fim, com pedido explícito dele.

**D17. Catálogo de métricas no prompt, e não numa ferramenta `listar_metricas`.** O plano previa 4 ferramentas com `listar_metricas`. Cada volta do loop reenvia tudo (~1.600 tokens de entrada, medido), e uma ferramenta só para listar o catálogo custaria uma volta inteira por pergunta. O catálogo e os valores válidos (lojas, linhas...) vão no prompt de sistema; a 4ª ferramenta virou `responder`, a resposta final estruturada.

**D18. Resposta final como ferramenta (`responder`) + conferência dos números.** Em vez de `response_format`, o modelo termina chamando `responder`, validado com zod. A tabela e o gráfico saem do resultado do banco, nunca de números reescritos pela IA. Cada número citado é procurado nos resultados: achou (tolerância de arredondamento) = "conferido"; não achou = "calculado pela IA", e a tela avisa. Medido: o modelo copiou 96,2 quando o banco dizia 96,3, e a conferência marcou.

**D19. Tolerância a falhas do gpt-oss no Groq (medidas em 04 e 05/10/2026).** O modelo às vezes (a) cola o marcador `<|channel|>commentary` no nome da ferramenta, (b) chama a resposta final de `json` ou `response`, (c) escreve texto em vez de chamar ferramenta (`output_parse_failed`), (d) manda o gráfico como texto. Com `temperature: 0`, repetir o pedido dá o mesmo erro. O cliente recupera a chamada do `failed_generation` (nome limpo ou deduzido pelos campos, só se for uma ferramenta do pedido) e os argumentos passam de novo pela validação; texto vira resposta de texto e a volta seguinte obriga `responder`. Cada caso tem teste.

**D20. Ritmo pelo limite por minuto.** O gargalo do plano gratuito é 8 mil tokens/min, não pedidos. O cliente lê `x-ratelimit-remaining-tokens` e espera só o déficit (limite/60 por segundo), e não até o balde encher (o `reset-tokens` levava a esperas de ~50 s à toa). A API atende uma pergunta por vez (fila) e mede à parte o tempo esperando a cota (`esperaCotaMs`), para a latência de processamento não ser confundida com a espera.

**D21. Ajustes no avaliador depois de ler as respostas, sempre registrados.** Uma conferência automática por números e palavras-chave erra nos dois sentidos. Ajustes feitos depois de ler respostas da rodada oficial: (1) hífen Unicode (U+2011) normalizado (o modelo escreve "HR‑V"); (2) c03 passou a aceitar "aumento"/"cresceu" além de "sim"/"mais" (a resposta tinha os dois números certos). Nenhum ajuste muda o número esperado: só a forma de reconhecer. A página mostra todas as respostas e vereditos.

**D22. Participação com 2 agrupamentos é DENTRO do 1º, e a ferramenta avisa a armadilha.** Na rodada oficial, para "qual loja tem a maior proporção de SUVs", a IA pediu a participação com filtro de SUV, agrupada por loja: isso é a fatia de cada loja no total de SUVs (Centro), não o % de SUV dentro de cada loja (Serra). Só melhorar a descrição no prompt não bastou: o 20b errou de novo com a v4. Duas mudanças: (1) com 2 agrupamentos, a janela é `PARTITION BY` o 1º (`[ano, forma_pagamento]` = % de cada forma dentro de cada ano, que é o que se quer em "consórcio em 2025 x 2026"); (2) quando o pedido cai na armadilha, o resultado volta com um campo `atencao` explicando como pedir. Medido: o modelo leu o aviso, refez a consulta e acertou. Lição: proteção na ferramenta (que o modelo lê no resultado) funciona melhor que regra no prompt.

**D23. Rodada oficial parcial + rodadas complementares, rotuladas.** A cota diária do 120b acabou na pergunta 33 (o aviso de cota esgotada funcionou de verdade). Em vez de esperar 20 horas ou misturar modelos sem dizer, a página mostra a rodada oficial (120b, prompt v3, 28/32) como parcial e, à parte, as complementares no 20b com o prompt v4 (as 4 que faltaram + as que falharam: 7/8; a c06 corrigida depois pelo aviso da ferramenta: 1/1). Cada conversa mostra o modelo e a versão do prompt. Para completar a oficial depois da meia-noite UTC: `python -m analista.avaliacao --continuar avaliacao/resultados/2026-10-05_0251_gpt-oss-120b.json` (com a API no 120b) e exportar de novo.

**D24. Página de resultados publicada no repositório do portfólio.** O repositório do projeto é privado (D16) e o GitHub Pages de repositório privado exige plano pago. A página (HTML/CSS/JS puros, dados em `site/dados/pagina.json`, gerados por `python -m analista.exportar_site`) é copiada para `Portifolio/projetos/ai-business-analyst/`, como as demos dos Projetos 1 e 2. A fonte continua em `site/` neste repositório.

**D25. Versão ao vivo: Render (API) + Neon (banco), plano gratuito, sem código de acesso.** Pedido do Diego (05/10/2026): demonstração ao vivo aberta, no plano gratuito. Neon porque não pede cartão, aceita `CREATE ROLE` por SQL (o usuário somente leitura da IA) e não expira; o PostgreSQL gratuito do Render apaga o banco em 30 dias. O bootstrap ganhou o modo `--remoto` para um administrador que não é superusuário, ensaiado num container com esse papel: os 195 testes Python e os 173 da API passaram nele. A imagem (`Dockerfile`) roda como usuário sem privilégio e é construída no CI a cada push. Proteções: limite de 4 perguntas por minuto por IP, fila, orçamento por modelo, **modelo reserva** (cota do 120b acabou → 20b, dobrando as perguntas por dia) e o aviso de cota. Publicar exige uma conta do Diego nos dois serviços: passo a passo em `docs/DEPLOY.md`.

**D26. A cota diária do Groq não zera à meia-noite UTC.** A rodada oficial recebeu 429 de limite diário às ~03:25 UTC; às 10:50 UTC o mesmo modelo respondeu de novo. Parece uma janela móvel de 24 h (a documentação não diz). O orçamento próprio da API continua zerando à meia-noite UTC: é uma estimativa conservadora; o limite de verdade é o 429 do provedor, que a API trata.

**D27. Resposta detalhada: padrão na interface ao vivo, depois de medida.** Pedido do Diego: respostas mais elaboradas, mas medidas antes de adotar. Medições no `gpt-oss-20b` (05/10/2026; a cota do 120b estava esgotada pela janela de 24 h, D26):
- v5 detalhada, 8 perguntas difíceis (c01, c04, c06, t01, r06, f02, i01, j01): **3 de 8**. O modelo devolvia só a linha em negrito, ignorava o aviso da c06 e errava a conta da c04. Nas mesmas 8, o modo curto tinha acertado 6. **Não adotada.**
- v5.1 (o campo leva tudo; a 1ª linha responde a pergunta inteira; um exemplo completo): **8 de 8** nas mesmas perguntas, 100% dos números conferidos.
- Validação em perguntas que NÃO foram usadas no ajuste (n03, n05, r03, r05, c02, c03): **6 de 6** antes de a cota acabar. Total: 14 de 14, ~5,9 mil tokens por pergunta (~30% a mais que o curto).
- No 120b, só 2 perguntas couberam na cota (2 de 2).

Adotada como padrão da interface (interruptor "Resposta detalhada", ligado; a escolha fica no navegador). A API continua com o curto por padrão (`detalhada: false`), que é o que a avaliação oficial mediu. Ressalvas vistas nas respostas: tópicos às vezes repetem a 1ª linha, e na c06 um tópico ficou confuso. O prompt foi ajustado olhando o próprio conjunto de avaliação (risco de sobreajuste): por isso a validação em perguntas novas, e por isso uma rodada completa no 120b com `--detalhada` é o próximo passo quando a cota permitir.

**D28. RAG do manual comercial: serviço próprio (FastAPI + LangChain + pgvector), embeddings locais.** Pedido do Diego (21/10/2026), cobrindo a lacuna mais pedida nas vagas que ele analisou (RAG, embeddings, banco vetorial, LangChain, FastAPI). Era a extensão prevista na D10, com função real: um **manual comercial** fictício (`manual/`, 9 documentos: metas e bônus, descontos, comissão, formas de pagamento, calendário, lojas, glossário das métricas) responde o que o banco não tem, e o agente junta regra e número ("qual loja ganhou bônus em setembro?"). O manual foi escrito coerente com os dados (as faixas de desconto são as do gerador; a campanha de consórcio de jan/2026 explica o P4; o calendário explica o P1). Arquitetura:
- **Serviço separado** (`rag/`, Python 3.13 em container): o onnxruntime das embeddings não precisa existir no Python 3.14 do resto. A API Node ganha a ferramenta `consultar_manual` (POST `/buscar`), oferecida ao modelo só quando `RAG_URL` está definido; sem ela, o prompt é idêntico ao da v5.1 (avaliações antigas continuam comparáveis).
- **pgvector num PostgreSQL próprio** (`pgvector/pgvector:pg16`, porta 5433): o container compartilhado é `postgres:16-alpine`, sem a extensão, e guarda os bancos dos Projetos 1 a 3.
- **Embeddings gratuitos e locais** (fastembed, `paraphrase-multilingual-MiniLM-L12-v2`, 384 dimensões), baixados na construção da imagem; em execução, nada sai para a internet.
- **LangChain** onde ele ajuda: corte por título + tamanho (`MarkdownHeaderTextSplitter` + `RecursiveCharacterTextSplitter`), interface `Embeddings` e o `PGVector`. 48 trechos indexados em ~16 s; id do trecho = hash do conteúdo.
- Números citados de um trecho do manual contam como "conferidos" (vieram de uma ferramenta); trecho do manual não vira tabela nem gráfico; a resposta traz as `fontes` ("documento > seção").
- **Fora da nuvem gratuita:** o Render gratuito tem 512 MB e um serviço; a demonstração ao vivo segue sem RAG. Roda local com `docker compose up -d`.

**D29. Busca híbrida (vetorial + textual, RRF) e um filtro que prefere sobrar a faltar.** Medido com `rag_manual.avaliacao_busca` (20 perguntas com seção esperada + 6 que o manual não responde), 21/10/2026:

| Busca | acerto@1 | acerto@3 | MRR |
|---|---|---|---|
| vetorial, MiniLM multilíngue (384 dim) | 70% | 95% | 0,800 |
| vetorial, mpnet multilíngue (768 dim, 1 GB) | 65% | 85% | 0,754 |
| **híbrida, MiniLM + full-text português (RRF)** | **70%** | **95%** | **0,825** |

- O modelo maior foi **pior** e indexou 10× mais devagar (163 s contra 16 s). O `multilingual-e5-large` nem carregou: o onnxruntime recusou os pesos guardados fora do arquivo do modelo ("External data path escapes model directory") por causa dos atalhos do cache do Hugging Face.
- A híbrida soma ao ranking vetorial o full-text do PostgreSQL (`to_tsvector('portuguese')`, que compara radicais: "reduzida" acha "reduz") e funde os dois por Reciprocal Rank Fusion (1/(60 + posição)), numa consulta SQL só. Ganho pequeno, mas medido (MRR 0,800 → 0,825); "A meta pode ser reduzida?" continua sem trazer a seção "Revisão de meta" (limitação conhecida; o agente acertou a resposta por outro trecho).
- **Limiar:** a pergunta legítima mais distante teve o melhor trecho a 0,674; as de fora ficaram entre 0,531 e 0,949. As faixas se sobrepõem, então nenhum limiar separa tudo. Escolhido 0,70, e o trecho só é descartado se estiver acima dele **e** não tiver nenhuma palavra da pergunta: quem pergunta ao manual é o modelo, com as frases dele, e perder uma regra que existe é pior que mostrar um trecho a mais (a regra 10 do prompt manda dizer quando o manual não cobre o assunto).

**D30. Avaliação do RAG: checagens determinísticas + LLM-as-a-Judge validado antes de usar.** `analista.avaliacao_manual`, 12 perguntas (`avaliacao/perguntas_manual.toml`: 7 só manual, 3 manual + banco, 2 que o manual não responde), com gabarito escrito a partir do manual.
- **Juiz de outra família** (`qwen/qwen3.8-27b` no Groq) para não avaliar o próprio gpt-oss: temperatura 0, JSON validado (`fiel`, `correta` 0/1/2, justificativa).
- **Controle do juiz antes da rodada:** ele julga os 7 gabaritos (têm de passar) e 4 respostas erradas de propósito (número trocado, limite inventado, regra invertida; têm de falhar). Medido: **11 de 11**. Se falhar, a rodada avisa que as notas não são confiáveis.
- Achado de infraestrutura: o Cloudflare na frente do Groq recusa o User-Agent padrão do `urllib` (HTTP 403, "error code: 1010"); o avaliador manda um User-Agent próprio.
- **1ª rodada (prompt v6, parcial, 7 perguntas):** a m07 ("comissão no HR-V") foi respondida sem chamar o manual ("não há informação no banco"): a regra 4 (dado inexistente) venceu a regra 10. A m01 chamou o manual e voltou sem trechos (motivo não identificado; a avaliação passou a gravar a busca exata, quantos trechos voltaram e o erro de cada consulta). Correção: **v6.1**, a regra 4 manda consultar o manual antes, quando for regra ou política; e a mensagem de erro do manual diz para não afirmar que a regra não existe.
- **Rodada v6.1, 120b (21/10/2026):** juiz `fiel` **12/12** (nenhuma regra, valor ou causa inventada); nota 2 em **10/12** (média 1,83); só manual **7/7**; fora do manual **2/2**; manual + banco: m09 nota 2, m08 nota 1 (resposta certa, mas sem citar as lojas que ficaram sem bônus), m10 nota 1 (não consultou o manual para "por que dezembro vende mais?" e disse que o banco não explica a causa). Seção esperada consultada em 8/10. ~8,2 mil tokens por pergunta (o prompt e os trechos do manual somam ~2,6 mil aos ~5,6 mil de antes).
- A avaliação pegou erros no **meu gabarito** (m08: "Serra com cerca de 112%", o banco diz 110,8%; m09: 78/75/71%, o banco diz 79,1/75,6/72,1%). Corrigidos no arquivo, com comentário; a nota já medida não foi refeita. A m10 não foi "consertada" no prompt de propósito: ajustar olhando a mesma pergunta seria sobreajuste ao conjunto de avaliação (lição da D27).
