/**
 * Provedor com modelo reserva. A cota gratuita do Groq é POR MODELO: quando a do dia do
 * principal acaba (do provedor ou do nosso orçamento), as perguntas seguem no reserva até
 * a virada do dia (meia-noite UTC). Para quem usa, o efeito é dobrar as perguntas por dia.
 */
import { ErroCotaEsgotada, type PedidoIA, type ProvedorIA, type RespostaIA } from "./provedor.ts";

export class ProvedorComReserva implements ProvedorIA {
  readonly #principal: ProvedorIA;
  readonly #reserva: ProvedorIA;
  readonly #disponivel: (modelo: string) => boolean;
  readonly #aoEsgotar: (modelo: string) => void;

  /**
   * @param disponivel o nosso orçamento ainda tem tokens para o modelo?
   * @param aoEsgotar avisa que o PROVEDOR disse que a cota do modelo acabou.
   */
  constructor(
    principal: ProvedorIA,
    reserva: ProvedorIA,
    disponivel: (modelo: string) => boolean,
    aoEsgotar: (modelo: string) => void,
  ) {
    this.#principal = principal;
    this.#reserva = reserva;
    this.#disponivel = disponivel;
    this.#aoEsgotar = aoEsgotar;
  }

  /** O modelo que vai responder a próxima pergunta. */
  get modelo(): string {
    return this.#disponivel(this.#principal.modelo) ? this.#principal.modelo : this.#reserva.modelo;
  }

  async completar(pedido: PedidoIA): Promise<RespostaIA> {
    if (this.#disponivel(this.#principal.modelo)) {
      try {
        return await this.#principal.completar(pedido);
      } catch (erro) {
        if (!(erro instanceof ErroCotaEsgotada)) throw erro;
        this.#aoEsgotar(this.#principal.modelo);
      }
    }
    if (!this.#disponivel(this.#reserva.modelo)) {
      throw new ErroCotaEsgotada("A cota do dia dos dois modelos acabou.");
    }
    try {
      return await this.#reserva.completar(pedido);
    } catch (erro) {
      if (erro instanceof ErroCotaEsgotada) this.#aoEsgotar(this.#reserva.modelo);
      throw erro;
    }
  }
}
