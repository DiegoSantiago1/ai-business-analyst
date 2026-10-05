/**
 * Cliente do Groq com fetch, sem SDK (D4): o formato da requisição fica visível aqui.
 *
 * Limites do plano gratuito (medidos nos cabeçalhos em 04/10/2026): 1.000 pedidos/dia e
 * 8.000 tokens/minuto por modelo; 200 mil tokens/dia pela documentação. Uma volta do loop
 * custa ~1.600 tokens de entrada (medido), então o gargalo é o limite POR MINUTO:
 * - antes de cada pedido, se os cabeçalhos da resposta anterior dizem que não há tokens
 *   suficientes, o cliente espera o balde encher (em vez de levar um 429);
 * - 429 por minuto: espera o retry-after e tenta de novo, até um teto de espera total;
 *   passou do teto, ErroLimitePorMinuto ("tente de novo em alguns segundos");
 * - 429 de limite diário: ErroCotaEsgotada (aviso "as perguntas de hoje acabaram", D12);
 * - 5xx, falha de rede ou 400 tool_use_failed (chamada de ferramenta malformada): até 3
 *   tentativas, depois ErroProvedor.
 */
import {
  type ChamadaFerramenta,
  ErroCotaEsgotada,
  ErroLimitePorMinuto,
  ErroProvedor,
  type PedidoIA,
  type ProvedorIA,
  type RespostaIA,
} from "./provedor.ts";

const URL_GROQ = "https://api.groq.com/openai/v1/chat/completions";
const TENTATIVAS_DE_ERRO = 3;
/** Espera de retry-after acima disto já é tratada como cota esgotada (limite diário). */
export const ESPERA_DIARIA_S = 120;

export interface OpcoesGroq {
  chave: string;
  modelo: string;
  /** Limite de tokens gerados por volta. Também é o que o Groq reserva do limite por minuto. */
  maxTokensSaida?: number;
  esforco?: "low" | "medium" | "high";
  /** Teto da soma das esperas por limite por minuto numa chamada. */
  esperaMaximaS?: number;
  fetch?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  agora?: () => number;
  tempoLimiteMs?: number;
}

interface CorpoGroq {
  choices?: { message?: RespostaIA["mensagem"] }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  model?: string;
  error?: { message?: string; code?: string; type?: string; failed_generation?: string };
}

const pausa = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

/** Duração no formato dos cabeçalhos do Groq ("7.66s", "2m30s", "120ms") em segundos. */
export function lerDuracao(texto: string | null | undefined): number | undefined {
  if (!texto) return undefined;
  if (/^[\d.]+$/.test(texto)) return Number(texto);
  const m = texto.match(/^(?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?(?:([\d.]+)ms)?$/);
  if (!m || m[0] === "") return undefined;
  return (
    Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) + Number(m[4] ?? 0) / 1000
  );
}

/** Segundos a esperar: cabeçalho retry-after ou o texto "try again in 7.5s" do erro. */
export function lerEspera(
  cabecalho: string | null,
  mensagem: string | undefined,
): number | undefined {
  const doCabecalho = lerDuracao(cabecalho);
  if (doCabecalho !== undefined) return doCabecalho;
  // "...try again in 7.66s." termina com ponto final: ele sai antes de ler a duração.
  return lerDuracao(mensagem?.match(/try again in ([\dhms.]+)/i)?.[1]?.replace(/\.$/, ""));
}

export function ehLimiteDiario(mensagem: string | undefined): boolean {
  return /per day|\(TPD\)|\(RPD\)/i.test(mensagem ?? "");
}

let recuperadas = 0;

/**
 * O gpt-oss no Groq às vezes cola um marcador interno do formato harmony no nome da
 * ferramenta ("responder<|channel|>commentary") e o Groq recusa a chamada com
 * tool_use_failed, devolvendo o que o modelo gerou em failed_generation (medido em
 * 04/10/2026). Se, tirando o marcador, o nome é de uma ferramenta do pedido, a chamada é
 * recuperada. Os argumentos continuam passando pela validação normal (zod) depois.
 */
export function recuperarChamada(
  gerado: string | undefined,
  nomesValidos: string[],
): ChamadaFerramenta | undefined {
  if (!gerado) return undefined;
  let bruto: unknown;
  try {
    bruto = JSON.parse(gerado);
  } catch {
    return undefined;
  }
  const { name, arguments: args } = (bruto ?? {}) as { name?: unknown; arguments?: unknown };
  if (typeof name !== "string") return undefined;
  const nome = name.replace(/<\|[^|]*\|>.*$/s, "").trim();
  if (!nomesValidos.includes(nome)) return undefined;
  recuperadas++;
  return {
    id: `recuperada_${recuperadas}`,
    type: "function",
    function: {
      name: nome,
      arguments: typeof args === "string" ? args : JSON.stringify(args ?? {}),
    },
  };
}

/** Estimativa grosseira de tokens de um texto (~3,5 caracteres por token em PT + JSON). */
export const estimarTokens = (texto: string) => Math.ceil(texto.length / 3.5);

export class ClienteGroq implements ProvedorIA {
  readonly modelo: string;
  readonly #chave: string;
  readonly #o: Required<Omit<OpcoesGroq, "chave" | "modelo">>;
  /** Último estado do limite por minuto, lido dos cabeçalhos. */
  #restantes: number | undefined;
  #reiniciaEm = 0;

