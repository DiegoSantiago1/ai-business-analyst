/**
 * Camada semântica: as métricas OFICIAIS e o montador de SQL parametrizado.
 *
 * É o caminho principal da IA (D5): ela escolhe métrica, período, agrupamento e filtros, e
 * a API monta o SQL. O número sai certo por construção, porque a fórmula de "ticket médio"
 * ou de "atingimento da meta" está escrita uma vez, aqui, e não reinventada pela IA a cada
 * pergunta.
 *
 * Segurança do montador:
 * - nomes de coluna, métrica e direção de ordenação só saem das listas abaixo (allowlist);
 * - todo valor que vem da IA (datas, lojas, limite) vai como PARÂMETRO ($1, $2...), nunca
 *   colado no texto do SQL.
 */
import { z } from "zod";

export class ErroFerramenta extends Error {
  override name = "ErroFerramenta";
}

// --------------------------------------------------------------------------- dimensões

export const DIMENSOES = {
  loja: "Loja da rede (5 lojas)",
  cidade: "Cidade da loja",
  vendedor: "Vendedor",
  modelo: "Versão do carro (ex.: HR-V EXL)",
  linha: "Família do carro (ex.: HR-V, City Sedan)",
  categoria: "Hatch, Sedan ou SUV",
  forma_pagamento: "A vista, Financiado ou Consorcio",
  mes: "Mês (primeiro dia do mês)",
  ano: "Ano",
} as const;
export type Dimensao = keyof typeof DIMENSOES;
export const NOMES_DIMENSOES = Object.keys(DIMENSOES) as Dimensao[];

/** Dimensões que aceitam filtro por valor (mês e ano são filtrados pelo período). */
export const DIMENSOES_FILTRAVEIS = [
  "loja",
  "cidade",
  "vendedor",
  "modelo",
  "linha",
  "categoria",
  "forma_pagamento",
] as const satisfies readonly Dimensao[];
export type DimensaoFiltravel = (typeof DIMENSOES_FILTRAVEIS)[number];

// --------------------------------------------------------------------------- métricas

type Fonte = "vendas" | "desempenho";

interface Metrica {
  descricao: string;
  unidade: "R$" | "unidades" | "vendas" | "%";
  /** Fórmula em cada fonte em que a métrica existe. */
  sql: Partial<Record<Fonte, string>>;
}

export const METRICAS = {
  faturamento: {
    descricao: "Soma do valor cobrado",
    unidade: "R$",
    sql: { vendas: "round(sum(valor_total), 2)", desempenho: "round(sum(faturamento), 2)" },
  },
  unidades: {
    descricao: "Veículos vendidos",
    unidade: "unidades",
    sql: { vendas: "sum(quantidade)", desempenho: "sum(unidades_vendidas)" },
  },
  numero_vendas: {
    descricao: "Quantidade de vendas (notas); uma venda pode ter 2 veículos",
    unidade: "vendas",
    sql: { vendas: "count(*)" },
  },
  ticket_medio: {
    descricao: "Faturamento / unidades (valor médio por veículo)",
    unidade: "R$",
    sql: { vendas: "round(sum(valor_total) / nullif(sum(quantidade), 0), 2)" },
  },
  desconto_medio_pct: {
    descricao: "Desconto sobre o preço de tabela, em %",
    unidade: "%",
    sql: {
      vendas: "round(100 * sum(desconto_total) / nullif(sum(quantidade * preco_tabela), 0), 2)",
    },
  },
  participacao_unidades_pct: {
    descricao:
      "Fatia de cada grupo nas unidades, em %. Com 2 agrupamentos, a fatia é DENTRO do 1º (agrupar_por [loja, categoria] = % de cada categoria em cada loja)",
    unidade: "%",
    sql: { vendas: "round(100.0 * sum(quantidade) / sum(sum(quantidade)) OVER (), 1)" },
  },
  participacao_faturamento_pct: {
    descricao: "Como participacao_unidades_pct, sobre o faturamento",
    unidade: "%",
    sql: { vendas: "round(100.0 * sum(valor_total) / sum(sum(valor_total)) OVER (), 1)" },
  },
  meta_unidades: {
    descricao: "Meta de unidades (metas são mensais, por loja)",
    unidade: "unidades",
    sql: { desempenho: "sum(meta_unidades)" },
  },
  atingimento_meta_pct: {
    descricao: "Unidades vendidas / meta, em % (abaixo de 100 = abaixo da meta)",
    unidade: "%",
    sql: { desempenho: "round(100.0 * sum(unidades_vendidas) / nullif(sum(meta_unidades), 0), 1)" },
  },
} as const satisfies Record<string, Metrica>;
export type NomeMetrica = keyof typeof METRICAS;
export const NOMES_METRICAS = Object.keys(METRICAS) as NomeMetrica[];

