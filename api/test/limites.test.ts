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
