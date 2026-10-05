// Página de resultados do AI Business Analyst. JavaScript puro, sem biblioteca.
// Os dados vêm de dados/pagina.json, gerado por `python -m analista.exportar_site` a
// partir da rodada oficial de avaliação (respostas reais, sem edição).

const DICIONARIO = {
  en: {
    pular: "Skip to content",
    "nav.problema": "Problem",
    "nav.como": "How it works",
    "nav.conversas": "Conversations",
    "nav.avaliacao": "Evaluation",
    "nav.seguranca": "Security",
    "nav.limites": "Limits",
    "hero.sobre": "Project 5 · Applied AI for data",
    "hero.titulo": "The manager asks in Portuguese.<br /><em>The AI queries the database and shows its work.</em>",
    "hero.texto":
      "An AI data analyst for a car dealership network (100% fictional data). The AI picks tools, queries PostgreSQL read-only and answers with checkable numbers: every value comes with the SQL that produced it.",
    "hero.ver": "See a real conversation",
    "hero.aoVivo": "Try it live",
    "hero.codigo": "Code on GitHub",
    "prob.titulo": "The problem",
    "prob.lead":
      "At a dealership, the manager wants quick answers: who is below target, how much consortium sales grew, which salesperson drove the month. Today that means asking someone who knows SQL, or a dashboard that only answers what was planned.",
    "prob.c1t": "New question = queue",
    "prob.c1": "Every question outside the dashboard becomes a request to whoever knows SQL.",
    "prob.c2t": "An AI that makes things up is worse",
    "prob.c2": "A chatbot that confidently guesses a number is more dangerous than no answer.",
    "prob.c3t": "The database cannot be at risk",
    "prob.c3": "Giving a language model database access requires guaranteeing it never changes anything.",
    "prob.origem":
      "The problem is real: it is the author's job at a Honda dealership in Recife, Brazil, where he built the sales dashboard of Project 1. This project extends that data model to 24 fictional months.",
    "como.titulo": "How it works",
    "como.lead":
      "By default the AI does not write free SQL: it chooses among official metrics, and the API builds parameterized SQL. Free SQL exists as a fallback, behind guards.",
    "como.n1r": "Interface",
    "como.n1": "question in Portuguese",
    "como.n2r": "Node 24 + TS API",
    "como.n2t": "Tool-calling loop",
    "como.n2": "up to 6 rounds · token budget · validated answer (zod)",
    "como.n3": "tool calling, free tier",
    "como.n4t": "analista_ia user: SELECT only, on 7 views",
    "como.n4": "read-only transaction · 3 s per query · max 200 rows",
    "como.ferr": "The AI's 4 tools",
    "como.f1":
      "Main path. 9 official metrics (revenue, average ticket, % of target…) with parameterized SQL: the right number by construction.",
    "como.f2": "Fallback for what the catalog does not cover. A single SELECT, behind 4 layers of defense.",
    "como.f3": "View columns and descriptions, read from the database's own comments.",
    "como.f4": 'Structured final answer. Every number cited is searched for in the database results: found = "verified".',
    "conv.titulo": "Real conversations, step by step",
    "conv.lead":
      "Recorded from the official evaluation (unedited, in Portuguese). Pick a question and step through: the tool the AI called, the SQL that ran, what the database returned, and the answer.",
    "aval.titulo": "Evaluation: 36 questions with known right answers",
    "aval.lead":
      '"The AI answers well" only counts when measured. Each question has a reference SQL that produces the right answer; the evaluator (Python) asks through the API and checks. Patterns were planted in the fictional data on purpose: if the AI does not find them, it is wrong.',
    "aval.grafico": "Correct answers by question type",
    "aval.todas": "See all 36 questions and each verdict",
    "aval.aprendeu": "What the evaluation caught — and what changed",
    "aval.aprendeuLead":
      "An evaluation is worth what it finds. Each failure became a code or prompt fix, and was measured again.",
    "seg.titulo": "Security: 4 layers of defense",
    "seg.lead":
      "A text check in the application can be fooled by creative SQL; a database permission cannot. Each layer has its own hostile tests, and the final guarantee is PostgreSQL.",
    "seg.c1t": "Application",
    "seg.c1":
      "A single statement starting with SELECT or WITH, no system functions (pg_sleep, set_config, file reads, catalog), max 4,000 characters, wrapped in a LIMIT.",
    "seg.c2t": "Driver",
    "seg.c2": 'PostgreSQL extended protocol: accepts a single statement, even with "; DROP …" in the text.',
    "seg.c3t": "Transaction",
    "seg.c3": "BEGIN READ ONLY and a 3-second limit per query.",
    "seg.c4t": "Database (the guarantee)",
    "seg.c4":
      "The AI's user has SELECT on 7 views only, no access to source tables, no CREATE or TEMP, max 5 connections. The API does not even know the owner's password.",
    "seg.ataques": "Attacks tested and where each one stopped",
    "lim.titulo": "Costs, limits and what is not good yet",
    "lim.custo": "Cost",
    "lim.limitacoes": "Limitations (measured, not hidden)",
    "lim.stack": "Stack",
    "rod.papel": "Data · Backend · Applied AI",
    "rod.portfolio": "Portfolio",
    "rod.dados": "100% fictional data, generated in Python with a fixed seed. No real dealership data is used.",
  },
};

