/**
 * Proteções de uso da API pública (sem dependência externa):
 * - LimitePorIp: janela deslizante de N perguntas por minuto por IP;
 * - OrcamentoDiario: tokens gastos no dia (UTC); passou do teto, "as perguntas de hoje
 *   acabaram" ANTES de chamar o provedor (D12). Sobrevive a reinício: é reconstruído a
 *   partir do registro do dia;
 * - Fila: uma pergunta por vez. O limite de 8 mil tokens/minuto do plano gratuito não
 *   comporta duas perguntas em paralelo; fila cheia = "ocupado, tente já já".
 */

export class LimitePorIp {
  readonly #janelaMs: number;
  readonly #maximo: number;
  readonly #agora: () => number;
  readonly #pedidos = new Map<string, number[]>();

  constructor(maximo: number, janelaMs = 60_000, agora: () => number = Date.now) {
    this.#maximo = maximo;
    this.#janelaMs = janelaMs;
    this.#agora = agora;
  }

  /** Registra o pedido. Devolve 0 se pode seguir, ou os segundos até liberar. */
  consumir(ip: string): number {
    const agora = this.#agora();
    const recentes = (this.#pedidos.get(ip) ?? []).filter((t) => agora - t < this.#janelaMs);
    if (recentes.length >= this.#maximo) {
      this.#pedidos.set(ip, recentes);
      return Math.ceil((this.#janelaMs - (agora - (recentes[0] ?? agora))) / 1000);
    }
    recentes.push(agora);
    this.#pedidos.set(ip, recentes);
    // Limpeza simples para o mapa não crescer sem fim.
    if (this.#pedidos.size > 10_000) {
      for (const [chave, tempos] of this.#pedidos) {
        if (tempos.every((t) => agora - t >= this.#janelaMs)) this.#pedidos.delete(chave);
      }
    }
    return 0;
  }
}

export const diaUTC = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export class OrcamentoDiario {
  readonly teto: number;
  readonly #agora: () => number;
  #dia: string;
  #gasto: number;

  constructor(teto: number, gastoInicial = 0, agora: () => number = Date.now) {
    this.teto = teto;
    this.#agora = agora;
    this.#dia = diaUTC(agora());
    this.#gasto = gastoInicial;
  }

  #virarDia(): void {
    const hoje = diaUTC(this.#agora());
    if (hoje !== this.#dia) {
      this.#dia = hoje;
      this.#gasto = 0;
    }
  }

  get gasto(): number {
    this.#virarDia();
    return this.#gasto;
  }

  esgotado(): boolean {
    return this.gasto >= this.teto;
  }

  registrar(tokens: number): void {
    this.#virarDia();
    this.#gasto += tokens;
  }

  /** Segundos até a meia-noite UTC, quando a cota do provedor e a nossa reiniciam. */
  segundosAteReiniciar(): number {
    const agora = this.#agora();
    const amanha = new Date(diaUTC(agora));
    amanha.setUTCDate(amanha.getUTCDate() + 1);
    return Math.ceil((amanha.getTime() - agora) / 1000);
  }
}

export class FilaCheia extends Error {
  override name = "FilaCheia";
}

export class Fila {
  readonly #maximoEsperando: number;
  #corrente: Promise<unknown> = Promise.resolve();
  #esperando = 0;

  constructor(maximoEsperando: number) {
    this.#maximoEsperando = maximoEsperando;
  }

  get esperando(): number {
    return this.#esperando;
  }

  /** Executa `tarefa` depois das anteriores. Fila cheia: FilaCheia, sem enfileirar. */
  executar<T>(tarefa: () => Promise<T>): Promise<T> {
    if (this.#esperando >= this.#maximoEsperando) {
      return Promise.reject(new FilaCheia("Muitas perguntas na fila."));
    }
    this.#esperando++;
    const resultado = this.#corrente.then(tarefa, tarefa);
    this.#corrente = resultado.then(
      () => undefined,
      () => undefined,
    );
    return resultado.finally(() => {
      this.#esperando--;
    });
  }
}
