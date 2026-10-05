/**
 * API HTTP de ponta a ponta: servidor de verdade numa porta livre, banco de testes, IA
 * falsa. Confere contrato, códigos de erro e as proteções de uso.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import type { Contexto } from "../src/ia/ferramentas.ts";
import { ErroCotaEsgotada, type ProvedorIA } from "../src/ia/provedor.ts";
import { criarApp } from "../src/servidor/app.ts";
import { Fila, LimitePorIp, OrcamentoPorModelo } from "../src/servidor/limites.ts";
import { Registro } from "../src/servidor/registro.ts";
import { carregarVocabulario } from "../src/vocabulario.ts";
import { criarPoolDeTeste } from "./apoio.ts";
import { chamar, IAFalsa } from "./ia-falsa.ts";

const pool = criarPoolDeTeste();
const pasta = mkdtempSync(join(tmpdir(), "analista-registro-"));
let contexto: Contexto;
before(async () => {
  contexto = { pool, vocabulario: await carregarVocabulario(pool) };
});
after(async () => {
  await pool.end();
  rmSync(pasta, { recursive: true, force: true });
});

async function subir(provedor: ProvedorIA, opcoes: { teto?: number; porMinuto?: number } = {}) {
  const orcamento = new OrcamentoPorModelo(opcoes.teto ?? 100_000);
  const app = criarApp({
    provedor,
    contexto,
    limitePorIp: new LimitePorIp(opcoes.porMinuto ?? 10),
    orcamento,
    modelos: [provedor.modelo],
    registro: new Registro(pasta),
    fila: new Fila(3),
  });
  const servidor = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolver) => servidor.once("listening", () => resolver()));
  const { port } = servidor.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  const post = (corpo: unknown) =>
    fetch(`${url}/api/perguntar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
    });
  return { url, post, orcamento, fechar: () => new Promise((r) => servidor.close(r)) };
}

const RESPONDE_OK = () => chamar("responder", { resposta: "Tudo certo.", numeros: [] });

describe("POST /api/perguntar", () => {
  test("responde, registra e soma os tokens no orçamento do dia", async () => {
    const api = await subir(
      new IAFalsa([
        chamar("consultar_metrica", {
          metricas: ["unidades"],
          de: "2026-09-01",
          ate: "2026-09-30",
        }),
        chamar("responder", {
          resposta: "283 unidades.",
          numeros: [{ rotulo: "Unidades", valor: 283, unidade: "unidades" }],
        }),
      ]),
    );
    const r = await api.post({ pergunta: "Quantos carros vendemos este mês?" });
    assert.equal(r.status, 200);
    const corpo = await r.json();
    assert.equal(corpo.resposta, "283 unidades.");
    assert.equal(corpo.numeros[0].conferido, true);
    assert.equal(corpo.tabela.sql.includes("FROM ia.vendas"), true);
    assert.equal(api.orcamento.gasto("ia-falsa"), 2200);
    const registro = readFileSync(
      join(pasta, `perguntas-${new Date().toISOString().slice(0, 10)}.jsonl`),
      "utf8",
    );
    assert.match(registro, /"pergunta":"Quantos carros vendemos este mês\?".*"tokensTotal":2200/);
    await api.fechar();
  });

  for (const [nome, corpo] of [
    ["pergunta curta", { pergunta: "oi" }],
    ["pergunta longa", { pergunta: "x".repeat(501) }],
    ["campo extra", { pergunta: "Quanto vendemos?", sql: "DROP TABLE x" }],
    [
      "histórico grande",
      { pergunta: "Quanto vendemos?", historico: Array(4).fill({ pergunta: "a", resposta: "b" }) },
    ],
    ["JSON quebrado", "{pergunta:"],
  ] as const) {
    test(`400 entrada_invalida: ${nome}`, async () => {
      const api = await subir(new IAFalsa([]));
      const r = await api.post(corpo);
      assert.equal(r.status, 400);
      assert.equal((await r.json()).erro, "entrada_invalida");
      await api.fechar();
    });
  }

  test("429 limite_por_ip na pergunta além do limite", async () => {
    const api = await subir(new IAFalsa([RESPONDE_OK(), RESPONDE_OK()]), { porMinuto: 2 });
    assert.equal((await api.post({ pergunta: "Pergunta 1" })).status, 200);
    assert.equal((await api.post({ pergunta: "Pergunta 2" })).status, 200);
    const r = await api.post({ pergunta: "Pergunta 3" });
    assert.equal(r.status, 429);
    const corpo = await r.json();
    assert.equal(corpo.erro, "limite_por_ip");
    assert.ok(corpo.tentarEmSegundos > 0);
    await api.fechar();
  });

  test("503 cota_esgotada quando o orçamento do dia acabou (sem chamar a IA)", async () => {
    const ia = new IAFalsa([]);
    const api = await subir(ia, { teto: 1 });
    api.orcamento.registrar("ia-falsa", 5);
    const r = await api.post({ pergunta: "Quanto vendemos?" });
    assert.equal(r.status, 503);
    const corpo = await r.json();
    assert.equal(corpo.erro, "cota_esgotada");
    assert.match(corpo.mensagem, /perguntas de hoje acabaram/);
    assert.equal(ia.pedidos.length, 0);
    await api.fechar();
  });

  test("503 cota_esgotada quando o provedor diz que a cota diária acabou", async () => {
    const provedor: ProvedorIA = {
      modelo: "x",
      completar: async () => {
        throw new ErroCotaEsgotada("tokens per day (TPD)", 3600);
      },
    };
    const api = await subir(provedor);
    const r = await api.post({ pergunta: "Quanto vendemos?" });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).tentarEmSegundos, 3600);
    // Depois disso, a API nem tenta mais hoje.
    assert.equal(api.orcamento.disponivel("x"), false);
    await api.fechar();
  });

  test("502 falha_ia quando a IA não produz resposta válida", async () => {
    const api = await subir(new IAFalsa([chamar("responder", "x"), chamar("responder", "y")]));
    const r = await api.post({ pergunta: "Quanto vendemos?" });
    assert.equal(r.status, 502);
    assert.equal((await r.json()).erro, "falha_ia");
    await api.fechar();
  });
});

describe("outras rotas", () => {
  test("GET /api/saude", async () => {
    const api = await subir(new IAFalsa([]));
    const r = await fetch(`${api.url}/api/saude`);
    const corpo = await r.json();
    assert.equal(corpo.banco, "ok");
    assert.equal(corpo.dataReferencia, "2026-09-30");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal(r.headers.get("x-powered-by"), null);
    await api.fechar();
  });

  test("rota inexistente: 404 em JSON", async () => {
    const api = await subir(new IAFalsa([]));
    const r = await fetch(`${api.url}/api/apagar-tudo`, { method: "POST" });
    assert.equal(r.status, 404);
    assert.equal((await r.json()).erro, "nao_encontrado");
    await api.fechar();
  });
});
