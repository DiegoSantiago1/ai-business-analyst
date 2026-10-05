/**
 * Contrato com o provedor de LLM, no formato de chat da OpenAI (que o Groq segue).
 *
 * O núcleo da IA (analista.ts) só conhece esta interface. Em produção quem a implementa é
 * o cliente do Groq (groq.ts); nos testes, uma IA falsa com respostas roteirizadas
 * (test/ia-falsa.ts). É isso que deixa os testes rodarem sem rede e sem gastar cota.
 */

export interface ChamadaFerramenta {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type Mensagem =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content?: string | null; tool_calls?: ChamadaFerramenta[] }
  | { role: "tool"; tool_call_id: string; name: string; content: string };

export interface DefinicaoFerramenta {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export type EscolhaFerramenta = "required" | { type: "function"; function: { name: string } };

export interface PedidoIA {
  mensagens: Mensagem[];
  ferramentas: DefinicaoFerramenta[];
  escolha: EscolhaFerramenta;
  /** Limite de tokens gerados nesta volta (resposta detalhada precisa de mais). */
  maxTokensSaida?: number;
}

export interface Uso {
  entrada: number;
  saida: number;
  total: number;
  /** Tempo esperando a cota do minuto do provedor (não é tempo de processamento). */
  esperaMs?: number;
}

export interface RespostaIA {
  mensagem: { content?: string | null; tool_calls?: ChamadaFerramenta[] };
  uso: Uso;
  modelo: string;
}

export interface ProvedorIA {
  readonly modelo: string;
  completar(pedido: PedidoIA): Promise<RespostaIA>;
}

/** A cota do provedor acabou (limite diário ou espera longa demais). */
export class ErroCotaEsgotada extends Error {
  override name = "ErroCotaEsgotada";
  readonly tentarDeNovoEmSegundos: number | undefined;
  constructor(mensagem: string, tentarDeNovoEmSegundos?: number) {
    super(mensagem);
    this.tentarDeNovoEmSegundos = tentarDeNovoEmSegundos;
  }
}

/** Muitas perguntas no mesmo minuto: passa sozinho em alguns segundos. */
export class ErroLimitePorMinuto extends Error {
  override name = "ErroLimitePorMinuto";
  readonly tentarDeNovoEmSegundos: number;
  constructor(mensagem: string, tentarDeNovoEmSegundos: number) {
    super(mensagem);
    this.tentarDeNovoEmSegundos = tentarDeNovoEmSegundos;
  }
}

/** Falha do provedor que não é de cota (rede, 5xx persistente, resposta estranha). */
export class ErroProvedor extends Error {
  override name = "ErroProvedor";
}