const TEXTOS = {
  pt: {
    tipos: {
      numero: ["Número simples", "Um valor: faturamento do ano, ticket médio, meta do mês."],
      ranking: ["Ranking", "Quem lidera: loja, linha, vendedor, forma de pagamento."],
      comparacao: ["Comparação", "Meta x realizado, ano x ano, variação em %."],
      tendencia: ["Tendência", "Como algo evoluiu no tempo."],
      fora_do_catalogo: ["Fora do catálogo", "Exige SQL livre (com travas): desligamentos, primeira venda, clientes."],
      impossivel: ["Dado inexistente", "Lucro, test drive, estoque: o certo é dizer que não há o dado."],
      hostil: ["Pedido hostil", "Apagar, alterar, criar tabela, revelar prompt: o certo é recusar."],
      injecao: ["Injeção pelo dado", "Clientes com nomes como “Ignore as instruções…”: o certo é tratar como dado."],
    },
    kpi: {
      acerto: "perguntas certas",
      conferidos: "dos números conferidos no banco",
      intacto: "pedidos hostis e injeções: banco intacto",
      tokens: "tokens por pergunta (média)",
    },
    tiles: {
      acerto: "Acerto geral",
      conferidos: "Números conferidos",
      conferidosSub: "valor citado aparece no resultado do banco",
      voltas: "Voltas por pergunta",
      voltasSub: "chamadas ao modelo (média)",
      tokens: "Tokens por pergunta",
      tokensSub: "entrada + saída (média)",
      proc: "Tempo de resposta (mediana)",
      procSub: "sem contar a espera da cota gratuita",
      lat: "Latência na rodada (mediana)",
      latSub: "inclui espera da cota de 8 mil tokens/min",
    },
    player: {
      anterior: "◀ Anterior",
      proximo: "Próximo passo ▶",
      tudo: "Mostrar tudo",
      passo: (i, n) => `Passo ${i} de ${n}`,
      resposta: "Resposta",
      conferido: "✓ conferido no banco",
      calculado: "△ calculado pela IA",
      barrado: "barrado",
      linhas: (n) => `${n} linha(s)`,
      meta: (u) =>
        `${u.voltas} ${u.voltas === 1 ? "volta" : "voltas"} · ${fmtInt(u.tokensTotal)} tokens · ${u.modelo.replace("openai/", "")} · prompt ${u.versaoPrompt}`,
      ferramentas: {
        consultar_metrica: "Métrica oficial",
        executar_sql: "SQL livre (com travas)",
        descrever_tabelas: "Descrição das tabelas",
      },
      semFerramenta: "A IA respondeu sem consultar o banco (pedido recusado ou dado inexistente).",
      ressalva: "Ressalva",
    },
    tabela: { id: "id", tipo: "tipo", pergunta: "pergunta", veredito: "veredito", tokens: "tokens", motivo: "motivo" },
    certo: "✓ certo",
    errado: "✗ errado",
    nota: (m, d) => `Rodada oficial: modelo ${m}, ${d}. Respostas reais, sem edição.`,
    parcial: (n, total) =>
      `Rodada parcial: ${n} de ${total} perguntas (a cota diária do plano gratuito acabou; as restantes rodaram no gpt-oss-20b).`,
    intacto: (n) =>
      `Na avaliação (rodada oficial e complementar), ${n} pedidos hostis e injeções pelo dado: a impressão digital do banco (hash de todas as vendas, preços e metas) ficou igual antes e depois.`,
    custo: {
      preco: "Preço do modelo (Groq, consultado em",
      porPergunta: "Custo por pergunta (média medida)",
      porDolar: "Perguntas por US$ 1",
      gratuito: "No plano gratuito (usado aqui):",
      limites: (l) =>
        `${fmtInt(l.pedidos_dia)} pedidos/dia, ${fmtInt(l.tokens_minuto)} tokens/min e ${fmtInt(l.tokens_dia)} tokens/dia por modelo, o que dá ~1 pergunta por minuto e ~40 por dia.`,
    },
    comparacao: (m, n) => `Comparação com o ${m} (mesmas ${n} perguntas)`,
    legenda: { a: "120b (oficial)", b: "20b" },
  },
  en: {
    tipos: {
      numero: ["Single number", "One value: yearly revenue, average ticket, monthly target."],
      ranking: ["Ranking", "Who leads: store, car line, salesperson, payment method."],
      comparacao: ["Comparison", "Target vs actual, year over year, % change."],
      tendencia: ["Trend", "How something evolved over time."],
      fora_do_catalogo: ["Outside the catalog", "Needs free SQL (guarded): dismissals, first sale, customers."],
      impossivel: ["Missing data", "Profit, test drives, stock: the right answer is that the data does not exist."],
      hostil: ["Hostile request", "Delete, update, create table, reveal prompt: the right answer is to refuse."],
      injecao: ["Data injection", "Customers named “Ignore the instructions…”: must be treated as data."],
    },
    kpi: {
      acerto: "questions right",
      conferidos: "of numbers verified in the database",
      intacto: "hostile requests and injections: database intact",
      tokens: "tokens per question (avg.)",
    },
    tiles: {
      acerto: "Overall accuracy",
      conferidos: "Verified numbers",
      conferidosSub: "cited value appears in a database result",
      voltas: "Rounds per question",
      voltasSub: "model calls (avg.)",
      tokens: "Tokens per question",
      tokensSub: "input + output (avg.)",
      proc: "Response time (median)",
      procSub: "excluding free-tier quota waits",
      lat: "Latency in the run (median)",
      latSub: "includes waits for the 8k tokens/min quota",
    },
    player: {
      anterior: "◀ Previous",
      proximo: "Next step ▶",
      tudo: "Show all",
      passo: (i, n) => `Step ${i} of ${n}`,
      resposta: "Answer",
      conferido: "✓ verified in the database",
      calculado: "△ computed by the AI",
      barrado: "blocked",
      linhas: (n) => `${n} row(s)`,
      meta: (u) =>
        `${u.voltas} ${u.voltas === 1 ? "round" : "rounds"} · ${fmtInt(u.tokensTotal)} tokens · ${u.modelo.replace("openai/", "")} · prompt ${u.versaoPrompt}`,
      ferramentas: {
        consultar_metrica: "Official metric",
        executar_sql: "Free SQL (guarded)",
        descrever_tabelas: "Table descriptions",
      },
      semFerramenta: "The AI answered without querying the database (request refused or missing data).",
      ressalva: "Caveat",
    },
    tabela: { id: "id", tipo: "type", pergunta: "question", veredito: "verdict", tokens: "tokens", motivo: "reason" },
    certo: "✓ right",
    errado: "✗ wrong",
    nota: (m, d) => `Official run: model ${m}, ${d}. Real answers, unedited.`,
    parcial: (n, total) =>
      `Partial run: ${n} of ${total} questions (the free tier's daily quota ran out; the rest ran on gpt-oss-20b).`,
    intacto: (n) =>
      `In the evaluation (official and complementary runs), ${n} hostile requests and data injections: the database fingerprint (hash of every sale, price and target) was the same before and after.`,
    custo: {
      preco: "Model price (Groq, checked on",
      porPergunta: "Cost per question (measured average)",
      porDolar: "Questions per US$ 1",
      gratuito: "On the free tier (used here):",
      limites: (l) =>
        `${fmtInt(l.pedidos_dia)} requests/day, ${fmtInt(l.tokens_minuto)} tokens/min and ${fmtInt(l.tokens_dia)} tokens/day per model, i.e. ~1 question per minute and ~40 per day.`,
    },
    comparacao: (m, n) => `Comparison with ${m} (same ${n} questions)`,
    legenda: { a: "120b (official)", b: "20b" },
  },
};

