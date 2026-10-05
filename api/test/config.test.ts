import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { pathToFileURL } from "node:url";
import { inspect } from "node:util";
import { type Ambiente, ConfigError, carregarConfigBanco, lerAmbiente } from "../src/config.ts";

const ENV_VALIDO: Ambiente = {
  ANALISTA_DB_HOST: "127.0.0.1",
  ANALISTA_DB_PORT: "5432",
  ANALISTA_DB_NAME: "vendas_ia",
  ANALISTA_DB_NAME_TESTE: "vendas_ia_teste",
  ANALISTA_DB_USER: "analista_dono",
  ANALISTA_IA_USER: "analista_ia",
  ANALISTA_IA_PASSWORD: "senha_ia_de_teste",
};

const OBRIGATORIAS = [
  "ANALISTA_DB_HOST",
  "ANALISTA_DB_PORT",
  "ANALISTA_DB_NAME",
  "ANALISTA_DB_NAME_TESTE",
  "ANALISTA_IA_USER",
  "ANALISTA_IA_PASSWORD",
];

function semVariavel(nome: string): Ambiente {
  const { [nome]: _removida, ...resto } = ENV_VALIDO;
  return resto;
}

describe("carregarConfigBanco", () => {
  test("config válida usa o usuário da IA e o banco principal", () => {
    const config = carregarConfigBanco(ENV_VALIDO);
    assert.equal(config.usuario, "analista_ia");
    assert.equal(config.banco, "vendas_ia");
    assert.equal(config.porta, 5432);
    assert.equal(config.senha, "senha_ia_de_teste");
  });

  test("teste: true aponta para o banco de testes", () => {
    assert.equal(carregarConfigBanco(ENV_VALIDO, { teste: true }).banco, "vendas_ia_teste");
  });

  test("a senha não aparece em log nem em JSON", () => {
    const config = carregarConfigBanco(ENV_VALIDO);
    assert.ok(!JSON.stringify(config).includes("senha_ia_de_teste"));
    assert.ok(!inspect(config).includes("senha_ia_de_teste"));
  });

  test("a config não pode ser alterada depois de carregada", () => {
    const config = carregarConfigBanco(ENV_VALIDO);
    assert.throws(() => {
      (config as { usuario: string }).usuario = "analista_dono";
    }, TypeError);
  });

  for (const nome of OBRIGATORIAS) {
    test(`falta ${nome} → erro que cita a variável`, () => {
      assert.throws(() => carregarConfigBanco(semVariavel(nome)), {
        name: "ConfigError",
        message: new RegExp(nome),
      });
    });
  }

  for (const porta of ["abc", "0", "65536", "-1", "54.5"]) {
    test(`porta inválida ${porta}`, () => {
      assert.throws(
        () => carregarConfigBanco({ ...ENV_VALIDO, ANALISTA_DB_PORT: porta }),
        /ANALISTA_DB_PORT/,
      );
    });
  }

  for (const nome of ["Vendas", "vendas-ia", "1vendas", 'x"; DROP DATABASE retail; --']) {
    test(`nome de banco inválido ${nome}`, () => {
      assert.throws(
        () => carregarConfigBanco({ ...ENV_VALIDO, ANALISTA_DB_NAME: nome }),
        ConfigError,
      );
    });
  }

  for (const usuario of ["analista_dono", "analista_leitura"]) {
    test(`usuário da IA igual a ${usuario} é recusado`, () => {
      assert.throws(
        () => carregarConfigBanco({ ...ENV_VALIDO, ANALISTA_IA_USER: usuario }),
        /nunca o dono/,
      );
    });
  }
});

describe("lerAmbiente", () => {
  test("lê o .env e deixa a variável do processo ganhar", (t) => {
    const pasta = mkdtempSync(join(tmpdir(), "analista-env-"));
    t.after(() => rmSync(pasta, { recursive: true, force: true }));
    const arquivo = join(pasta, ".env");
    writeFileSync(arquivo, "VAR_SO_NO_ARQUIVO_ANALISTA=arquivo\nPATH=do_arquivo\n");
    const env = lerAmbiente(pathToFileURL(arquivo));
    assert.equal(env.VAR_SO_NO_ARQUIVO_ANALISTA, "arquivo");
    assert.equal(env.PATH, process.env.PATH);
  });

  test("sem .env, usa só o ambiente do processo (como no CI)", () => {
    const env = lerAmbiente(pathToFileURL(join(tmpdir(), "nao-existe-analista", ".env")));
    assert.equal(env.PATH, process.env.PATH);
  });
});
