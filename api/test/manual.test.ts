/**
 * RAG do manual (D28): o cliente HTTP contra um servidor falso de verdade (node:http) e o
 * loop do agente com um manual falso e o banco de testes.
 */
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import { perguntar } from "../src/ia/analista.ts";
import {
  type Contexto,
  ferramentasDisponiveis,
  resultadoParaModelo,
} from "../src/ia/ferramentas.ts";
import { type ClienteManual, ClienteManualHttp, type ResultadoManual } from "../src/ia/manual.ts";
import { numerosDoTexto } from "../src/ia/resposta.ts";
import { ErroFerramenta } from "../src/metricas.ts";
import { carregarVocabulario } from "../src/vocabulario.ts";
import { criarPoolDeTeste } from "./apoio.ts";
import { chamar, IAFalsa } from "./ia-falsa.ts";

const TRECHO_BONUS = {
  arquivo: "02_politica_metas_bonus.md",
  documento: "Política de metas e bônus",
  secao: "Bônus de equipe",
  texto: "Política de metas e bônus > Bônus de equipe\n| 110% ou mais | R$ 600,00 |",
  distancia: 0.21,
};

class ManualFalso implements ClienteManual {
  readonly perguntas: string[] = [];
  readonly resultado: ResultadoManual;
  constructor(resultado: ResultadoManual) {
    this.resultado = resultado;
  }
  async buscar(pergunta: string): Promise<ResultadoManual> {
    this.perguntas.push(pergunta);
    return this.resultado;
  }
}

// ------------------------------------------------------------------ cliente HTTP

