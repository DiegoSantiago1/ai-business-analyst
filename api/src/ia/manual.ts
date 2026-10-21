/**
 * Cliente do serviço de RAG do manual comercial (FastAPI, rag/; D28).
 *
 * A ferramenta consultar_manual chama POST {RAG_URL}/buscar e recebe os trechos do manual
 * mais próximos da pergunta, com a fonte (documento > seção). Sem RAG_URL, a ferramenta nem
 * é oferecida ao modelo: o agente continua respondendo só com métricas e SQL.
 */
import { z } from "zod";
import { ErroFerramenta } from "../metricas.ts";

export interface TrechoManual {
  arquivo: string;
  documento: string;
  secao: string;
  texto: string;
  distancia: number;
}

export interface ResultadoManual {
  trechos: TrechoManual[];
  descartados: number;
}

export interface ClienteManual {
  buscar(pergunta: string): Promise<ResultadoManual>;
}

const esquemaResultado = z.object({
  trechos: z.array(
    z.object({
      arquivo: z.string(),
      documento: z.string(),
      secao: z.string(),
      texto: z.string(),
      distancia: z.number(),
    }),
  ),
  descartados: z.number().int().min(0),
});

export class ClienteManualHttp implements ClienteManual {
  readonly #url: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(url: string, { timeoutMs = 8_000, fetchFn = fetch } = {}) {
    this.#url = url.replace(/\/+$/, "");
    this.#timeoutMs = timeoutMs;
    this.#fetch = fetchFn;
  }

  async buscar(pergunta: string): Promise<ResultadoManual> {
    let resposta: Response;
    try {
      resposta = await this.#fetch(`${this.#url}/buscar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pergunta, k: 4 }),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch {
      throw new ErroFerramenta(
        "O manual não respondeu agora: diga que não foi possível consultar o manual, sem afirmar que a regra não existe.",
      );
    }
    if (resposta.status === 422) throw new ErroFerramenta("Pergunta ao manual inválida.");
    if (!resposta.ok) {
      throw new ErroFerramenta(
        "O manual não respondeu agora: diga que não foi possível consultar o manual, sem afirmar que a regra não existe.",
      );
    }
    const lido = esquemaResultado.safeParse(await resposta.json().catch(() => undefined));
    if (!lido.success) throw new ErroFerramenta("Resposta do manual em formato inesperado.");
    return lido.data;
  }
}
