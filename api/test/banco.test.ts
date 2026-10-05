/**
 * Integração: a API conecta ao banco de TESTES como o usuário da IA, e o próprio
 * PostgreSQL barra qualquer escrita. Precisa do Docker e do banco já migrado
 * (o pytest migra o banco de testes; ou: python -m analista.migracoes teste).
 */
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import type { DatabaseError } from "pg";
import { MAX_CONEXOES } from "../src/banco.ts";
import { criarPoolDeTeste } from "./apoio.ts";

const pool = criarPoolDeTeste();
after(() => pool.end());

// Códigos SQLSTATE do PostgreSQL.
const TRANSACAO_SOMENTE_LEITURA = "25006";
const SEM_PRIVILEGIO = "42501";

function codigo(erro: unknown): string | undefined {
  return (erro as DatabaseError).code;
}

describe("conexão da API", () => {
  test("conecta como o usuário da IA, em transação somente leitura", async () => {
    const { rows } = await pool.query(
      "SELECT current_user AS usuario, current_setting('transaction_read_only') AS ro",
    );
    assert.deepEqual(rows, [{ usuario: "analista_ia", ro: "on" }]);
  });

  test("o pool nunca passa do limite de conexões do usuário da IA", async () => {
    const { rows } = await pool.query(
      "SELECT rolconnlimit FROM pg_roles WHERE rolname = current_user",
    );
    assert.ok(MAX_CONEXOES < rows[0].rolconnlimit);
  });

  test("escrita é barrada pela transação somente leitura", async () => {
    await assert.rejects(pool.query("CREATE TABLE ia.invasora (id int)"), (erro) => {
      assert.equal(codigo(erro), TRANSACAO_SOMENTE_LEITURA);
      return true;
    });
  });

  test("mesmo desligando o somente leitura, o banco barra por privilégio", async () => {
    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN READ WRITE");
      await assert.rejects(cliente.query("CREATE TABLE ia.invasora (id int)"), (erro) => {
        assert.equal(codigo(erro), SEM_PRIVILEGIO);
        return true;
      });
    } finally {
      await cliente.query("ROLLBACK");
      cliente.release();
    }
  });

  test("protocolo estendido (consulta com parâmetro) recusa dois comandos", async () => {
    // Camada 2 da defesa (D6): com parâmetros, o pg usa o protocolo estendido, que
    // aceita um comando só. O segundo comando nem chega a ser executado.
    await assert.rejects(pool.query("SELECT $1::int; SELECT 2", [1]), /multiple commands/i);
  });
});
