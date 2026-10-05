/** Cliente do Groq com fetch FALSO: formato do pedido e tratamento de cada erro, sem rede. */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ClienteGroq,
  ehLimiteDiario,
  lerDuracao,
  lerEspera,
  recuperarChamada,
} from "../src/ia/groq.ts";
import {
  ErroCotaEsgotada,
  ErroLimitePorMinuto,
  ErroProvedor,
  type PedidoIA,
} from "../src/ia/provedor.ts";

const PEDIDO: PedidoIA = {
  mensagens: [{ role: "user", content: "oi" }],
  ferramentas: [],
  escolha: "required",
};

const OK = {
  model: "openai/gpt-oss-20b",
  choices: [{ message: { content: null, tool_calls: [] } }],
  usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
};

function resposta(
  status: number,
  corpo: unknown,
  cabecalhos: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(corpo), { status, headers: cabecalhos });
}

function clienteCom(respostas: (Response | Error)[], agora: () => number = () => 0) {
  const chamadas: { url: string; init: RequestInit }[] = [];
  const esperas: number[] = [];
  const cliente = new ClienteGroq({
    chave: "gsk_teste",
    modelo: "openai/gpt-oss-20b",
    fetch: (async (url: string, init: RequestInit) => {
      chamadas.push({ url, init });
      const proxima = respostas.shift();
      if (!proxima) throw new Error("sem resposta roteirizada");
      if (proxima instanceof Error) throw proxima;
      return proxima;
    }) as typeof fetch,
    esperar: async (ms) => {
      esperas.push(ms);
    },
    agora,
  });
  return { cliente, chamadas, esperas };
}

