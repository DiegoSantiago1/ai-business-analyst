import assert from "node:assert/strict";
import { test } from "node:test";
import {
  conferir,
  esquemaResposta,
  inferirGrafico,
  numeroDeTexto,
  validarGrafico,
} from "../src/ia/resposta.ts";

const BASE = { resposta: "ok", numeros: [] };

test("gráfico como objeto, como tipo em texto ou como JSON em texto", () => {
  const objeto = esquemaResposta.parse({
    ...BASE,
    grafico: { tipo: "barra", x: "loja", y: "unidades" },
  });
  const tipo = esquemaResposta.parse({ ...BASE, grafico: "nenhum" });
  const json = esquemaResposta.parse({
    ...BASE,
    grafico: '{ "tipo":"linha", "x":"mes", "y":"faturamento" }',
  });
  assert.deepEqual(objeto.grafico, { tipo: "barra", x: "loja", y: "unidades" });
  assert.deepEqual(tipo.grafico, { tipo: "nenhum" });
  assert.deepEqual(json.grafico, { tipo: "linha", x: "mes", y: "faturamento" });
});

test("gráfico inválido continua recusado", () => {
  assert.equal(esquemaResposta.safeParse({ ...BASE, grafico: "pizza" }).success, false);
  assert.equal(esquemaResposta.safeParse({ ...BASE, grafico: "{quebrado" }).success, false);
  assert.equal(
    esquemaResposta.safeParse({ ...BASE, grafico: { tipo: "barra", sql: "x" } }).success,
    false,
  );
});

test("resposta vazia, número não finito e campo extra são recusados", () => {
  assert.equal(esquemaResposta.safeParse({ resposta: " ", numeros: [] }).success, false);
  assert.equal(
    esquemaResposta.safeParse({
      ...BASE,
      numeros: [{ rotulo: "x", valor: Number.NaN, unidade: "R$" }],
    }).success,
    false,
  );
  assert.equal(esquemaResposta.safeParse({ ...BASE, comando: "DROP" }).success, false);
});

test("conferir: tolerância de arredondamento", () => {
  assert.ok(conferir(71.4, [71.43]));
  assert.ok(conferir(45_412_345.67, [45_412_345.67]));
  assert.ok(!conferir(94, [93]));
  assert.ok(!conferir(45_000_000, [45_412_345.67]));
});

test("validarGrafico exige colunas existentes, y numérico e 2 linhas", () => {
  const tabela = {
    colunas: ["loja", "unidades"],
    linhas: [
      { loja: "A", unidades: 1 },
      { loja: "B", unidades: 2 },
    ],
    sql: "",
    truncado: false,
  };
  assert.deepEqual(validarGrafico({ tipo: "barra", x: "loja", y: "unidades" }, tabela), {
    tipo: "barra",
    x: "loja",
    y: "unidades",
  });
  assert.equal(validarGrafico({ tipo: "barra", x: "unidades", y: "loja" }, tabela), undefined);
  assert.equal(validarGrafico({ tipo: "nenhum" }, tabela), undefined);
  assert.equal(
    validarGrafico(
      { tipo: "linha", x: "loja", y: "unidades" },
      { ...tabela, linhas: [tabela.linhas[0] ?? {}] },
    ),
    undefined,
  );
});

test("numeros é opcional (resposta sem número)", () => {
  assert.deepEqual(esquemaResposta.parse({ resposta: "O cliente foi Fulano." }).numeros, []);
});

test("inferirGrafico: só nos casos óbvios", () => {
  const tabela = (colunas: string[], linhas: Record<string, unknown>[]) => ({
    colunas,
    linhas,
    sql: "",
    truncado: false,
  });
  const lojas = tabela(
    ["loja", "unidades"],
    [
      { loja: "A", unidades: 1 },
      { loja: "B", unidades: 2 },
    ],
  );
  assert.deepEqual(inferirGrafico(lojas), { tipo: "barra", x: "loja", y: "unidades" });
  const meses = tabela(
    ["mes", "faturamento"],
    [
      { mes: "2026-01-01", faturamento: 1 },
      { mes: "2026-02-01", faturamento: 2 },
    ],
  );
  assert.deepEqual(inferirGrafico(meses), { tipo: "linha", x: "mes", y: "faturamento" });
  const anos = tabela(
    ["ano", "unidades"],
    [
      { ano: 2025, unidades: 1 },
      { ano: 2026, unidades: 2 },
    ],
  );
  assert.deepEqual(inferirGrafico(anos), { tipo: "barra", x: "ano", y: "unidades" });
  const duasDimensoes = tabela(
    ["ano", "loja", "unidades"],
    [
      { ano: 2025, loja: "A", unidades: 1 },
      { ano: 2026, loja: "A", unidades: 2 },
    ],
  );
  assert.equal(inferirGrafico(duasDimensoes), undefined);
  assert.equal(inferirGrafico(tabela(["unidades"], [{ unidades: 1 }])), undefined);
  assert.equal(inferirGrafico(undefined), undefined);
});

test("numeros: texto numérico vira número; data e texto saem do cartão", () => {
  const r = esquemaResposta.parse({
    resposta: "ok",
    numeros: [
      { rotulo: "a", valor: "72,1", unidade: "%" },
      { rotulo: "b", valor: "1.234", unidade: "unidades" },
      { rotulo: "c", valor: "2026-03-31", unidade: "outro" },
      { rotulo: "d", valor: "Carlos Lima", unidade: "outro" },
      { rotulo: "e", valor: 5, unidade: "vendas" },
    ],
  });
  assert.deepEqual(
    r.numeros.map((n) => [n.rotulo, n.valor]),
    [
      ["a", 72.1],
      ["b", 1234],
      ["e", 5],
    ],
  );
});

test("numeroDeTexto", () => {
  assert.equal(numeroDeTexto("R$ 1.234,56"), 1234.56);
  assert.equal(numeroDeTexto("7.5"), 7.5);
  assert.equal(numeroDeTexto("31/03/2026"), undefined);
});