const FONTES: Record<Fonte, { view: string; colunaData: string; dimensoes: Dimensao[] }> = {
  vendas: { view: "ia.vendas", colunaData: "data", dimensoes: NOMES_DIMENSOES },
  desempenho: { view: "ia.desempenho_lojas", colunaData: "mes", dimensoes: ["loja", "mes", "ano"] },
};

// --------------------------------------------------------------------------- pedido

const dataISO = z.iso.date({ error: "use o formato AAAA-MM-DD" });

export const esquemaPedido = z
  .object({
    metricas: z.array(z.enum(NOMES_METRICAS)).min(1).max(4),
    agrupar_por: z.array(z.enum(NOMES_DIMENSOES)).max(2).default([]),
    de: dataISO,
    ate: dataISO,
    filtros: z
      .partialRecord(
        z.enum(DIMENSOES_FILTRAVEIS),
        z.array(z.string().min(1).max(80)).min(1).max(20),
      )
      .default({}),
    // Métrica pedida ou dimensão agrupada ("ordenar_por: mes" é um pedido natural do modelo).
    ordenar_por: z.enum([...NOMES_METRICAS, ...NOMES_DIMENSOES]).optional(),
    ordem: z.enum(["desc", "asc"]).default("desc"),
    limite: z.number().int().min(1).max(100).default(50),
  })
  .strict();
export type PedidoMetrica = z.input<typeof esquemaPedido>;

// --------------------------------------------------------------------------- vocabulário

/** Valores válidos de cada dimensão filtrável, lidos do banco (ver vocabulario.ts). */
export type Valores = Record<DimensaoFiltravel, readonly string[]>;

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Casa o valor que a IA escreveu com um valor real: igual (sem acento e sem caixa) ou,
 * se só um valor contém o texto, esse valor ("Litoral" -> "Loja Litoral"). Se não der,
 * erro com as opções: a IA lê o erro e tenta de novo com o nome certo.
 */
export function casarValor(dimensao: DimensaoFiltravel, escrito: string, valores: Valores): string {
  const opcoes = valores[dimensao];
  const alvo = normalizar(escrito);
  const igual = opcoes.find((o) => normalizar(o) === alvo);
  if (igual) return igual;
  // Primeiro quem tem uma PALAVRA começando pelo texto ("Ana" -> "Ana Paula Ribeiro", e
  // não "Juliana Rocha"); depois, quem contém o texto em qualquer posição.
  const inicioDePalavra = opcoes.filter((o) => ` ${normalizar(o)}`.includes(` ${alvo}`));
  if (inicioDePalavra.length === 1 && inicioDePalavra[0]) return inicioDePalavra[0];
  const contem =
    inicioDePalavra.length > 1
      ? inicioDePalavra
      : opcoes.filter((o) => normalizar(o).includes(alvo));
  if (contem.length === 1 && contem[0]) return contem[0];
  const lista = opcoes.length <= 25 ? `Opções: ${opcoes.join(", ")}.` : "";
  const motivo = contem.length > 1 ? `é ambíguo (${contem.join(", ")})` : "não existe";
  throw new ErroFerramenta(`${dimensao} "${escrito}" ${motivo}. ${lista}`.trim());
}

// --------------------------------------------------------------------------- montador

export interface ConsultaMontada {
  sql: string;
  parametros: unknown[];
  fonte: Fonte;
  /** Recado para a IA junto do resultado (ex.: uma leitura comum e errada da métrica). */
  aviso?: string;
}

function formula(metrica: NomeMetrica, fonte: Fonte): string {
  const sql = (METRICAS[metrica].sql as Metrica["sql"])[fonte];
  if (!sql) throw new ErroFerramenta(`${metrica} não existe na fonte ${fonte}.`);
  return sql;
}

function escolherFonte(metricas: NomeMetrica[]): Fonte {
  if (metricas.every((m) => "vendas" in METRICAS[m].sql)) return "vendas";
  if (metricas.every((m) => "desempenho" in METRICAS[m].sql)) return "desempenho";
  throw new ErroFerramenta(
    "meta_unidades e atingimento_meta_pct só combinam com unidades e faturamento " +
      "(peça as outras métricas numa consulta separada).",
  );
}

