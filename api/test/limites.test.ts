import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Fila, FilaCheia, LimitePorIp, OrcamentoDiario } from "../src/servidor/limites.ts";

describe("LimitePorIp", () => {
  test("janela deslizante por IP", () => {
    let agora = 0;
    const limite = new LimitePorIp(2, 60_000, () => agora);
    assert.equal(limite.consumir("a"), 0);
    assert.equal(limite.consumir("a"), 0);
    assert.equal(limite.consumir("a"), 60);
    assert.equal(limite.consumir("b"), 0, "outro IP não é afetado");
    agora = 45_000;
    assert.equal(limite.consumir("a"), 15);
    agora = 60_001;
    assert.equal(limite.consumir("a"), 0);
  });
});

describe("OrcamentoDiario", () => {
  test("esgota no teto e zera na virada do dia UTC", () => {
    let agora = Date.parse("2026-10-05T23:59:00Z");
    const orcamento = new OrcamentoDiario(1_000, 900, () => agora);
    assert.equal(orcamento.esgotado(), false);
    orcamento.registrar(100);
    assert.equal(orcamento.esgotado(), true);
    assert.equal(orcamento.segundosAteReiniciar(), 60);
    agora = Date.parse("2026-10-06T00:00:01Z");
    assert.equal(orcamento.gasto, 0);
    assert.equal(orcamento.esgotado(), false);
  });
});

describe("Fila", () => {
  test("executa uma por vez, na ordem", async () => {
    const fila = new Fila(5);
    const ordem: string[] = [];
    let soltar: () => void = () => {};
    const primeira = fila.executar(
      () =>
        new Promise<void>((r) => {
          ordem.push("1 começou");
          soltar = () => {
            ordem.push("1 terminou");
            r();
          };
        }),
    );
    const segunda = fila.executar(async () => {
      ordem.push("2 começou");
    });
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(ordem, ["1 começou"]);
    soltar();
    await Promise.all([primeira, segunda]);
    assert.deepEqual(ordem, ["1 começou", "1 terminou", "2 começou"]);
  });

  test("um erro não trava a fila", async () => {
    const fila = new Fila(5);
    await assert.rejects(fila.executar(async () => Promise.reject(new Error("x"))));
    assert.equal(await fila.executar(async () => 42), 42);
  });

  test("fila cheia recusa na hora", async () => {
    const fila = new Fila(1);
    const presa = fila.executar(() => new Promise((r) => setTimeout(r, 20)));
    await assert.rejects(
      fila.executar(async () => 1),
      FilaCheia,
    );
    await presa;
    assert.equal(fila.esperando, 0);
  });
});

describe("Registro", () => {
  test("soma os tokens de hoje por modelo e ignora linha corrompida", async (t) => {
    const { mkdtempSync, rmSync, appendFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const { Registro } = await import("../src/servidor/registro.ts");
    const pasta = mkdtempSync(join(tmpdir(), "analista-reg-"));
    t.after(() => rmSync(pasta, { recursive: true, force: true }));
    const agora = () => Date.parse("2026-10-05T12:00:00Z");
    const registro = new Registro(pasta, agora);
    await registro.gravar({ pergunta: "a", modelo: "m1", tokensTotal: 100, latenciaMs: 1 });
    await registro.gravar({ pergunta: "b", modelo: "m2", tokensTotal: 50, latenciaMs: 1 });
    appendFileSync(join(pasta, "perguntas-2026-10-05.jsonl"), "{quebrada\n");
    assert.equal(await registro.tokensDeHoje("m1"), 100);
    assert.equal(await registro.tokensDeHoje(), 150);
  });
});

describe("OrcamentoPorModelo", () => {
  test("cada modelo tem o seu teto; esgotar vale até a virada do dia", async () => {
    const { OrcamentoPorModelo } = await import("../src/servidor/limites.ts");
    let agora = Date.parse("2026-10-05T23:00:00Z");
    const o = new OrcamentoPorModelo(1_000, { a: 900 }, () => agora);
    assert.equal(o.disponivel("a"), true);
    o.registrar("a", 100);
    assert.equal(o.disponivel("a"), false);
    assert.equal(o.disponivel("b"), true);
    o.esgotar("b");
    assert.equal(o.disponivel("b"), false);
    agora = Date.parse("2026-10-06T00:00:01Z");
    assert.equal(o.disponivel("a"), true);
    assert.equal(o.disponivel("b"), true);
  });
});
