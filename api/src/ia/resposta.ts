/**
 * Resposta final (structured output): validação com zod e conferência dos números.
 *
 * Conferência: cada número que a IA cita é procurado nos resultados que o banco devolveu
 * nesta pergunta. Achou (com tolerância de arredondamento) = "conferido". Não achou = a
 * IA calculou (ex.: variação entre dois meses) ou inventou; a interface mostra isso, para o
 * gerente não confiar de olhos fechados. A avaliação (fase 7) mede essa taxa.
 */
import { z } from "zod";
import type { Passo } from "./ferramentas.ts";

export const esquemaResposta = z
  .object({
    resposta: z.string().trim().min(1).max(2_000),
    numeros: z
      .array(
        z
          .object({
            rotulo: z.string().trim().min(1).max(120),
            valor: z.number().finite(),
            unidade: z.enum(["R$", "unidades", "vendas", "%", "outro"]),
          })
          .strict(),
      )
      .max(8)
      // Resposta sem número nenhum (ex.: "quem foi o último cliente?") é válida.
      .default([]),
    // O modelo às vezes manda o gráfico como texto: só o tipo ("nenhum") ou o objeto em
    // JSON ("{\"tipo\":\"barra\",...}"), medido em 04/10/2026. As duas formas são
    // normalizadas aqui, em vez de custar uma volta inteira de correção (~2 mil tokens).
    grafico: z
      .preprocess(
        (valor) => {
          if (typeof valor !== "string") return valor;
          const texto = valor.trim();
          if (!texto.startsWith("{")) return { tipo: texto };
          try {
            return JSON.parse(texto);
          } catch {
            return valor;
          }
        },
        z
          .object({
            tipo: z.enum(["barra", "linha", "nenhum"]),
            x: z.string().optional(),
            y: z.string().optional(),
          })
          .strict(),
      )
      .optional(),
    limitacoes: z.string().trim().max(600).optional(),
  })
  .strict();
export type RespostaModelo = z.infer<typeof esquemaResposta>;

export interface NumeroConferido {
  rotulo: string;
  valor: number;
  unidade: RespostaModelo["numeros"][number]["unidade"];
  conferido: boolean;
}

export interface Tabela {
  colunas: string[];
  linhas: Record<string, unknown>[];
  sql: string;
  truncado: boolean;
}

export interface Grafico {
  tipo: "barra" | "linha";
  x: string;
  y: string;
}

export function numerosDosResultados(passos: Passo[]): number[] {
  const numeros: number[] = [];
  for (const passo of passos) {
    if (passo.erro) continue;
    for (const linha of passo.linhas ?? []) {
      for (const valor of Object.values(linha)) {
        if (typeof valor === "number" && Number.isFinite(valor)) numeros.push(valor);
      }
    }
  }
  return numeros;
}

/** Tolerância: 0,05 (arredondamento de % e de unidades) ou 0,01% do valor. */
export function conferir(valor: number, doBanco: number[]): boolean {
  return doBanco.some((x) => Math.abs(valor - x) <= Math.max(0.051, Math.abs(x) * 1e-4));
}

/** Tabela = resultado da ÚLTIMA consulta bem-sucedida (números direto do banco). */
export function ultimaTabela(passos: Passo[]): Tabela | undefined {
  const passo = passos.findLast((p) => !p.erro && p.sql && p.colunas);
  if (!passo?.sql || !passo.colunas) return undefined;
  return {
    colunas: passo.colunas,
    linhas: passo.linhas ?? [],
    sql: passo.sql,
    truncado: !!passo.truncado,
  };
}

/**
 * Só aceita o gráfico pedido se ele fizer sentido com a tabela: x e y existem, y é numérico
 * e há pelo menos 2 linhas. Senão, sem gráfico (a resposta continua valendo).
 */
export function validarGrafico(
  pedido: RespostaModelo["grafico"],
  tabela: Tabela | undefined,
): Grafico | undefined {
  if (!pedido || pedido.tipo === "nenhum" || !tabela || tabela.linhas.length < 2) return undefined;
  const { x, y } = pedido;
  if (!x || !y || !tabela.colunas.includes(x) || !tabela.colunas.includes(y)) return undefined;
  if (!tabela.linhas.every((l) => typeof l[y] === "number")) return undefined;
  return { tipo: pedido.tipo, x, y };
}
