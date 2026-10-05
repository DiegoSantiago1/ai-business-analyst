import assert from "node:assert/strict";
import { test } from "node:test";
import { blocos, pedacos } from "../src/texto.ts";

test("negrito e asterisco sem par", () => {
  assert.deepEqual(pedacos("a **b** c"), [
    { texto: "a ", negrito: false },
    { texto: "b", negrito: true },
    { texto: " c", negrito: false },
  ]);
  assert.deepEqual(pedacos("2 * 3 = **6"), [{ texto: "2 * 3 = **6", negrito: false }]);
});

test("parágrafos e tópicos agrupados", () => {
  const texto =
    "**Duas lojas abaixo da meta.**\n- Litoral: 72,1%\n- Sul: 96,3%\n\nSugestão: olhar por vendedor.";
  const r = blocos(texto);
  assert.equal(r.length, 3);
  assert.equal(r[0]?.tipo, "paragrafo");
  assert.equal(r[1]?.tipo, "lista");
  assert.equal(r[1]?.tipo === "lista" ? r[1].itens.length : 0, 2);
  assert.equal(r[2]?.tipo, "paragrafo");
});

test("texto hostil continua texto (nada vira HTML)", () => {
  const r = blocos("O cliente foi <script>alert('x')</script>.");
  assert.deepEqual(r, [
    {
      tipo: "paragrafo",
      pedacos: [{ texto: "O cliente foi <script>alert('x')</script>.", negrito: false }],
    },
  ]);
});

test("tópicos numerados e com •", () => {
  const r = blocos("1. um\n2) dois\n• três");
  assert.equal(r.length, 1);
  assert.equal(r[0]?.tipo === "lista" ? r[0].itens.length : 0, 3);
});
