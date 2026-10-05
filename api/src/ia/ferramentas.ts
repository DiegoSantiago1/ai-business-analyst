/**
 * As ferramentas que a IA pode chamar: definição (o que o modelo vê) e execução.
 *
 * - consultar_metrica: caminho principal, métricas oficiais (D5);
 * - descrever_tabelas: colunas e descrições das views do schema ia (lidas do banco);
 * - executar_sql: reserva para o que o catálogo não cobre, atrás das travas (D6);
 * - responder: a resposta final, estruturada (validada em resposta.ts).
 *
 * Os esquemas JSON são escritos à mão, curtos: eles vão ao modelo em TODA volta, e cada
 * token conta no limite do plano gratuito.
 */
import type pg from "pg";
import { consultarSomenteLeitura, type ResultadoConsulta } from "../banco.ts";
import {
  DIMENSOES_FILTRAVEIS,
  ErroFerramenta,
  montarConsulta,
  NOMES_DIMENSOES,
  NOMES_METRICAS,
} from "../metricas.ts";
import type { Vocabulario } from "../vocabulario.ts";
import type { DefinicaoFerramenta } from "./provedor.ts";
import { MAX_LINHAS, prepararSqlLivre } from "./sql-livre.ts";

/** Linhas de cada resultado que vão para o modelo (o resto fica só na tela). */
export const LINHAS_PARA_O_MODELO = 40;

const lista = (itens: readonly string[]) => ({
  type: "array",
  items: { type: "string", enum: itens },
});
const textos = { type: "array", items: { type: "string" } };