  constructor(opcoes: OpcoesGroq) {
    if (!opcoes.chave) throw new ErroProvedor("GROQ_API_KEY não definida.");
    this.modelo = opcoes.modelo;
    this.#chave = opcoes.chave;
    this.#o = {
      maxTokensSaida: opcoes.maxTokensSaida ?? 800,
      esforco: opcoes.esforco ?? "low",
      esperaMaximaS: opcoes.esperaMaximaS ?? 60,
      fetch: opcoes.fetch ?? fetch,
      esperar: opcoes.esperar ?? pausa,
      agora: opcoes.agora ?? Date.now,
      tempoLimiteMs: opcoes.tempoLimiteMs ?? 60_000,
    };
  }

  async completar(pedido: PedidoIA): Promise<RespostaIA> {
    const corpo = JSON.stringify({
      model: this.modelo,
      messages: pedido.mensagens,
      tools: pedido.ferramentas,
      tool_choice: pedido.escolha,
      // Os gpt-oss não fazem chamadas paralelas; o loop trata uma ferramenta por volta.
      parallel_tool_calls: false,
      temperature: 0,
      max_completion_tokens: this.#o.maxTokensSaida,
      reasoning_effort: this.#o.esforco,
      include_reasoning: false,
    });
    const necessarios = estimarTokens(corpo) + this.#o.maxTokensSaida;

    let esperado = 0;
    let erros = 0;
    let ultimoErro = "";
    const esperar = async (segundos: number, motivo: string) => {
      if (esperado + segundos > this.#o.esperaMaximaS) {
        throw new ErroLimitePorMinuto(
          `Limite por minuto do provedor (${motivo}).`,
          Math.ceil(segundos),
        );
      }
      esperado += segundos;
      await this.#o.esperar(Math.ceil(segundos * 1000));
    };

    while (erros < TENTATIVAS_DE_ERRO) {
      // Espera preventiva: o balde do minuto não tem tokens para este pedido.
      const faltaMs = this.#reiniciaEm - this.#o.agora();
      if (this.#restantes !== undefined && this.#restantes < necessarios && faltaMs > 0) {
        await esperar(faltaMs / 1000 + 0.25, "espera preventiva");
        this.#restantes = undefined;
      }

      let resposta: Response;
      try {
        resposta = await this.#o.fetch(URL_GROQ, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.#chave}`, "Content-Type": "application/json" },
          body: corpo,
          signal: AbortSignal.timeout(this.#o.tempoLimiteMs),
        });
      } catch (erro) {
        erros++;
        ultimoErro = `falha de rede: ${(erro as Error).message}`;
        continue;
      }
      this.#lerCabecalhos(resposta.headers);
      const dados = (await resposta.json().catch(() => ({}))) as CorpoGroq;
      const mensagemErro = dados.error?.message;

      if (resposta.status === 429) {
        const espera = lerEspera(resposta.headers.get("retry-after"), mensagemErro);
        if (ehLimiteDiario(mensagemErro) || (espera !== undefined && espera > ESPERA_DIARIA_S)) {
          throw new ErroCotaEsgotada(mensagemErro ?? "Cota diária do provedor esgotada.", espera);
        }
        await esperar((espera ?? 5) + 0.25, "429");
        continue;
      }
      if (resposta.status === 400 && dados.error?.code === "output_parse_failed") {
        // O modelo escreveu texto em vez de chamar uma ferramenta (medido: numa pergunta
        // hostil ele gerou só "User requests deletion. Must refuse."). Vira uma resposta de
        // texto: o loop pede, na volta seguinte, que ele use a ferramenta responder.
        const texto = dados.error.failed_generation ?? "";
        const entrada = estimarTokens(corpo);
        const saida = estimarTokens(texto);
        return {
          mensagem: { content: texto },
          modelo: this.modelo,
          uso: { entrada, saida, total: entrada + saida },
        };
      }
      if (resposta.status === 400 && dados.error?.code === "tool_use_failed") {
        const nomes = pedido.ferramentas.map((f) => f.function.name);
        const recuperada = recuperarChamada(dados.error.failed_generation, nomes);
        if (recuperada) {
          // Sem "usage" na resposta de erro: os tokens são estimados.
          const saida = estimarTokens(dados.error.failed_generation ?? "");
          const entrada = estimarTokens(corpo);
          return {
            mensagem: { content: null, tool_calls: [recuperada] },
            modelo: this.modelo,
            uso: { entrada, saida, total: entrada + saida },
          };
        }
        erros++;
        ultimoErro = "tool_use_failed: o modelo gerou uma chamada de ferramenta inválida";
        continue;
      }
      if (resposta.status >= 500) {
        erros++;
        ultimoErro = `HTTP ${resposta.status}`;
        continue;
      }
      if (!resposta.ok) {
        // 401 (chave errada), 400 de formato, 404 (modelo inexistente): não adianta repetir.
        throw new ErroProvedor(`HTTP ${resposta.status}: ${mensagemErro ?? "erro do provedor"}`);
      }

      const mensagem = dados.choices?.[0]?.message;
      if (!mensagem) throw new ErroProvedor("Resposta do provedor sem mensagem.");
      return {
        mensagem,
        modelo: dados.model ?? this.modelo,
        uso: {
          entrada: dados.usage?.prompt_tokens ?? 0,
          saida: dados.usage?.completion_tokens ?? 0,
          total: dados.usage?.total_tokens ?? 0,
        },
      };
    }
    throw new ErroProvedor(
      `Provedor indisponível depois de ${TENTATIVAS_DE_ERRO} tentativas (${ultimoErro}).`,
    );
  }

  #lerCabecalhos(cabecalhos: Headers): void {
    const restantes = Number(cabecalhos.get("x-ratelimit-remaining-tokens"));
    const reinicia = lerDuracao(cabecalhos.get("x-ratelimit-reset-tokens"));
    if (Number.isFinite(restantes) && cabecalhos.has("x-ratelimit-remaining-tokens")) {
      this.#restantes = restantes;
      this.#reiniciaEm = this.#o.agora() + (reinicia ?? 60) * 1000;
    }
  }
}