describe("ClienteManualHttp", () => {
  let servidor: Server;
  let url = "";
  let comportamento: "ok" | "erro" | "lento" | "formato" = "ok";
  let corpoRecebido: unknown;

  before(async () => {
    servidor = createServer((req, res) => {
      let corpo = "";
      req.on("data", (p) => {
        corpo += p;
      });
      req.on("end", () => {
        corpoRecebido = JSON.parse(corpo || "{}");
        if (comportamento === "lento") return; // nunca responde: o timeout do cliente corta
        if (comportamento === "erro") {
          res.writeHead(500).end("falhou");
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify(
            comportamento === "formato"
              ? { trechos: "não é lista" }
              : { trechos: [TRECHO_BONUS], descartados: 1, distancia_maxima: 0.62 },
          ),
        );
      });
    });
    await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
    url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/`;
  });
  after(() => {
    servidor.closeAllConnections();
    servidor.close();
  });

  test("busca e valida a resposta; manda a pergunta e k=4", async () => {
    comportamento = "ok";
    const r = await new ClienteManualHttp(url).buscar("qual o bônus?");
    assert.equal(r.trechos[0]?.secao, "Bônus de equipe");
    assert.equal(r.descartados, 1);
    assert.deepEqual(corpoRecebido, { pergunta: "qual o bônus?", k: 4 });
  });

  test("erro do serviço vira ErroFerramenta (o agente segue só com o banco)", async () => {
    comportamento = "erro";
    await assert.rejects(new ClienteManualHttp(url).buscar("metas"), ErroFerramenta);
  });

  test("serviço que não responde: timeout vira ErroFerramenta", async () => {
    comportamento = "lento";
    await assert.rejects(
      new ClienteManualHttp(url, { timeoutMs: 200 }).buscar("metas"),
      ErroFerramenta,
    );
  });

  test("resposta em formato inesperado é recusada", async () => {
    comportamento = "formato";
    await assert.rejects(new ClienteManualHttp(url).buscar("metas"), /formato inesperado/);
  });

  test("serviço fora do ar", async () => {
    await assert.rejects(
      new ClienteManualHttp("http://127.0.0.1:9").buscar("metas"),
      ErroFerramenta,
    );
  });
});

test("numerosDoTexto acha os números do manual em formato brasileiro", () => {
  assert.deepEqual(
    numerosDoTexto("| 110% ou mais | R$ 600,00 | até 3,5% em 15 dias."),
    [110, 600, 3.5, 15],
  );
});

// ------------------------------------------------------------------ no loop do agente

const pool = criarPoolDeTeste();
let base: Contexto;
before(async () => {
  base = { pool, vocabulario: await carregarVocabulario(pool) };
});
after(() => pool.end());

function textoDoSistema(ia: IAFalsa): string {
  const sistema = ia.pedidos[0]?.mensagens[0];
  return String(sistema && "content" in sistema ? sistema.content : "");
}

describe("consultar_manual no agente", () => {
  test("sem manual: a ferramenta não é oferecida e o prompt é o da v5.1", async () => {
    assert.ok(!ferramentasDisponiveis({}).some((f) => f.function.name === "consultar_manual"));
    const ia = new IAFalsa([chamar("responder", { resposta: "ok", numeros: [] })]);
    const r = await perguntar("oi", ia, base);
    assert.ok(!ia.pedidos[0]?.ferramentas.some((f) => f.function.name === "consultar_manual"));
    assert.doesNotMatch(textoDoSistema(ia), /consultar_manual/);
    assert.equal(r.uso.versaoPrompt, "v6.1-curta");
    assert.equal(r.fontes, undefined);
  });

  test("com manual: consulta, cita a fonte e o número do manual conta como conferido", async () => {
    const manual = new ManualFalso({ trechos: [TRECHO_BONUS], descartados: 0 });
    const ia = new IAFalsa([
      chamar("consultar_manual", { pergunta: "bônus acima de 110% da meta" }),
      chamar("responder", {
        resposta: "Segundo a Política de metas e bônus, R$ 600,00 por vendedor.",
        numeros: [{ rotulo: "Bônus por vendedor", valor: 600, unidade: "R$" }],
      }),
    ]);
    const r = await perguntar("Quanto é o bônus acima de 110%?", ia, { ...base, manual });
    assert.deepEqual(manual.perguntas, ["bônus acima de 110% da meta"]);
    assert.ok(ia.pedidos[0]?.ferramentas.some((f) => f.function.name === "consultar_manual"));
    assert.match(textoDoSistema(ia), /10\. Regras, políticas e definições/);
    assert.equal(r.numeros[0]?.conferido, true);
    assert.deepEqual(r.fontes, ["Política de metas e bônus > Bônus de equipe"]);
    assert.equal(r.uso.versaoPrompt, "v6.1-curta-manual");
    assert.equal(r.tabela, undefined); // trecho do manual não vira tabela nem gráfico
    // O modelo recebe a fonte e o texto, sem a distância nem o nome do arquivo.
    const paraModelo = JSON.parse(resultadoParaModelo(r.passos[0] as never));
    assert.deepEqual(Object.keys(paraModelo.trechos[0]), ["fonte", "texto"]);
  });

  test("manual sem nada relevante: o modelo é avisado para dizer que a regra não está lá", async () => {
    const manual = new ManualFalso({ trechos: [], descartados: 4 });
    const ia = new IAFalsa([
      chamar("consultar_manual", { pergunta: "política de férias" }),
      chamar("responder", { resposta: "O manual não tem essa regra.", numeros: [] }),
    ]);
    const r = await perguntar("Qual a política de férias?", ia, { ...base, manual });
    const paraModelo = JSON.parse(resultadoParaModelo(r.passos[0] as never));
    assert.match(paraModelo.aviso, /não tem nada sobre isso/);
    assert.equal(r.fontes, undefined);
  });

  test("pergunta inválida ao manual vira erro da ferramenta, sem chamar o serviço", async () => {
    const manual = new ManualFalso({ trechos: [TRECHO_BONUS], descartados: 0 });
    const ia = new IAFalsa([
      chamar("consultar_manual", { pergunta: "" }),
      chamar("responder", { resposta: "ok", numeros: [] }),
    ]);
    const r = await perguntar("?", ia, { ...base, manual });
    assert.match(r.passos[0]?.erro ?? "", /3 a 500/);
    assert.deepEqual(manual.perguntas, []);
  });

  test("modelo que chama consultar_manual sem manual configurado recebe erro, não quebra", async () => {
    const ia = new IAFalsa([
      chamar("consultar_manual", { pergunta: "metas" }),
      chamar("responder", { resposta: "ok", numeros: [] }),
    ]);
    const r = await perguntar("metas?", ia, base);
    assert.match(r.passos[0]?.erro ?? "", /não está disponível/);
  });

  test("o prompt com manual continua curto (vai em toda volta)", async () => {
    const manual = new ManualFalso({ trechos: [], descartados: 0 });
    const ia = new IAFalsa([chamar("responder", { resposta: "ok", numeros: [] })]);
    await perguntar("oi", ia, { ...base, manual });
    const texto = textoDoSistema(ia);
    assert.ok(texto.length < 5_100, `prompt com ${texto.length} caracteres`);
  });
});
