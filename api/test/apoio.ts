/** Apoio dos testes de integração: pool do usuário da IA no banco de TESTES. */
import type pg from "pg";
import { criarPool } from "../src/banco.ts";
import { carregarConfigBanco } from "../src/config.ts";
import type { Valores } from "../src/metricas.ts";

export function criarPoolDeTeste(): pg.Pool {
  return criarPool(carregarConfigBanco(undefined, { teste: true }));
}

/** Vocabulário fixo para os testes unitários (sem banco). */
export const VALORES: Valores = {
  loja: ["Loja Centro", "Loja Litoral", "Loja Norte", "Loja Serra", "Loja Sul"],
  cidade: ["Cabo de Santo Agostinho", "Caruaru", "Jaboatão dos Guararapes", "Recife"],
  vendedor: ["Ana Paula Ribeiro", "Juliana Rocha", "Rafael Moura", "Renato Farias"],
  modelo: ["HR-V EXL", "HR-V Touring", "City Sedan LX"],
  linha: ["City Hatch", "City Sedan", "Civic", "CR-V", "HR-V", "WR-V", "ZR-V"],
  categoria: ["Hatch", "Sedan", "SUV"],
  forma_pagamento: ["A vista", "Consorcio", "Financiado"],
};