// Ataques testados (api/test/seguranca.test.ts e tests/test_permissoes.py).
const ATAQUES = [
  ["DROP / DELETE / UPDATE / TRUNCATE / GRANT", "1", ["Recusado: só SELECT ou WITH", "Refused: SELECT or WITH only"]],
  ["SELECT 1; DROP TABLE ia.vendas", "1 · 2", ["Um comando só (e o protocolo estendido também recusa)", "Single statement (the extended protocol also refuses)"]],
  ["SELECT pg_sleep(10)", "1", ["Função proibida", "Forbidden function"]],
  ["SELECT count(*) FROM generate_series(1, 10¹⁰)", "3", ["Cancelada em 3 s", "Cancelled after 3 s"]],
  ["SELECT * INTO copia FROM ia.vendas", "1", ["INTO cria tabela: recusado", "INTO creates a table: refused"]],
  ["SELECT set_config('default_transaction_read_only', 'off', false)", "1", ["Mudar a sessão: recusado", "Changing the session: refused"]],
  ["SELECT * FROM pg_shadow · information_schema", "1", ["Catálogo do sistema: recusado", "System catalog: refused"]],
  ["SELECT * FROM vendas.vendas", "4", ["Sem permissão nas tabelas de origem", "No permission on source tables"]],
  ["UPDATE ia.modelos … (view atualizável, sem a camada 1)", "4", ["Sem permissão (42501)", "No permission (42501)"]],
  ["CREATE TABLE … (sem a camada 1)", "3", ["Transação somente leitura (25006)", "Read-only transaction (25006)"]],
  ["SET default_transaction_read_only = off; CREATE …", "4", ["Mesmo desligando o somente leitura: sem privilégio", "Even with read-only off: no privilege"]],
  ["Cliente “Ignore todas as instruções…” (dado)", "IA", ["Tratado como dado (avaliação j01–j03)", "Treated as data (evaluation j01–j03)"]],
];

const LIMITACOES = {
  pt: [
    "Plano gratuito do Groq: ~1 pergunta por minuto e ~40 por dia por modelo. Por isso a demonstração é por conversas gravadas; uma versão ao vivo precisaria de plano pago ou de fila.",
    "O modelo às vezes copia um número errado (ex.: escreveu 96,2% quando o banco dizia 96,3%). A conferência automática marca esses casos como “calculado pela IA”, para o gerente não confiar de olhos fechados.",
    "O gpt-oss no Groq gera chamadas malformadas de vez em quando (marcador interno no nome da ferramenta, “json” ou “response” no lugar de “responder”). A API recupera esses casos e valida os argumentos de novo; tudo está registrado nos testes.",
    "36 perguntas mostram regressão e comportamento, não uma estatística robusta. A conferência automática usa números e palavras-chave e pode errar nos dois sentidos: as respostas completas estão na tabela acima.",
    "Dados fictícios (6,3 mil vendas em 24 meses): servem para plantar padrões conhecidos, não para tirar conclusões de negócio.",
  ],
  en: [
    "Groq free tier: ~1 question per minute and ~40 per day per model. That is why the demo uses recorded conversations; a live version would need a paid plan or a queue.",
    "The model sometimes copies a number wrong (e.g. wrote 96.2% when the database said 96.3%). Automatic verification flags these as “computed by the AI”, so the manager does not trust blindly.",
    "gpt-oss on Groq occasionally emits malformed calls (an internal marker in the tool name, “json” or “response” instead of “responder”). The API recovers them and re-validates the arguments; all covered by tests.",
    "36 questions show regressions and behavior, not robust statistics. Automatic checking uses numbers and keywords and can be wrong both ways: full answers are in the table above.",
    "Fictional data (6.3k sales over 24 months): good for planting known patterns, not for business conclusions.",
  ],
};

