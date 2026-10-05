/**
 * Registro de cada pergunta em JSON Lines (um arquivo por dia, UTC): tokens, latência,
 * ferramentas usadas e erro. Não guarda IP nem nada que identifique quem perguntou.
 *
 * Por que arquivo e não o banco: o usuário da IA é somente leitura de propósito (D6, D13).
 * Dar a ele permissão de escrita só para o log abriria a porta que o projeto fecha.
 */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { diaUTC } from "./limites.ts";

export interface LinhaRegistro {
  quando: string;
  pergunta: string;
  modelo?: string;
  versaoPrompt?: string;
  voltas?: number;
  tokensTotal?: number;
  latenciaMs: number;
  ferramentas?: string[];
  numeros?: number;
  numerosConferidos?: number;
  erro?: string;
}

export class Registro {
  readonly #pasta: string;
  readonly #agora: () => number;

  constructor(pasta: string, agora: () => number = Date.now) {
    this.#pasta = pasta;
    this.#agora = agora;
  }

  #arquivo(dia: string): string {
    return join(this.#pasta, `perguntas-${dia}.jsonl`);
  }

  async gravar(linha: Omit<LinhaRegistro, "quando">): Promise<void> {
    await mkdir(this.#pasta, { recursive: true });
    const completa: LinhaRegistro = { quando: new Date(this.#agora()).toISOString(), ...linha };
    await appendFile(this.#arquivo(diaUTC(this.#agora())), `${JSON.stringify(completa)}\n`, "utf8");
  }

  /** Tokens já gastos hoje (para o orçamento diário sobreviver a um reinício). */
  async tokensDeHoje(): Promise<number> {
    let texto: string;
    try {
      texto = await readFile(this.#arquivo(diaUTC(this.#agora())), "utf8");
    } catch {
      return 0;
    }
    let total = 0;
    for (const linha of texto.split("\n")) {
      if (!linha.trim()) continue;
      try {
        total += Number((JSON.parse(linha) as LinhaRegistro).tokensTotal ?? 0) || 0;
      } catch {
        // linha corrompida (ex.: queda no meio da escrita): ignorada
      }
    }
    return total;
  }
}