export const FERRAMENTAS: DefinicaoFerramenta[] = [
  {
    type: "function",
    function: {
      name: "consultar_metrica",
      description:
        "Calcula métricas oficiais de vendas no período (datas inclusivas). Caminho preferido.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["metricas", "de", "ate"],
        properties: {
          metricas: { ...lista(NOMES_METRICAS), minItems: 1, maxItems: 4 },
          agrupar_por: { ...lista(NOMES_DIMENSOES), maxItems: 2 },
          de: { type: "string", description: "AAAA-MM-DD" },
          ate: { type: "string", description: "AAAA-MM-DD" },
          filtros: {
            type: "object",
            additionalProperties: false,
            description: 'Ex.: {"loja":["Loja Sul"],"forma_pagamento":["Consorcio"]}',
            properties: Object.fromEntries(DIMENSOES_FILTRAVEIS.map((d) => [d, textos])),
          },
          ordenar_por: { type: "string", enum: [...NOMES_METRICAS, ...NOMES_DIMENSOES] },
          ordem: { type: "string", enum: ["desc", "asc"] },
          limite: { type: "integer", minimum: 1, maximum: 100 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "descrever_tabelas",
      description: "Colunas e descrições das views do schema ia (use antes de executar_sql).",
      parameters: { type: "object", additionalProperties: false, properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "executar_sql",
      description:
        "Reserva: um SELECT (PostgreSQL) nas views do schema ia, para o que o catálogo não cobre.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["sql"],
        properties: { sql: { type: "string" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "responder",
      description: "Resposta final ao gerente. Chame sempre no fim.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["resposta"],
        properties: {
          resposta: { type: "string", description: "1 a 4 frases, em português" },
          numeros: {
            type: "array",
            // Sem maxItems: o Groq recusaria a chamada inteira (medido: o modelo quis 12
            // números numa série mensal). A API corta em 12 (resposta.ts).
            description: "Números citados, copiados exatamente das ferramentas",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["rotulo", "valor", "unidade"],
              properties: {
                rotulo: { type: "string" },
                valor: { type: "number" },
                unidade: { type: "string", enum: ["R$", "unidades", "vendas", "%", "outro"] },
              },
            },
          },
          grafico: {
            type: "object",
            additionalProperties: false,
            description: "Gráfico do resultado da última consulta (x e y = nomes de colunas)",
            required: ["tipo"],
            properties: {
              tipo: { type: "string", enum: ["barra", "linha", "nenhum"] },
              x: { type: "string" },
              y: { type: "string" },
            },
          },
          // null aceito: o 120b manda "limitacoes": null, e o Groq recusaria a chamada inteira.
          limitacoes: { type: ["string", "null"], description: "Ressalvas, se houver" },
        },
      },
    },
  },
];

// --------------------------------------------------------------------------- execução

export interface Passo {
  ferramenta: string;
  argumentos: unknown;
  sql?: string;
  parametros?: unknown[];
  colunas?: string[];
  linhas?: Record<string, unknown>[];
  totalLinhas?: number;
  truncado?: boolean;
  erro?: string;
  aviso?: string;
  duracaoMs: number;
}

export interface Contexto {
  pool: pg.Pool;
  vocabulario: Vocabulario;
  /** Cache da descrição das views (muda só com migration). */
  descricaoTabelas?: string;
}

const SQL_DESCRICAO = `
SELECT c.table_name AS tabela,
       obj_description(format('ia.%I', c.table_name)::regclass, 'pg_class') AS sobre_tabela,
       c.column_name AS coluna,
       c.data_type AS tipo,
       col_description(format('ia.%I', c.table_name)::regclass, c.ordinal_position) AS sobre
FROM information_schema.columns c
WHERE c.table_schema = 'ia'
ORDER BY c.table_name, c.ordinal_position`;

async function descreverTabelas(contexto: Contexto): Promise<string> {
  if (contexto.descricaoTabelas) return contexto.descricaoTabelas;
  const { linhas } = await consultarSomenteLeitura(contexto.pool, SQL_DESCRICAO);
  const blocos = new Map<string, string[]>();
  for (const l of linhas) {
    const tabela = `ia.${l.tabela}${l.sobre_tabela ? ` — ${l.sobre_tabela}` : ""}`;
    const coluna = `  ${l.coluna} (${l.tipo})${l.sobre ? `: ${l.sobre}` : ""}`;
    blocos.set(tabela, [...(blocos.get(tabela) ?? []), coluna]);
  }
  contexto.descricaoTabelas = [...blocos].map(([t, cs]) => `${t}\n${cs.join("\n")}`).join("\n");
  return contexto.descricaoTabelas;
}

function lerArgumentos(texto: string): Record<string, unknown> {
  try {
    const valor: unknown = JSON.parse(texto || "{}");
    if (valor && typeof valor === "object" && !Array.isArray(valor))
      return valor as Record<string, unknown>;
  } catch {
    // cai no erro abaixo
  }
  throw new ErroFerramenta("Argumentos não são um objeto JSON válido.");
}

function comoPasso(
  ferramenta: string,
  argumentos: unknown,
  sql: string,
  parametros: unknown[],
  r: ResultadoConsulta,
): Passo {
  const truncado = r.linhas.length > MAX_LINHAS;
  const linhas = truncado ? r.linhas.slice(0, MAX_LINHAS) : r.linhas;
  return {
    ferramenta,
    argumentos,
    sql,
    parametros,
    colunas: r.colunas,
    linhas,
    totalLinhas: linhas.length,
    truncado,
    duracaoMs: r.duracaoMs,
  };
}

/** Mensagem curta de erro do banco para a IA (sem detalhes internos do servidor). */
function erroDoBanco(erro: unknown): string {
  const e = erro as { code?: string; message?: string };
  if (e.code === "57014") return "Consulta cancelada: passou do tempo máximo (3 s).";
  if (e.code === "42501") return "Sem permissão: a IA só lê as views do schema ia.";
  if (e.code === "25006") return "Recusado: a conexão é somente leitura.";
  if (e.code?.startsWith("42")) return `Erro no SQL: ${e.message ?? "sintaxe inválida"}`;
  if (e.code?.startsWith("22")) return `Erro nos dados: ${e.message ?? "valor inválido"}`;
  return "Erro ao consultar o banco.";
}

/** Executa uma ferramenta de consulta. Erros esperados viram Passo com `erro`. */
export async function executarFerramenta(
  nome: string,
  textoArgumentos: string,
  contexto: Contexto,
): Promise<Passo> {
  const inicio = performance.now();
  const duracao = () => Math.round(performance.now() - inicio);
  let argumentos: unknown = textoArgumentos;
  try {
    argumentos = lerArgumentos(textoArgumentos);
    const args = argumentos as Record<string, unknown>;
    if (nome === "consultar_metrica") {
      const { sql, parametros, aviso } = montarConsulta(args, contexto.vocabulario.valores);
      const r = await consultarSomenteLeitura(contexto.pool, sql, parametros);
      return { ...comoPasso(nome, argumentos, sql, parametros, r), ...(aviso ? { aviso } : {}) };
    }
    if (nome === "executar_sql") {
      const sql = prepararSqlLivre(args.sql);
      const r = await consultarSomenteLeitura(contexto.pool, sql);
      return comoPasso(nome, argumentos, sql, [], r);
    }
    if (nome === "descrever_tabelas") {
      const texto = await descreverTabelas(contexto);
      return { ferramenta: nome, argumentos, linhas: [{ descricao: texto }], duracaoMs: duracao() };
    }
    throw new ErroFerramenta(`Ferramenta "${nome}" não existe.`);
  } catch (erro) {
    const mensagem = erro instanceof ErroFerramenta ? erro.message : erroDoBanco(erro);
    return { ferramenta: nome, argumentos, erro: mensagem, duracaoMs: duracao() };
  }
}

/** O que volta para o modelo: compacto (linhas como listas) e limitado. */
export function resultadoParaModelo(passo: Passo): string {
  if (passo.erro) return JSON.stringify({ erro: passo.erro });
  if (passo.ferramenta === "descrever_tabelas") return String(passo.linhas?.[0]?.descricao ?? "");
  const colunas = passo.colunas ?? [];
  const linhas = (passo.linhas ?? [])
    .slice(0, LINHAS_PARA_O_MODELO)
    .map((l) => colunas.map((c) => l[c]));
  const total = passo.totalLinhas ?? 0;
  return JSON.stringify({
    colunas,
    linhas,
    total_linhas: total,
    ...(total > LINHAS_PARA_O_MODELO
      ? { aviso: `mostrando ${LINHAS_PARA_O_MODELO} de ${total}` }
      : {}),
    ...(passo.truncado ? { aviso_corte: `resultado cortado em ${MAX_LINHAS} linhas` } : {}),
    ...(passo.aviso ? { atencao: passo.aviso } : {}),
  });
}