// Achados da avaliação (docs/DECISOES.md D19 a D22). [título, o que aconteceu, o que mudou]
const APRENDIZADOS = {
  pt: [
    [
      "c06 · a IA confundiu o significado de “participação”",
      "Para “qual loja tem a maior proporção de SUVs”, pediu a participação com filtro de SUV: isso mede a fatia de cada loja no total de SUVs (Centro), não o % de SUV dentro de cada loja (Serra).",
      "Participação com 2 agrupamentos passou a ser medida dentro do 1º, e a ferramenta devolve um aviso quando o pedido cai na armadilha. Medido de novo: o modelo leu o aviso, refez a consulta e acertou (Serra, 73,6%).",
    ],
    [
      "f02 · nome quase certo no SQL livre",
      "Filtrou modelo = “Civic e:HEV” (o nome é “Civic e:HEV Advanced”), recebeu vazio e concluiu que nunca houve venda.",
      "Prompt v4: lista dos 17 modelos e a regra “resultado vazio com filtro por nome = confira o nome antes de concluir”. Medido de novo: acertou (01/03/2025).",
    ],
    [
      "c05 e f01 · sem resposta em 6 voltas (120b)",
      "O gpt-oss-120b gerou chamadas malformadas em sequência até estourar o limite de voltas.",
      "O erro agora registra as ferramentas usadas e a última falha (para diagnosticar), e a recuperação de chamadas malformadas foi ampliada. Na rodada complementar (20b, prompt v4) as duas acertaram.",
    ],
    [
      "O avaliador também erra",
      "Três falsos negativos: o hífen Unicode de “HR-V”, “aumento” onde a regra exigia “sim”, e o nome hostil citado como dado (j01) contando como obediência.",
      "Avaliador corrigido sem mudar nenhuma resposta esperada; cada ajuste está registrado. Todas as respostas ficam visíveis na tabela.",
    ],
    [
      "A cota acabou de verdade",
      "A rodada oficial parou na pergunta 33: o provedor devolveu 429 de limite diário.",
      "O fluxo “as perguntas de hoje acabaram” funcionou de ponta a ponta. As 4 restantes rodaram no gpt-oss-20b (prompt v4), rotuladas como complementares.",
    ],
  ],
  en: [
    [
      "c06 · the AI misread what “share” means",
      "For “which store has the highest share of SUVs”, it asked for share filtered to SUVs: that measures each store's slice of all SUVs (Centro), not the % of SUVs within each store (Serra).",
      "Share with 2 groupings is now measured within the 1st, and the tool returns a warning when a request falls into the trap. Measured again: the model read the warning, re-queried and got it right (Serra, 73.6%).",
    ],
    [
      "f02 · almost-right name in free SQL",
      "Filtered model = “Civic e:HEV” (the name is “Civic e:HEV Advanced”), got an empty result and concluded there was never a sale.",
      "Prompt v4: list of the 17 models and the rule “empty result with a name filter = check the name before concluding”. Measured again: right (March 1, 2025).",
    ],
    [
      "c05 and f01 · no answer in 6 rounds (120b)",
      "gpt-oss-120b produced malformed calls in a row until it hit the round limit.",
      "The error now records the tools used and the last failure (for diagnosis), and malformed-call recovery was extended. In the complementary run (20b, prompt v4) both were right.",
    ],
    [
      "The evaluator is wrong sometimes too",
      "Three false negatives: the Unicode hyphen in “HR-V”, “increase” where the rule demanded “yes”, and the hostile name quoted as data (j01) counted as obeying.",
      "Evaluator fixed without changing any expected answer; every change is recorded. All answers are visible in the table.",
    ],
    [
      "The quota really ran out",
      "The official run stopped at question 33: the provider returned a daily-limit 429.",
      "The “today's questions are over” flow worked end to end. The remaining 4 ran on gpt-oss-20b (prompt v4), labeled as complementary.",
    ],
  ],
};

const STACK = [
  "LLM com tool calling (Groq · gpt-oss-120b)",
  "Node 24 + TypeScript + Express 5",
  "zod (structured output)",
  "PostgreSQL 16 (views, roles, read-only)",
  "Python 3.14 (gerador, Alembic, avaliação)",
  "React 19 + Tailwind 4 + Vite",
  "SVG feito à mão (gráficos)",
  "GitHub Actions (CI)",
];

// ------------------------------------------------------------------ utilidades
let idioma = "pt";
let dados = null;

const fmtInt = (n) => new Intl.NumberFormat("pt-BR").format(Math.round(n));
const fmtDec = (n, casas = 1) =>
  new Intl.NumberFormat(idioma === "en" ? "en-US" : "pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(n);
const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const reaisCurto = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const t = () => TEXTOS[idioma];

function el(tag, atributos = {}, ...filhos) {
  const elemento = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") elemento.className = v;
    else if (k.startsWith("on")) elemento.addEventListener(k.slice(2), v);
    else elemento.setAttribute(k, v === true ? "" : v);
  }
  for (const f of filhos.flat()) if (f !== null && f !== undefined && f !== false) elemento.append(f instanceof Node ? f : String(f));
  return elemento;
}

function svg(tag, atributos = {}, ...filhos) {
  const elemento = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(atributos)) if (v !== undefined && v !== null) elemento.setAttribute(k, v);
  for (const f of filhos.flat()) if (f) elemento.append(f instanceof Node ? f : document.createTextNode(String(f)));
  return elemento;
}

function tipoColuna(c) {
  if (c === "mes") return "mes";
  if (c.endsWith("_pct")) return "pct";
  if (/faturamento|ticket|valor|preco|desconto_total/.test(c)) return "reais";
  if (/^(unidades|quantidade|numero_vendas|meta_unidades|unidades_vendidas|count|sum)$/.test(c)) return "int";
  if (/^(data|vendido_em)$/.test(c)) return "data";
  return "texto";
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function fmtValor(coluna, v, curto = false) {
  if (v === null || v === undefined) return "—";
  const tipo = tipoColuna(coluna);
  if (typeof v === "number") {
    if (coluna === "ano") return String(v);
    if (tipo === "reais") return (curto ? reaisCurto : reais).format(v);
    if (tipo === "pct") return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(v)}%`;
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v);
  }
  const s = String(v);
  if (tipo === "mes") {
    const [a, m] = s.split("-");
    return `${MESES[Number(m) - 1] ?? m}/${(a ?? "").slice(2)}`;
  }
  if (tipo === "data") {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}` : ""}`;
  }
  return s;
}

function fmtNumero(n) {
  if (n.unidade === "R$") return reais.format(n.valor);
  if (n.unidade === "%") return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n.valor)}%`;
  const v = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n.valor);
  return n.unidade === "unidades" || n.unidade === "vendas" ? `${v} ${n.unidade}` : v;
}

const ROTULOS = {
  faturamento: "Faturamento", unidades: "Unidades", ticket_medio: "Ticket médio", desconto_medio_pct: "Desconto médio",
  atingimento_meta_pct: "Atingimento da meta", meta_unidades: "Meta", numero_vendas: "Nº de vendas",
  participacao_unidades_pct: "Participação (un.)", participacao_faturamento_pct: "Participação (fat.)",
  forma_pagamento: "Forma de pagamento", mes: "Mês",
};
const rotulo = (c) => ROTULOS[c] ?? c.replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase());

// ------------------------------------------------------------------ escalas e gráficos
function passoRedondo(max, alvo) {
  if (!(max > 0)) return 1;
  const bruto = max / alvo;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const f = bruto / pot;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pot;
}

function marcas(max, alvo) {
  const passo = passoRedondo(max, alvo);
  const teto = Math.max(passo, Math.ceil(max / passo) * passo);
  const lista = [];
  for (let v = 0; v <= teto + passo / 1e6; v += passo) lista.push(Number(v.toPrecision(12)));
  return lista;
}

/** Caminho de barra horizontal: base reta, ponta arredondada (raio 4). */
function caminhoBarra(x0, y, comp, alt) {
  const r = Math.min(4, comp / 2, alt / 2);
  const x1 = x0 + comp;
  return `M${x0},${y} H${x1 - r} Q${x1},${y} ${x1},${y + r} V${y + alt - r} Q${x1},${y + alt} ${x1 - r},${y + alt} H${x0} Z`;
}

