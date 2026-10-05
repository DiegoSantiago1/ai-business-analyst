import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  casarValor,
  descreverCatalogo,
  ErroFerramenta,
  montarConsulta,
  normalizar,
} from "../src/metricas.ts";
import { VALORES } from "./apoio.ts";

const BASE = { metricas: ["faturamento"], de: "2026-09-01", ate: "2026-09-30" };

describe("montarConsulta", () => {
  test("total simples: sem GROUP BY e com tudo parametrizado", () => {
    const { sql, parametros, fonte } = montarConsulta(BASE, VALORES);
    assert.equal(fonte, "vendas");
    assert.match(sql, /FROM ia\.vendas/);
    assert.match(sql, /data BETWEEN \$1::date AND \$2::date/);
    assert.doesNotMatch(sql, /GROUP BY/);
    assert.deepEqual(parametros, ["2026-09-01", "2026-09-30", 50]);
  });

  test("agrupado: ordena pela métrica, com desempate pela dimensão", () => {
    const { sql } = montarConsulta({ ...BASE, agrupar_por: ["loja"], limite: 3 }, VALORES);
    assert.match(sql, /GROUP BY loja\nORDER BY faturamento DESC NULLS LAST, loja/);
  });

  test("série no tempo sai em ordem cronológica", () => {
    const { sql } = montarConsulta({ ...BASE, agrupar_por: ["mes"] }, VALORES);
    assert.match(sql, /ORDER BY mes\n/);
  });

  test("ordenar_por com ordem crescente", () => {
    const { sql } = montarConsulta(
      {
        ...BASE,
        metricas: ["unidades"],
        agrupar_por: ["vendedor"],
        ordenar_por: "unidades",
        ordem: "asc",
      },
      VALORES,
    );
    assert.match(sql, /ORDER BY unidades ASC NULLS LAST, vendedor/);
  });

  test("filtro casa o nome e vai como parâmetro de array", () => {
    const { sql, parametros } = montarConsulta(
      { ...BASE, filtros: { loja: ["litoral", "LOJA SERRA"] } },
      VALORES,
    );
    assert.match(sql, /loja = ANY\(\$3::text\[\]\)/);
    assert.deepEqual(parametros[2], ["Loja Litoral", "Loja Serra"]);
  });

  test("métricas de meta usam a fonte de desempenho e arredondam para o mês", () => {
    const { sql, fonte } = montarConsulta(
      {
        ...BASE,
        metricas: ["atingimento_meta_pct", "unidades"],
        agrupar_por: ["loja"],
        de: "2026-09-10",
      },
      VALORES,
    );
    assert.equal(fonte, "desempenho");
    assert.match(sql, /FROM ia\.desempenho_lojas/);
    assert.match(sql, /mes BETWEEN date_trunc\('month', \$1::date\)/);
    assert.match(sql, /sum\(unidades_vendidas\) AS unidades/);
  });

  const invalidos: [string, unknown, RegExp][] = [
    ["métrica inexistente", { ...BASE, metricas: ["lucro"] }, /metricas/],
    ["sem métrica", { ...BASE, metricas: [] }, /metricas/],
    ["dimensão com SQL", { ...BASE, agrupar_por: ["loja; DROP TABLE ia.vendas"] }, /agrupar_por/],
    ["ordem com SQL", { ...BASE, ordem: "desc; DROP TABLE x" }, /ordem/],
    ["data com SQL", { ...BASE, de: "2026-01-01'; DROP TABLE x; --" }, /de/],
    ["data impossível", { ...BASE, ate: "2026-02-30" }, /ate/],
    ["campo extra", { ...BASE, sql: "SELECT 1" }, /sql|chave|key/i],
    ["limite alto", { ...BASE, limite: 1000 }, /limite/],
    ["período invertido", { ...BASE, de: "2026-10-01" }, /invertido/],
    [
      "mistura meta com ticket",
      { ...BASE, metricas: ["atingimento_meta_pct", "ticket_medio"] },
      /meta/,
    ],
    [
      "meta por vendedor",
      { ...BASE, metricas: ["meta_unidades"], agrupar_por: ["vendedor"] },
      /vendedor/,
    ],
    ["ordenar por métrica fora da lista", { ...BASE, ordenar_por: "unidades" }, /ordenar_por/],
    ["filtro de mês", { ...BASE, filtros: { mes: ["2026-09-01"] } }, /filtros/],
    ["loja inexistente", { ...BASE, filtros: { loja: ["Boa Viagem"] } }, /não existe.*Loja Centro/],
  ];
  for (const [nome, pedido, erro] of invalidos) {
    test(`recusa: ${nome}`, () => {
      assert.throws(
        () => montarConsulta(pedido, VALORES),
        (e: unknown) => {
          assert.ok(e instanceof ErroFerramenta, String(e));
          assert.match(e.message, erro);
          return true;
        },
      );
    });
  }

  test("valor hostil nunca entra no texto do SQL", () => {
    const hostil = "Loja Centro'); DROP TABLE vendas.vendas; --";
    assert.throws(
      () => montarConsulta({ ...BASE, filtros: { loja: [hostil] } }, VALORES),
      ErroFerramenta,
    );
    const { sql } = montarConsulta({ ...BASE, filtros: { loja: ["Loja Centro"] } }, VALORES);
    assert.doesNotMatch(sql, /Loja Centro/);
  });
});

describe("casarValor", () => {
  test("ignora acento e caixa", () => {
    assert.equal(
      casarValor("cidade", "jaboatao dos guararapes", VALORES),
      "Jaboatão dos Guararapes",
    );
  });
  test("início de palavra ganha de 'contém': Ana não é Juliana", () => {
    assert.equal(casarValor("vendedor", "ana", VALORES), "Ana Paula Ribeiro");
  });
  test("parte única do nome", () => {
    assert.equal(casarValor("vendedor", "Moura", VALORES), "Rafael Moura");
  });
  test("ambíguo lista os candidatos", () => {
    assert.throws(
      () => casarValor("modelo", "HR-V", VALORES),
      /ambíguo \(HR-V EXL, HR-V Touring\)/,
    );
  });
  test("linha exata não é ambígua com prefixo de outra", () => {
    assert.equal(casarValor("linha", "city sedan", VALORES), "City Sedan");
  });
});

test("normalizar", () => {
  assert.equal(normalizar("  Jaboatão   dos  GUARARAPES "), "jaboatao dos guararapes");
});

test("catálogo para o prompt cita todas as métricas e marca as de meta", () => {
  const texto = descreverCatalogo();
  assert.match(texto, /ticket_medio \(R\$\)/);
  assert.match(texto, /atingimento_meta_pct \(%\).*\[só loja\/mes\/ano\]/);
});

test("ordenar_por aceita a dimensão agrupada", () => {
  const { sql } = montarConsulta(
    { ...BASE, agrupar_por: ["mes"], ordenar_por: "mes", ordem: "asc" },
    VALORES,
  );
  assert.match(sql, /ORDER BY mes ASC NULLS LAST, mes/);
  assert.throws(
    () => montarConsulta({ ...BASE, ordenar_por: "loja" }, VALORES),
    /metricas ou agrupar_por/,
  );
});
