import assert from "node:assert/strict";
import { test } from "node:test";
import { ErroCotaEsgotada, type PedidoIA, type ProvedorIA } from "../src/ia/provedor.ts";
import { ProvedorComReserva } from "../src/ia/reserva.ts";

const PEDIDO: PedidoIA = { mensagens: [], ferramentas: [], escolha: "required" };

function provedor(modelo: string, comportamento: "ok" | "cota") {
  const chamadas: string[] = [];
  const p: ProvedorIA = {
    modelo,
    completar: async () => {
      chamadas.push(modelo);
      if (comportamento === "cota") throw new ErroCotaEsgotada("TPD");
      return { mensagem: { content: "ok" }, modelo, uso: { entrada: 1, saida: 1, total: 2 } };
    },
  };
  return { p, chamadas };
}

test("usa o principal enquanto há cota", async () => {
  const a = provedor("120b", "ok");
  const b = provedor("20b", "ok");
  const r = await new ProvedorComReserva(
    a.p,
    b.p,
    () => true,
    () => {},
  ).completar(PEDIDO);
  assert.equal(r.modelo, "120b");
  assert.deepEqual(b.chamadas, []);
});

test("cota do principal acabou no provedor: marca esgotado e segue no reserva", async () => {
  const a = provedor("120b", "cota");
  const b = provedor("20b", "ok");
  const esgotados: string[] = [];
  const disponivel = (m: string) => !esgotados.includes(m);
  const provedorReserva = new ProvedorComReserva(a.p, b.p, disponivel, (m) => esgotados.push(m));
  assert.equal(provedorReserva.modelo, "120b");
  const r = await provedorReserva.completar(PEDIDO);
  assert.equal(r.modelo, "20b");
  assert.deepEqual(esgotados, ["120b"]);
  assert.equal(provedorReserva.modelo, "20b");
  await provedorReserva.completar(PEDIDO);
  assert.deepEqual(a.chamadas, ["120b"], "não insiste no principal esgotado");
});

test("nosso orçamento do principal acabou: nem chama o principal", async () => {
  const a = provedor("120b", "ok");
  const b = provedor("20b", "ok");
  const r = await new ProvedorComReserva(
    a.p,
    b.p,
    (m) => m !== "120b",
    () => {},
  ).completar(PEDIDO);
  assert.equal(r.modelo, "20b");
  assert.deepEqual(a.chamadas, []);
});

test("os dois esgotados: ErroCotaEsgotada", async () => {
  const a = provedor("120b", "cota");
  const b = provedor("20b", "cota");
  const esgotados: string[] = [];
  const p = new ProvedorComReserva(
    a.p,
    b.p,
    (m) => !esgotados.includes(m),
    (m) => esgotados.push(m),
  );
  await assert.rejects(p.completar(PEDIDO), ErroCotaEsgotada);
  assert.deepEqual(esgotados, ["120b", "20b"]);
  await assert.rejects(p.completar(PEDIDO), /dois modelos/);
});
