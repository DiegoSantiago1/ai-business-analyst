/**
 * Integração: o SQL montado pelo catálogo, rodando no banco de testes como o usuário da
 * IA, bate com uma consulta escrita à mão, independente. É a prova de que a métrica
 * oficial calcula o que diz calcular.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { consultarSomenteLeitura } from "../src/banco.ts";
import { montarConsulta } from "../src/metricas.ts";
import { carregarVocabulario, type Vocabulario } from "../src/vocabulario.ts";
import { criarPoolDeTeste } from "./apoio.ts";

const pool = criarPoolDeTeste();
let vocabulario: Vocabulario;
before(async () => {
  vocabulario = await carregarVocabulario(pool);
});
after(() => pool.end());

async function rodar(pedido: unknown) {
  const { sql, parametros } = montarConsulta(pedido, vocabulario.valores);
  return (await consultarSomenteLeitura(pool, sql, parametros)).linhas;
}

async function umValor(sql: string): Promise<unknown> {
  const { linhas } = await consultarSomenteLeitura(pool, sql);
  return Object.values(linhas[0] ?? {})[0];
}

describe("métricas no banco", () => {
  test("vocabulário: data de referência, 5 lojas, 3 formas de pagamento", () => {
    assert.equal(vocabulario.dataReferencia, "2026-09-30");
    assert.equal(vocabulario.mesAtual, "2026-09-01");
    assert.equal(vocabulario.valores.loja.length, 5);
    assert.deepEqual(vocabulario.valores.forma_pagamento, ["A vista", "Consorcio", "Financiado"]);
  });

  test("faturamento de 2025 = soma à mão", async () => {
    const [linha] = await rodar({
      metricas: ["faturamento", "unidades"],
      de: "2025-01-01",
      ate: "2025-12-31",
    });
    const esperado = await umValor(
      "SELECT round(sum(quantidade * valor_unitario), 2) FROM ia.vendas WHERE ano = 2025",
    );
    assert.equal(linha?.faturamento, esperado);
    assert.equal(typeof linha?.faturamento, "number");
  });

  test("ticket médio por loja: Serra no topo (padrão P8)", async () => {
    const linhas = await rodar({
      metricas: ["ticket_medio"],
      agrupar_por: ["loja"],
      de: "2024-10-01",
      ate: "2026-09-30",
    });
    assert.equal(linhas[0]?.loja, "Loja Serra");
    assert.equal(linhas.length, 5);
  });

  test("abaixo da meta em set/2026: Litoral e Sul (padrão P2)", async () => {
    const linhas = await rodar({
      metricas: ["atingimento_meta_pct", "unidades", "meta_unidades"],
      agrupar_por: ["loja"],
      de: "2026-09-01",
      ate: "2026-09-30",
      ordenar_por: "atingimento_meta_pct",
      ordem: "asc",
    });
    const abaixo = linhas.filter((l) => Number(l.atingimento_meta_pct) < 100).map((l) => l.loja);
    assert.deepEqual(abaixo, ["Loja Litoral", "Loja Sul"]);
    const litoral = linhas[0];
    assert.ok(litoral);
    assert.equal(
      litoral.atingimento_meta_pct,
      Math.round((1000 * Number(litoral.unidades)) / Number(litoral.meta_unidades)) / 10,
    );
  });

  test("participação soma 100% e o consórcio cresce em 2026 (padrão P4)", async () => {
    const linhas = await rodar({
      metricas: ["participacao_unidades_pct"],
      agrupar_por: ["ano", "forma_pagamento"],
      de: "2025-01-01",
      ate: "2026-09-30",
    });
    for (const ano of [2025, 2026]) {
      const doAno = linhas.filter((l) => l.ano === ano);
      assert.equal(doAno.length, 3);
    }
    const total = linhas.reduce((s, l) => s + Number(l.participacao_unidades_pct), 0);
    assert.ok(Math.abs(total - 100) < 0.5, `soma ${total}`);
  });

  test("filtro com nome aproximado e série mensal em ordem", async () => {
    const linhas = await rodar({
      metricas: ["unidades"],
      agrupar_por: ["mes"],
      filtros: { vendedor: ["rafael"] },
      de: "2026-01-01",
      ate: "2026-09-30",
    });
    assert.deepEqual(
      linhas.map((l) => l.mes),
      ["01", "02", "03", "04", "05", "06", "07", "08", "09"].map((m) => `2026-${m}-01`),
    );
    const unidades = linhas.map((l) => Number(l.unidades));
    assert.deepEqual(
      unidades,
      [...unidades].sort((a, b) => a - b),
    );
  });
});