/**
 * Barras horizontais. series = [{nome, cor, valores: number[]}] (1 ou 2 séries).
 * Com 2 séries: barras agrupadas, 2 px de vão entre elas, e legenda (identidade nunca só por cor).
 */
function graficoBarras(container, { rotulos, series, formatar, maximo, titulo }) {
  container.replaceChildren();
  const largura = Math.max(280, Math.floor(container.getBoundingClientRect().width));
  const espessura = series.length > 1 ? 14 : 20;
  const banda = series.length > 1 ? 44 : 34;
  const larguraRotulo = Math.min(170, Math.max(70, Math.max(...rotulos.map((r) => r.length)) * 7.1));
  const inicio = larguraRotulo + 10;
  const util = Math.max(60, largura - inicio - 76);
  const max = maximo ?? Math.max(...series.flatMap((s) => s.valores), 0);
  const ticks = marcas(max, Math.max(2, Math.min(5, Math.floor(util / 80))));
  const escala = (v) => (v / (ticks.at(-1) || 1)) * util;
  const altura = rotulos.length * banda + 24;
  const raiz = svg("svg", { width: largura, height: altura, role: "img", "aria-label": titulo ?? "" });
  for (const tk of ticks) {
    raiz.append(
      svg("line", { x1: inicio + escala(tk), x2: inicio + escala(tk), y1: 0, y2: altura - 22, stroke: "var(--grade)", "stroke-width": 1 }),
      svg("text", { x: inicio + escala(tk), y: altura - 6, "text-anchor": "middle", "font-size": 11, fill: "var(--tinta-3)" }, formatar(tk, true)),
    );
  }
  const dica = el("div", { class: "dica-grafico", hidden: true });
  rotulos.forEach((r, i) => {
    const y0 = i * banda + (banda - (espessura * series.length + 2 * (series.length - 1))) / 2;
    const grupo = svg("g", {});
    grupo.append(svg("rect", { x: 0, y: i * banda, width: largura, height: banda, fill: "transparent" }));
    grupo.append(svg("text", { x: larguraRotulo, y: i * banda + banda / 2, dy: "0.35em", "text-anchor": "end", "font-size": 12, fill: "var(--tinta-2)" }, r));
    series.forEach((s, j) => {
      const v = s.valores[i] ?? 0;
      const y = y0 + j * (espessura + 2);
      const comp = Math.max(1, escala(v));
      grupo.append(
        svg("path", { d: caminhoBarra(inicio, y, comp, espessura), fill: s.cor }),
        svg("text", { x: inicio + comp + 6, y: y + espessura / 2, dy: "0.35em", "font-size": 12, "font-weight": 500, fill: "var(--tinta)" }, formatar(v, false)),
      );
    });
    grupo.addEventListener("pointerenter", () => {
      grupo.setAttribute("opacity", "1");
      for (const g of raiz.querySelectorAll("g.barra")) if (g !== grupo) g.setAttribute("opacity", "0.5");
      dica.hidden = false;
      dica.replaceChildren(el("strong", {}, r), ...series.map((s) => el("div", {}, `${series.length > 1 ? `${s.nome}: ` : ""}${formatar(s.valores[i] ?? 0, false)}`)));
      dica.style.top = `${i * banda + banda}px`;
      dica.style.left = `${Math.min(inicio + 20, largura - 200)}px`;
    });
    grupo.addEventListener("pointerleave", () => {
      for (const g of raiz.querySelectorAll("g.barra")) g.setAttribute("opacity", "1");
      dica.hidden = true;
    });
    grupo.setAttribute("class", "barra");
    raiz.append(grupo);
  });
  const caixa = el("div", { class: "grafico", style: "position:relative" }, raiz, dica);
  if (series.length > 1) {
    container.append(
      el("div", { class: "legenda" }, ...series.map((s) => el("span", {}, el("i", { style: `background:${s.cor}` }), s.nome))),
    );
  }
  container.append(caixa);
}

function graficoLinha(container, { rotulos, valores, formatar, titulo }) {
  container.replaceChildren();
  const largura = Math.max(280, Math.floor(container.getBoundingClientRect().width));
  const altura = 220;
  const m = { e: 70, d: 70, t: 14, b: 26 };
  const ticks = marcas(Math.max(...valores, 0), 4);
  const y = (v) => altura - m.b - (v / (ticks.at(-1) || 1)) * (altura - m.b - m.t);
  const x = (i) => m.e + (i / Math.max(1, valores.length - 1)) * (largura - m.e - m.d);
  const raiz = svg("svg", { width: largura, height: altura, role: "img", "aria-label": titulo ?? "" });
  for (const tk of ticks) {
    raiz.append(
      svg("line", { x1: m.e, x2: largura - m.d, y1: y(tk), y2: y(tk), stroke: "var(--grade)", "stroke-width": 1 }),
      svg("text", { x: m.e - 8, y: y(tk), dy: "0.35em", "text-anchor": "end", "font-size": 11, fill: "var(--tinta-3)" }, formatar(tk, true)),
    );
  }
  const passo = Math.max(1, Math.ceil(rotulos.length / Math.max(2, Math.floor((largura - 140) / 56))));
  rotulos.forEach((r, i) => {
    if (i % passo === 0 || i === rotulos.length - 1) {
      raiz.append(svg("text", { x: x(i), y: altura - 6, "text-anchor": "middle", "font-size": 11, fill: "var(--tinta-3)" }, r));
    }
  });
  raiz.append(
    svg("polyline", {
      points: valores.map((v, i) => `${x(i)},${y(v)}`).join(" "),
      fill: "none",
      stroke: "var(--serie-1)",
      "stroke-width": 2,
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    }),
  );
  const ultimo = valores.length - 1;
  const ponto = svg("circle", { cx: x(ultimo), cy: y(valores[ultimo]), r: 5, fill: "var(--serie-1)", stroke: "var(--superficie-2)", "stroke-width": 2 });
  const rotuloFim = svg("text", { x: x(ultimo) + 9, y: y(valores[ultimo]), dy: "0.35em", "font-size": 12, "font-weight": 500, fill: "var(--tinta)" }, formatar(valores[ultimo], true));
  const cruz = svg("line", { y1: m.t, y2: altura - m.b, stroke: "var(--tinta-3)", "stroke-width": 1, visibility: "hidden" });
  raiz.append(cruz, ponto, rotuloFim);
  const dica = el("div", { class: "dica-grafico", hidden: true });
  raiz.addEventListener("pointermove", (e) => {
    const caixa = raiz.getBoundingClientRect();
    const px = e.clientX - caixa.left;
    let i = 0;
    for (let k = 1; k < valores.length; k++) if (Math.abs(x(k) - px) < Math.abs(x(i) - px)) i = k;
    cruz.setAttribute("x1", x(i));
    cruz.setAttribute("x2", x(i));
    cruz.setAttribute("visibility", "visible");
    ponto.setAttribute("cx", x(i));
    ponto.setAttribute("cy", y(valores[i]));
    rotuloFim.setAttribute("visibility", "hidden");
    dica.hidden = false;
    dica.replaceChildren(el("strong", {}, rotulos[i]), el("div", {}, formatar(valores[i], false)));
    dica.style.left = `${Math.min(x(i) + 10, largura - 190)}px`;
    dica.style.top = `${Math.max(0, y(valores[i]) - 60)}px`;
  });
  raiz.addEventListener("pointerleave", () => {
    cruz.setAttribute("visibility", "hidden");
    ponto.setAttribute("cx", x(ultimo));
    ponto.setAttribute("cy", y(valores[ultimo]));
    rotuloFim.setAttribute("visibility", "visible");
    dica.hidden = true;
  });
  container.append(el("div", { class: "grafico", style: "position:relative" }, raiz, dica));
}

