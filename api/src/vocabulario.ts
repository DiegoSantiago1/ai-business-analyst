/**
 * O que a IA precisa saber do banco antes de perguntar: data de referência e os valores
 * válidos de cada dimensão. Lido uma vez das views do schema ia (com o mesmo usuário
 * somente leitura) e reaproveitado em todas as perguntas.
 */
import type pg from "pg";
import { consultarSomenteLeitura } from "./banco.ts";
import type { DimensaoFiltravel, Valores } from "./metricas.ts";

export interface Vocabulario {
  dataReferencia: string;
  mesAtual: string;
  primeiraVenda: string;
  ultimaVenda: string;
  valores: Valores;
}

const CONSULTAS: Record<DimensaoFiltravel, string> = {
  loja: "SELECT loja AS v FROM ia.lojas ORDER BY 1",
  cidade: "SELECT DISTINCT cidade AS v FROM ia.lojas ORDER BY 1",
  vendedor: "SELECT vendedor AS v FROM ia.vendedores ORDER BY 1",
  modelo: "SELECT modelo AS v FROM ia.modelos ORDER BY 1",
  linha: "SELECT DISTINCT linha AS v FROM ia.modelos ORDER BY 1",
  categoria: "SELECT DISTINCT categoria AS v FROM ia.modelos ORDER BY 1",
  forma_pagamento: "SELECT DISTINCT forma_pagamento AS v FROM ia.vendas ORDER BY 1",
};

export async function carregarVocabulario(pool: pg.Pool): Promise<Vocabulario> {
  const parametros = await consultarSomenteLeitura(pool, "SELECT * FROM ia.parametros");
  const p = parametros.linhas[0];
  if (!p) throw new Error("ia.parametros está vazia: os dados foram carregados?");
  const valores = {} as Record<DimensaoFiltravel, string[]>;
  for (const [dimensao, sql] of Object.entries(CONSULTAS) as [DimensaoFiltravel, string][]) {
    const { linhas } = await consultarSomenteLeitura(pool, sql);
    valores[dimensao] = linhas.map((l) => String(l.v));
  }
  return {
    dataReferencia: String(p.data_referencia),
    mesAtual: String(p.mes_atual),
    primeiraVenda: String(p.primeira_venda),
    ultimaVenda: String(p.ultima_venda),
    valores,
  };
}