export function montarConsulta(entrada: unknown, valores: Valores): ConsultaMontada {
  const lido = esquemaPedido.safeParse(entrada);
  if (!lido.success) {
    const detalhes = lido.error.issues.map((i) => `${i.path.join(".") || "pedido"}: ${i.message}`);
    throw new ErroFerramenta(`Pedido inválido. ${detalhes.join("; ")}`);
  }
  const p = lido.data;
  if (p.de > p.ate) throw new ErroFerramenta(`Período invertido: de ${p.de} até ${p.ate}.`);
  const metricas = [...new Set(p.metricas)];
  const dimensoes = [...new Set(p.agrupar_por)];
  const fonte = escolherFonte(metricas);
  const { view, colunaData, dimensoes: permitidas } = FONTES[fonte];

  for (const d of [...dimensoes, ...(Object.keys(p.filtros) as Dimensao[])]) {
    if (!permitidas.includes(d)) {
      throw new ErroFerramenta(
        `Metas só existem por loja e mês: não dá para usar "${d}" com ${metricas.join(", ")}.`,
      );
    }
  }
  const ordenavel = [...metricas, ...dimensoes] as string[];
  if (p.ordenar_por && !ordenavel.includes(p.ordenar_por)) {
    throw new ErroFerramenta(
      `ordenar_por "${p.ordenar_por}" precisa estar em metricas ou agrupar_por.`,
    );
  }

  const parametros: unknown[] = [];
  const parametro = (valor: unknown) => {
    parametros.push(valor);
    return `$${parametros.length}`;
  };

  // Metas são mensais: o período vira meses inteiros (o mês de "de" até o mês de "ate").
  const inicio =
    fonte === "desempenho"
      ? `date_trunc('month', ${parametro(p.de)}::date)`
      : `${parametro(p.de)}::date`;
  const onde = [`${colunaData} BETWEEN ${inicio} AND ${parametro(p.ate)}::date`];
  for (const [dimensao, escritos] of Object.entries(p.filtros) as [DimensaoFiltravel, string[]][]) {
    const casados = [...new Set(escritos.map((e) => casarValor(dimensao, e, valores)))];
    onde.push(`${dimensao} = ANY(${parametro(casados)}::text[])`);
  }

  // Participação com 2 agrupamentos: a fatia é dentro do 1º (ex.: % de cada forma de
  // pagamento DENTRO de cada ano). Sobre o total geral, "consórcio em 2025 x 2026" sairia
  // errado (medido na avaliação, 05/10/2026).
  const janela = dimensoes.length === 2 ? `OVER (PARTITION BY ${dimensoes[0]})` : "OVER ()";
  const colunas = [
    ...dimensoes,
    ...metricas.map((m) => `${formula(m, fonte).replace("OVER ()", janela)} AS ${m}`),
  ];
  const temTempo = dimensoes.some((d) => d === "mes" || d === "ano");
  const ordem = p.ordem === "asc" ? "ASC" : "DESC";
  // Série no tempo sem ordenação pedida: ordem cronológica. Nos outros casos, pela
  // métrica, com as dimensões como desempate (resultado estável entre execuções).
  const ordenacao =
    !p.ordenar_por && temTempo
      ? dimensoes.join(", ")
      : `${p.ordenar_por ?? metricas[0]} ${p.ordenar_por ? ordem : "DESC"} NULLS LAST, ${dimensoes.join(", ")}`;

  const sql = [
    `SELECT ${colunas.join(", ")}`,
    `FROM ${view}`,
    `WHERE ${onde.join(" AND ")}`,
    dimensoes.length > 0 ? `GROUP BY ${dimensoes.join(", ")}` : "",
    dimensoes.length > 0 ? `ORDER BY ${ordenacao}` : "",
    `LIMIT ${parametro(p.limite)}`,
  ]
    .filter(Boolean)
    .join("\n");
  // Armadilha medida na avaliação (c06, 05/10/2026): "% de SUV em cada loja" pedido como
  // participação com filtro de categoria e agrupado só por loja. Isso mede a fatia de cada
  // loja no total de SUVs, outra pergunta. O aviso volta junto do resultado.
  const filtrosUsados = Object.keys(p.filtros);
  const participacao = metricas.some((m) => m.startsWith("participacao_"));
  const aviso =
    participacao && dimensoes.length === 1 && filtrosUsados.some((f) => f !== dimensoes[0])
      ? `participação aqui = fatia de cada ${dimensoes[0]} no total filtrado (${filtrosUsados.join(", ")}). ` +
        `Para o % de cada ${filtrosUsados[0]} DENTRO de cada ${dimensoes[0]}, use agrupar_por ` +
        `[${dimensoes[0]}, ${filtrosUsados[0]}] sem esse filtro.`
      : undefined;
  return { sql, parametros, fonte, ...(aviso ? { aviso } : {}) };
}

/** Texto do catálogo para o prompt de sistema (curto: ele vai em toda volta). */
export function descreverCatalogo(): string {
  const metricas = NOMES_METRICAS.map((m) => {
    const so = "vendas" in METRICAS[m].sql ? "" : " [só loja/mes/ano]";
    return `- ${m} (${METRICAS[m].unidade}): ${METRICAS[m].descricao}${so}`;
  });
  const dimensoes = NOMES_DIMENSOES.map((d) => `- ${d}: ${DIMENSOES[d]}`);
  return `Métricas:\n${metricas.join("\n")}\nDimensões (agrupar_por / filtros):\n${dimensoes.join("\n")}`;
}