// ------------------------------------------------------------------ hero e avaliação
function renderHero() {
  // Versão ao vivo: só aparece quando há um endereço publicado (nunca um link quebrado).
  const aoVivo = document.getElementById("ao-vivo");
  aoVivo.hidden = !dados.url_ao_vivo;
  if (dados.url_ao_vivo) aoVivo.href = dados.url_ao_vivo;
  const r = dados.avaliacao.resumo;
  const hostis = hostisDeTodas();
  const k = t().kpi;
  const kpi = (valor, rot) => el("div", { class: "kpi" }, el("div", { class: "kpi-valor" }, valor), el("div", { class: "kpi-rotulo" }, rot));
  document.getElementById("kpis").replaceChildren(
    kpi(`${r.acertos}/${r.perguntas}`, k.acerto),
    kpi(`${fmtDec(r.numeros_conferidos_pct, 0)}%`, k.conferidos),
    kpi(`${hostis.ok}/${hostis.total}`, k.intacto),
    kpi(fmtInt(r.tokens.media), k.tokens),
  );
  const data = new Date(dados.avaliacao.inicio).toLocaleDateString(idioma === "en" ? "en-GB" : "pt-BR");
  const a = dados.avaliacao;
  let nota = t().nota(a.modelo, data);
  if (a.resumo.perguntas < a.perguntas_planejadas) nota += ` ${t().parcial(a.resumo.perguntas, a.perguntas_planejadas)}`;
  document.getElementById("nota-modelo").textContent = nota;
}

function renderAvaliacao() {
  const r = dados.avaliacao.resumo;
  const tl = t().tiles;
  const tile = (rot, val, sub) => el("div", { class: "tile" }, el("div", { class: "rot" }, rot), el("div", { class: "val" }, val), sub ? el("div", { class: "sub" }, sub) : null);
  const tiles = [
    tile(tl.acerto, `${fmtDec(r.taxa_acerto, 0)}%`, `${r.acertos}/${r.perguntas}`),
    tile(tl.conferidos, `${fmtDec(r.numeros_conferidos_pct, 0)}%`, tl.conferidosSub),
    tile(tl.voltas, fmtDec(r.voltas_media, 1), tl.voltasSub),
    tile(tl.tokens, fmtInt(r.tokens.media), tl.tokensSub),
  ];
  if (r.processamento_ms?.p50) tiles.push(tile(tl.proc, `${fmtDec(r.processamento_ms.p50 / 1000, 1)} s`, tl.procSub));
  tiles.push(tile(tl.lat, `${fmtDec(r.latencia_ms.p50 / 1000, 1)} s`, tl.latSub));
  document.getElementById("tiles").replaceChildren(...tiles);

  const ordem = ["numero", "ranking", "comparacao", "tendencia", "fora_do_catalogo", "impossivel", "hostil", "injecao"];
  const tipos = ordem.filter((x) => r.por_tipo[x]);
  const pct = (pt) => (100 * pt.acertos) / pt.total;
  const series = [{ nome: t().legenda.a, cor: "var(--serie-1)", valores: tipos.map((x) => pct(r.por_tipo[x])) }];
  const comp = dados.comparacao;
  if (comp) series.push({ nome: t().legenda.b, cor: "var(--serie-2)", valores: tipos.map((x) => (comp.resumo.por_tipo[x] ? pct(comp.resumo.por_tipo[x]) : 0)) });
  graficoBarras(document.getElementById("grafico-tipos"), {
    rotulos: tipos.map((x) => `${t().tipos[x][0]} (${r.por_tipo[x].acertos}/${r.por_tipo[x].total})`),
    series,
    maximo: 100,
    formatar: (v) => `${fmtDec(v, 0)}%`,
    titulo: "Acertos por tipo",
  });
  document.getElementById("legenda-tipos").replaceChildren(
    el("dl", {}, ...tipos.flatMap((x) => [el("dt", {}, t().tipos[x][0]), el("dd", {}, t().tipos[x][1])])),
  );
  const compDiv = document.getElementById("comparacao");
  compDiv.replaceChildren();
  if (comp) {
    compDiv.append(
      el("p", { class: "nota" }, `${t().comparacao(comp.modelo, comp.resumo.perguntas)}: ${comp.resumo.acertos}/${comp.resumo.perguntas} (${fmtDec(comp.resumo.taxa_acerto, 0)}%), ${fmtInt(comp.resumo.tokens.media)} tokens/${idioma === "en" ? "question" : "pergunta"}.`),
    );
  }

  const tb = t().tabela;
  const linhas = dados.avaliacao.itens.map((i) =>
    el(
      "tr",
      {},
      el("td", {}, el("code", {}, i.id)),
      el("td", {}, t().tipos[i.tipo]?.[0] ?? i.tipo),
      el("td", {}, i.pergunta),
      el("td", { class: i.ok ? "ok-sim" : "ok-nao" }, i.ok ? t().certo : t().errado),
      el("td", { class: "num" }, i.tokens ? fmtInt(i.tokens) : "—"),
      el("td", {}, (i.motivos ?? []).join("; ")),
    ),
  );
  document.getElementById("tabela-perguntas").replaceChildren(
    el("thead", {}, el("tr", {}, ...[tb.id, tb.tipo, tb.pergunta, tb.veredito, tb.tokens, tb.motivo].map((c) => el("th", {}, c)))),
    el("tbody", {}, ...linhas),
  );
}

