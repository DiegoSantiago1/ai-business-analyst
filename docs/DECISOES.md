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
