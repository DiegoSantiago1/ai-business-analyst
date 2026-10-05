/**
 * Pool de conexões do PostgreSQL, sempre com o usuário somente leitura da IA, e o
 * executor que TODA consulta da IA usa (métricas e SQL livre).
 */
import pg from "pg";
import type { ConfigBanco } from "./config.ts";

// Abaixo do CONNECTION LIMIT 5 do usuário da IA (db/bootstrap.sql): sobra folga para
// os testes e para um psql de diagnóstico.
export const MAX_CONEXOES = 3;
export const TEMPO_MAXIMO_MS = 3_000;

// Conversão de tipos do PostgreSQL para JSON:
// - NUMERIC e BIGINT viram number (o pg devolve texto para não perder precisão; os
//   valores daqui, até centenas de milhões de reais, cabem com folga num double);
// - DATE e TIMESTAMPTZ ficam como TEXTO, do jeito que o banco formata no fuso de Recife.
//   Converter para Date do JavaScript mudaria o dia perto da meia-noite (UTC).
const OID = { INT8: 20, NUMERIC: 1700, DATE: 1082, TIMESTAMP: 1114, TIMESTAMPTZ: 1184 };
const texto = (valor: string) => valor;
const tipos = {
  getTypeParser(oid: number, formato?: string) {
    if (oid === OID.INT8 || oid === OID.NUMERIC) return Number.parseFloat;
    if (oid === OID.DATE || oid === OID.TIMESTAMP || oid === OID.TIMESTAMPTZ) return texto;
    // biome-ignore lint/suspicious/noExplicitAny: assinatura sobrecarregada do pg-types
    return pg.types.getTypeParser(oid, formato as any);
  },
};

export function criarPool(config: ConfigBanco): pg.Pool {
  return new pg.Pool({
    host: config.host,
    port: config.porta,
    database: config.banco,
    user: config.usuario,
    password: config.senha,
    // Banco gerenciado (Neon): TLS com verificação do certificado (CA pública).
    ...(config.ssl ? { ssl: { rejectUnauthorized: true } } : {}),
    max: MAX_CONEXOES,
    // Banco fora do ar: falha em 5 s com erro claro, em vez de esperar o sistema.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    // Aparece em pg_stat_activity: dá para ver quais conexões são da API.
    application_name: "ai-business-analyst-api",
    types: tipos,
  });
}

export interface ResultadoConsulta {
  colunas: string[];
  linhas: Record<string, unknown>[];
  duracaoMs: number;
}

/**
 * Executa UMA consulta com as camadas 2 e 3 da defesa (D6):
 * - protocolo estendido (queryMode "extended"): o PostgreSQL aceita um comando só, mesmo
 *   que o texto tenha "; DROP ..." no meio;
 * - transação READ ONLY com statement_timeout local de 3 s.
 * A camada 4 (o usuário só tem SELECT nas views) vale por baixo de tudo isso.
 */
export async function consultarSomenteLeitura(
  pool: pg.Pool,
  sql: string,
  parametros: unknown[] = [],
  tempoMaximoMs: number = TEMPO_MAXIMO_MS,
): Promise<ResultadoConsulta> {
  const inicio = performance.now();
  const cliente = await pool.connect();
  // Se nem o ROLLBACK funcionar, a conexão está em estado desconhecido: é descartada
  // em vez de voltar ao pool (release(true)).
  let descartar = false;
  try {
    await cliente.query("BEGIN READ ONLY");
    // SET não aceita parâmetro: o valor é um inteiro nosso, nunca texto de fora.
    await cliente.query(`SET LOCAL statement_timeout = ${Math.trunc(tempoMaximoMs)}`);
    // O pg aceita queryMode (node_modules/pg/lib/query.js), mas o @types/pg não declara.
    const consulta: pg.QueryConfig & { queryMode: "extended" } = {
      text: sql,
      values: parametros,
      queryMode: "extended",
    };
    const resultado = await cliente.query(consulta);
    await cliente.query("COMMIT");
    return {
      colunas: resultado.fields.map((f) => f.name),
      linhas: resultado.rows,
      duracaoMs: Math.round(performance.now() - inicio),
    };
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => {
      descartar = true;
    });
    throw erro;
  } finally {
    cliente.release(descartar);
  }
}