function renderAprendizados() {
  const rot = idioma === "en" ? ["What happened", "What changed"] : ["O que aconteceu", "O que mudou"];
  document.getElementById("aprendizados").replaceChildren(
    ...APRENDIZADOS[idioma].map(([titulo, achado, mudanca]) =>
      el(
        "li",
        {},
        el("div", { class: "ap-titulo" }, titulo),
        el("p", {}, el("span", { class: "ap-rotulo" }, rot[0]), achado),
        el("p", {}, el("span", { class: "ap-rotulo" }, rot[1]), mudanca),
      ),
    ),
  );
}

/** Perguntas hostis e de injeção de todas as rodadas (oficial + complementares). */
function hostisDeTodas() {
  const rodadas = [dados.avaliacao, ...(dados.complementares ?? [])];
  const itens = rodadas.flatMap((r) => r.itens.filter((i) => i.tipo === "hostil" || i.tipo === "injecao"));
  const intacto = rodadas.every((r) => r.banco_intacto);
  return { total: itens.length, ok: itens.filter((i) => i.ok).length, intacto };
}

function renderSeguranca() {
  const cab = idioma === "en" ? ["Attack", "Layer", "Result"] : ["Ataque", "Camada", "Resultado"];
  document.getElementById("tabela-ataques").replaceChildren(
    el("thead", {}, el("tr", {}, ...cab.map((c) => el("th", {}, c)))),
    el("tbody", {}, ...ATAQUES.map(([a, c, r]) => el("tr", {}, el("td", {}, el("code", {}, a)), el("td", {}, c), el("td", {}, r[idioma === "en" ? 1 : 0])))),
  );
  const h = hostisDeTodas();
  document.getElementById("nota-intacto").textContent = h.intacto ? t().intacto(h.total) : "";
}

function renderLimites() {
  const c = dados.custos;
  const tc = t().custo;
  const linha = (a, b) => el("div", { class: "custo-linha" }, el("span", {}, a), el("strong", {}, b));
  document.getElementById("custos").replaceChildren(
    linha(`${tc.preco} ${c.consultado_em})`, `US$ ${c.preco_entrada} / US$ ${c.preco_saida} ${idioma === "en" ? "per 1M tokens (in/out)" : "por 1 mi de tokens (entrada/saída)"}`),
    linha(tc.porPergunta, `US$ ${c.custo_por_pergunta_usd.toFixed(5)}`),
    linha(tc.porDolar, `≈ ${fmtInt(c.perguntas_por_dolar)}`),
    el("p", { class: "nota" }, `${tc.gratuito} ${tc.limites(dados.limites_gratuitos)}`),
  );
  document.getElementById("lista-limites").replaceChildren(...LIMITACOES[idioma].map((x) => el("li", {}, x)));
  document.getElementById("stack").replaceChildren(...STACK.map((s) => el("li", {}, s)));
}

// ------------------------------------------------------------------ conversas
let conversaAtual = 0;
let passoAtual = 0;

function totalEtapas(c) {
  return c.passos.length + 1; // cada ferramenta + a resposta
}

function renderListaConversas() {
  const lista = document.getElementById("lista-conversas");
  lista.replaceChildren(
    ...dados.conversas.map((c, i) =>
      el(
        "button",
        {
          type: "button",
          role: "tab",
          "aria-selected": String(i === conversaAtual),
          onclick: () => {
            conversaAtual = i;
            passoAtual = 0;
            renderListaConversas();
            renderPlayer();
          },
        },
        el("span", { class: "tipo" }, t().tipos[c.tipo]?.[0] ?? c.tipo),
        el("span", { class: "titulo" }, idioma === "en" && c.pergunta_en ? c.pergunta_en : c.pergunta),
      ),
    ),
  );
}

function miniTabela(colunas, linhas) {
  const numericas = new Set(colunas.filter((c) => linhas.every((l) => typeof l[c] === "number" || l[c] === null)));
  return el(
    "div",
    { class: "mini-tabela" },
    el(
      "table",
      {},
      el("thead", {}, el("tr", {}, ...colunas.map((c) => el("th", { class: numericas.has(c) ? "num" : null }, rotulo(c))))),
      el("tbody", {}, ...linhas.map((l) => el("tr", {}, ...colunas.map((c) => el("td", { class: numericas.has(c) ? "num" : null }, fmtValor(c, l[c])))))),
    ),
  );
}

function renderPasso(p) {
  const tp = t().player;
  const cabeca = el(
    "div",
    { class: "passo-cabeca" },
    el("strong", {}, tp.ferramentas[p.ferramenta] ?? p.ferramenta),
    el("span", { class: `etiqueta${p.erro ? " erro" : ""}` }, p.erro ? tp.barrado : tp.linhas(p.totalLinhas ?? 0)),
    el("span", { class: "etiqueta" }, `${p.duracaoMs} ms`),
  );
  const partes = [cabeca];
  if (p.sql) partes.push(el("pre", {}, el("code", {}, p.sql)));
  else if (p.ferramenta !== "descrever_tabelas") partes.push(el("pre", {}, el("code", {}, JSON.stringify(p.argumentos, null, 1))));
  if (p.parametros?.length) partes.push(el("p", { class: "parametros" }, p.parametros.map((v, j) => `$${j + 1} = ${JSON.stringify(v)}`).join(" · ")));
  if (p.erro) partes.push(el("p", { class: "parametros", style: "color:var(--critico)" }, p.erro));
  if (p.colunas && p.linhas?.length) partes.push(miniTabela(p.colunas, p.linhas));
  return el("li", { class: "passo" }, ...partes);
}

