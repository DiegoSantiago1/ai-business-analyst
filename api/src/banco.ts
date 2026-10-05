/**
 * Pool de conexões do PostgreSQL, sempre com o usuário somente leitura da IA.
 */
import pg from "pg";
import type { ConfigBanco } from "./config.ts";

// Abaixo do CONNECTION LIMIT 5 do usuário da IA (db/bootstrap.sql): sobra folga para
// os testes e para um psql de diagnóstico.
export const MAX_CONEXOES = 3;

export function criarPool(config: ConfigBanco): pg.Pool {
  return new pg.Pool({
    host: config.host,
    port: config.porta,
    database: config.banco,
    user: config.usuario,
    password: config.senha,
    max: MAX_CONEXOES,
    // Banco fora do ar: falha em 5 s com erro claro, em vez de esperar o sistema.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    // Aparece em pg_stat_activity: dá para ver quais conexões são da API.
    application_name: "ai-business-analyst-api",
  });
}
