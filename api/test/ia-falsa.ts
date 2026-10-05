/**
 * IA falsa: devolve respostas roteirizadas, na ordem, e guarda cada pedido recebido.
 * Um passo do roteiro pode ser uma função que lê o pedido (ex.: para "copiar" o número
 * que a ferramenta devolveu, como a IA de verdade faria). Sem rede e sem gastar cota.
 */
import type { PedidoIA, ProvedorIA, RespostaIA } from "../src/ia/provedor.ts";

type PassoRoteiro = RespostaIA["mensagem"] | ((pedido: PedidoIA) => RespostaIA["mensagem"]);

let contador = 0;

export function chamar(nome: string, argumentos: unknown): RespostaIA["mensagem"] {
  contador++;
  return {
    content: null,
    tool_calls: [
      {
        id: `chamada_${contador}`,
        type: "function",
        function: {
          name: nome,
          arguments: typeof argumentos === "string" ? argumentos : JSON.stringify(argumentos),
        },
      },
    ],
  };
}

/** Conteúdo (JSON) do último resultado de ferramenta no pedido. */
export function ultimoResultado(pedido: PedidoIA): {
  colunas: string[];
  linhas: unknown[][];
  erro?: string;
} {
  const ultima = pedido.mensagens.findLast((m) => m.role === "tool");
  if (ultima?.role !== "tool") throw new Error("nenhum resultado de ferramenta");
  return JSON.parse(ultima.content);
}

export class IAFalsa implements ProvedorIA {
  readonly modelo = "ia-falsa";
  readonly pedidos: PedidoIA[] = [];
  #roteiro: PassoRoteiro[];

  constructor(roteiro: PassoRoteiro[]) {
    this.#roteiro = [...roteiro];
  }

  async completar(pedido: PedidoIA): Promise<RespostaIA> {
    // Cópia: o loop continua mexendo na mesma lista de mensagens depois.
    this.pedidos.push({ ...pedido, mensagens: [...pedido.mensagens] });
    const passo = this.#roteiro.shift();
    if (!passo) throw new Error("roteiro da IA falsa acabou");
    const mensagem = typeof passo === "function" ? passo(pedido) : passo;
    return { mensagem, modelo: this.modelo, uso: { entrada: 1000, saida: 100, total: 1100 } };
  }
}