describe("ClienteGroq", () => {
  test("monta o pedido no formato da OpenAI com as opções de economia", async () => {
    const { cliente, chamadas } = clienteCom([resposta(200, OK)]);
    const r = await cliente.completar(PEDIDO);
    assert.deepEqual(r.uso, { entrada: 100, saida: 20, total: 120 });
    const [chamada] = chamadas;
    assert.ok(chamada);
    assert.equal(chamada.url, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(
      (chamada.init.headers as Record<string, string>).Authorization,
      "Bearer gsk_teste",
    );
    const corpo = JSON.parse(String(chamada.init.body));
    assert.equal(corpo.model, "openai/gpt-oss-20b");
    assert.equal(corpo.tool_choice, "required");
    assert.equal(corpo.parallel_tool_calls, false);
    assert.equal(corpo.include_reasoning, false);
    assert.equal(corpo.temperature, 0);
    assert.equal(corpo.max_completion_tokens, 800);
  });

  test("429 com espera curta: espera e tenta de novo", async () => {
    const { cliente, esperas } = clienteCom([
      resposta(429, { error: { message: "Rate limit reached ... (TPM)" } }, { "retry-after": "7" }),
      resposta(200, OK),
    ]);
    await cliente.completar(PEDIDO);
    assert.deepEqual(esperas, [7250]);
  });

  test("429 de limite diário: ErroCotaEsgotada sem esperar", async () => {
    const { cliente, esperas } = clienteCom([
      resposta(
        429,
        {
          error: {
            message:
              "Rate limit reached on tokens per day (TPD): Limit 200000. Please try again in 12m3.5s.",
          },
        },
        { "retry-after": "724" },
      ),
    ]);
    await assert.rejects(cliente.completar(PEDIDO), (e: unknown) => {
      assert.ok(e instanceof ErroCotaEsgotada);
      assert.equal(e.tentarDeNovoEmSegundos, 724);
      return true;
    });
    assert.deepEqual(esperas, []);
  });

  test("429 com espera longa também é cota esgotada", async () => {
    const { cliente } = clienteCom([
      resposta(429, { error: { message: "limit" } }, { "retry-after": "300" }),
    ]);
    await assert.rejects(cliente.completar(PEDIDO), ErroCotaEsgotada);
  });

  test("tool_use_failed e 5xx: tenta de novo", async () => {
    const { cliente, chamadas } = clienteCom([
      resposta(400, { error: { code: "tool_use_failed", message: "Failed to call a function" } }),
      resposta(503, { error: { message: "busy" } }),
      resposta(200, OK),
    ]);
    await cliente.completar(PEDIDO);
    assert.equal(chamadas.length, 3);
  });

  test("falha de rede três vezes: ErroProvedor", async () => {
    const { cliente } = clienteCom([
      new Error("ECONNRESET"),
      new Error("ECONNRESET"),
      new Error("ECONNRESET"),
    ]);
    await assert.rejects(cliente.completar(PEDIDO), /3 tentativas.*ECONNRESET/);
  });

  test("401 (chave errada) não repete", async () => {
    const { cliente, chamadas } = clienteCom([
      resposta(401, { error: { message: "Invalid API Key" } }),
    ]);
    await assert.rejects(
      cliente.completar(PEDIDO),
      (e: unknown) => e instanceof ErroProvedor && /401/.test(e.message),
    );
    assert.equal(chamadas.length, 1);
  });

  test("sem chave não constrói", () => {
    assert.throws(() => new ClienteGroq({ chave: "", modelo: "x" }), /GROQ_API_KEY/);
  });

  test("a chave não aparece se o cliente for impresso", () => {
    const { cliente } = clienteCom([]);
    assert.doesNotMatch(JSON.stringify(cliente), /gsk_teste/);
  });
});

test("lerEspera: cabeçalho ou texto da mensagem", () => {
  assert.equal(lerEspera("12", undefined), 12);
  assert.equal(lerEspera(null, "Please try again in 7.66s."), 7.66);
  assert.equal(lerEspera(null, "Please try again in 2m30s."), 150);
  assert.equal(lerEspera(null, "sem número"), undefined);
});

test("ehLimiteDiario", () => {
  assert.ok(ehLimiteDiario("Limit on tokens per day (TPD)"));
  assert.ok(!ehLimiteDiario("Limit on tokens per minute (TPM)"));
});

describe("limite por minuto", () => {
  test("espera preventiva: o cabeçalho diz que faltam tokens, espera o balde encher", async () => {
    const { cliente, esperas } = clienteCom([
      resposta(200, OK, {
        "x-ratelimit-remaining-tokens": "300",
        "x-ratelimit-reset-tokens": "12.5s",
      }),
      resposta(200, OK),
    ]);
    await cliente.completar(PEDIDO);
    await cliente.completar(PEDIDO);
    assert.deepEqual(esperas, [12750]);
  });

  test("com tokens sobrando, não espera", async () => {
    const { cliente, esperas } = clienteCom([
      resposta(200, OK, {
        "x-ratelimit-remaining-tokens": "7000",
        "x-ratelimit-reset-tokens": "2s",
      }),
      resposta(200, OK),
    ]);
    await cliente.completar(PEDIDO);
    await cliente.completar(PEDIDO);
    assert.deepEqual(esperas, []);
  });

  test("429 seguidos passando do teto de espera: ErroLimitePorMinuto", async () => {
    const r429 = () => resposta(429, { error: { message: "TPM" } }, { "retry-after": "25" });
    const { cliente } = clienteCom([r429(), r429(), r429()]);
    await assert.rejects(cliente.completar(PEDIDO), (e: unknown) => {
      assert.ok(e instanceof ErroLimitePorMinuto);
      assert.equal(e.tentarDeNovoEmSegundos, 26);
      return true;
    });
  });
});

test("lerDuracao: formatos dos cabeçalhos do Groq", () => {
  assert.equal(lerDuracao("32.985s"), 32.985);
  assert.equal(lerDuracao("5m45.6s"), 345.6);
  assert.equal(lerDuracao("120ms"), 0.12);
  assert.equal(lerDuracao("1h2m"), 3720);
  assert.equal(lerDuracao("7"), 7);
  assert.equal(lerDuracao("abc"), undefined);
  assert.equal(lerDuracao(null), undefined);
});

describe("recuperação de tool_use_failed (marcador do harmony no nome)", () => {
  const gerado = JSON.stringify({
    name: "responder<|channel|>commentary",
    arguments: { resposta: "ok", numeros: [] },
  });

  test("tira o marcador e recupera a chamada", () => {
    const c = recuperarChamada(gerado, ["responder", "executar_sql"]);
    assert.equal(c?.function.name, "responder");
    assert.deepEqual(JSON.parse(c?.function.arguments ?? ""), { resposta: "ok", numeros: [] });
  });

  test("nome que não é de ferramenta do pedido: não recupera", () => {
    const hostil = JSON.stringify({ name: "apagar_tudo<|channel|>x", arguments: {} });
    assert.equal(recuperarChamada(hostil, ["responder"]), undefined);
    assert.equal(recuperarChamada("não é json", ["responder"]), undefined);
    assert.equal(recuperarChamada(undefined, ["responder"]), undefined);
  });

  test("o cliente devolve a chamada recuperada em vez de repetir o pedido", async () => {
    const { cliente, chamadas } = clienteCom([
      resposta(400, {
        error: { code: "tool_use_failed", message: "x", failed_generation: gerado },
      }),
    ]);
    const r = await cliente.completar({
      ...PEDIDO,
      ferramentas: [
        { type: "function", function: { name: "responder", description: "", parameters: {} } },
      ],
    });
    assert.equal(chamadas.length, 1);
    assert.equal(r.mensagem.tool_calls?.[0]?.function.name, "responder");
    assert.ok(r.uso.total > 0, "tokens estimados");
  });
});

test("output_parse_failed (texto em vez de ferramenta) vira resposta de texto", async () => {
  const { cliente, chamadas } = clienteCom([
    resposta(400, {
      error: {
        code: "output_parse_failed",
        message: "Parsing failed",
        failed_generation: "Must refuse.",
      },
    }),
  ]);
  const r = await cliente.completar(PEDIDO);
  assert.equal(chamadas.length, 1);
  assert.equal(r.mensagem.content, "Must refuse.");
  assert.equal(r.mensagem.tool_calls, undefined);
});