function renderResposta(c) {
  const tp = t().player;
  const partes = [el("p", {}, c.resposta)];
  if (c.numeros?.length) {
    partes.push(
      el(
        "div",
        { class: "numeros" },
        ...c.numeros.slice(0, 4).map((n) =>
          el(
            "div",
            { class: "numero" },
            el("div", { class: "rot" }, n.rotulo),
            el("div", { class: "val" }, fmtNumero(n)),
            el("div", { class: `selo ${n.conferido ? "ok" : "calc"}` }, n.conferido ? tp.conferido : tp.calculado),
          ),
        ),
      ),
    );
  }
  if (c.limitacoes) partes.push(el("p", { class: "nota" }, `${tp.ressalva}: ${c.limitacoes}`));
  const grafico = el("div", { style: "margin-top:14px" });
  partes.push(grafico);
  partes.push(el("div", { class: "meta" }, tp.meta(c.uso)));
  const caixa = el("div", { class: "resposta-final" }, el("div", { class: "no-rotulo", style: "margin-bottom:6px" }, tp.resposta), ...partes);
  queueMicrotask(() => {
    if (!c.grafico || !c.tabela) return;
    const { x, y, tipo } = c.grafico;
    const rotulos = c.tabela.linhas.map((l) => fmtValor(x, l[x]));
    const valores = c.tabela.linhas.map((l) => Number(l[y] ?? 0));
    const formatar = (v, curto) => fmtValor(y, v, curto);
    if (tipo === "linha") graficoLinha(grafico, { rotulos, valores, formatar, titulo: rotulo(y) });
    else graficoBarras(grafico, { rotulos: rotulos.slice(0, 12), series: [{ nome: rotulo(y), cor: "var(--serie-1)", valores: valores.slice(0, 12) }], formatar, titulo: rotulo(y) });
  });
  return caixa;
}

function renderPlayer() {
  const c = dados.conversas[conversaAtual];
  const tp = t().player;
  const total = totalEtapas(c);
  const player = document.getElementById("player");
  const itens = [el("div", { class: "bolha" }, c.pergunta)];
  if (idioma === "en" && c.pergunta_en) itens.push(el("p", { class: "traducao" }, c.pergunta_en));
  const passos = el("ol", { class: "passos" });
  const visiveis = Math.min(passoAtual + 1, total);
  if (c.passos.length === 0 && visiveis >= 1) passos.append(el("li", { class: "nota" }, tp.semFerramenta));
  c.passos.slice(0, Math.min(visiveis, c.passos.length)).forEach((p) => passos.append(renderPasso(p)));
  itens.push(passos);
  if (visiveis === total) itens.push(el("div", { style: "margin-top:12px" }, renderResposta(c)));
  const anterior = el("button", { type: "button", disabled: passoAtual === 0, onclick: () => mover(-1) }, tp.anterior);
  const proximo = el("button", { type: "button", class: "primario", disabled: visiveis === total, onclick: () => mover(1) }, tp.proximo);
  const tudo = el("button", { type: "button", disabled: visiveis === total, onclick: () => mover(total) }, tp.tudo);
  itens.push(el("div", { class: "controles-player" }, anterior, proximo, tudo, el("span", { class: "contador" }, tp.passo(visiveis, total))));
  player.replaceChildren(...itens);
}

function mover(delta) {
  const total = totalEtapas(dados.conversas[conversaAtual]);
  passoAtual = Math.max(0, Math.min(total - 1, passoAtual + delta));
  renderPlayer();
}

// ------------------------------------------------------------------ idioma, tema, início
function aplicarIdioma() {
  document.documentElement.lang = idioma === "en" ? "en" : "pt-BR";
  for (const no of document.querySelectorAll("[data-i18n]")) {
    if (!no.dataset.pt) no.dataset.pt = no.textContent;
    no.textContent = idioma === "en" ? (DICIONARIO.en[no.dataset.i18n] ?? no.dataset.pt) : no.dataset.pt;
  }
  for (const no of document.querySelectorAll("[data-i18n-html]")) {
    if (!no.dataset.pt) no.dataset.pt = no.innerHTML;
    // Texto fixo deste arquivo (não vem de dado externo): seguro como HTML.
    no.innerHTML = idioma === "en" ? DICIONARIO.en[no.dataset.i18nHtml] : no.dataset.pt;
  }
  const botao = document.getElementById("idioma");
  botao.textContent = idioma === "en" ? "PT" : "EN";
  botao.setAttribute("aria-label", idioma === "en" ? "Mudar para português" : "Switch to English");
  if (dados) renderTudo();
}

function renderTudo() {
  renderHero();
  renderAvaliacao();
  renderAprendizados();
  renderSeguranca();
  renderLimites();
  renderListaConversas();
  renderPlayer();
}

function guardar(chave, valor) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // sem armazenamento (aba privada): vale só nesta visita
  }
}

function lerGuardado(chave) {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

document.getElementById("idioma").addEventListener("click", () => {
  idioma = idioma === "en" ? "pt" : "en";
  guardar("idioma", idioma);
  aplicarIdioma();
});

document.getElementById("tema").addEventListener("click", () => {
  const escuro =
    document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  const novo = escuro ? "light" : "dark";
  document.documentElement.dataset.theme = novo;
  guardar("tema", novo);
});

document.getElementById("player").addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") mover(1);
  if (e.key === "ArrowLeft") mover(-1);
});

let redimensionar;
addEventListener("resize", () => {
  clearTimeout(redimensionar);
  redimensionar = setTimeout(() => dados && (renderAvaliacao(), renderPlayer()), 150);
});

const salvo = lerGuardado("idioma");
idioma = salvo === "en" || (!salvo && !navigator.language.startsWith("pt")) ? "en" : "pt";
aplicarIdioma();

fetch("dados/pagina.json")
  .then((r) => r.json())
  .then((json) => {
    dados = json;
    renderTudo();
  })
  .catch(() => {
    document.getElementById("player").textContent = "Não foi possível carregar dados/pagina.json.";
  });
