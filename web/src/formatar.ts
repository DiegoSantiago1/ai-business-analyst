/**
 * Formatação em português do Brasil, decidida pelo NOME da coluna (o catálogo de métricas
 * usa nomes estáveis: faturamento, ticket_medio, *_pct...). Funções puras, testadas no Node.
 */
import type { Unidade } from "./tipos.ts";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const reaisCompacto = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const umaCasa = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export type Tipo = "reais" | "pct" | "inteiro" | "decimal" | "data" | "mes" | "texto";

const EM_REAIS = /faturamento|ticket|valor|preco|desconto_total|receita/;

export function tipoDaColuna(coluna: string): Tipo {
  if (coluna === "mes") return "mes";
  if (coluna.endsWith("_pct")) return "pct";
  if (EM_REAIS.test(coluna)) return "reais";
  if (
    /^(unidades|quantidade|numero_vendas|meta_unidades|unidades_vendidas|vendas|n|total|ano)$/.test(
      coluna,
    )
  )
    return "inteiro";
  if (/^(data|vendido_em|admitido_em|desligado_em|data_referencia)$/.test(coluna)) return "data";
  return "texto";
}

/** "2026-09-01" -> "set/26" */
export function formatarMes(iso: string): string {
  const [ano, mes] = iso.split("-");
  const nome = MESES[Number(mes) - 1];
  return nome && ano ? `${nome}/${ano.slice(2)}` : iso;
}

/** "2026-09-30" ou "2026-09-30 18:22:10-03" -> "30/09/2026" (+ hora se houver) */
export function formatarData(texto: string): string {
  const m = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/);
  if (!m) return texto;
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}` : ""}`;
}

export function formatarValor(coluna: string, valor: unknown, compacto = false): string {
  if (valor === null || valor === undefined) return "—";
  if (typeof valor === "boolean") return valor ? "sim" : "não";
  const tipo = tipoDaColuna(coluna);
  if (typeof valor === "number") {
    if (coluna === "ano") return String(valor);
    if (tipo === "reais") return (compacto ? reaisCompacto : reais).format(valor);
    if (tipo === "pct") return `${umaCasa.format(valor)}%`;
    if (tipo === "inteiro") return inteiro.format(valor);
    return decimal.format(valor);
  }
  const texto = String(valor);
  if (tipo === "mes") return formatarMes(texto);
  if (tipo === "data") return formatarData(texto);
  return texto;
}

export function formatarNumero(valor: number, unidade: Unidade): string {
  if (unidade === "R$") return reais.format(valor);
  if (unidade === "%") return `${umaCasa.format(valor)}%`;
  if (unidade === "unidades" || unidade === "vendas") {
    return `${inteiro.format(valor)} ${unidade === "unidades" ? (valor === 1 ? "unidade" : "unidades") : valor === 1 ? "venda" : "vendas"}`;
  }
  return decimal.format(valor);
}

/** Nome de coluna para exibir: "ticket_medio" -> "Ticket médio". */
const ROTULOS: Record<string, string> = {
  faturamento: "Faturamento",
  unidades: "Unidades",
  numero_vendas: "Nº de vendas",
  ticket_medio: "Ticket médio",
  desconto_medio_pct: "Desconto médio",
  participacao_unidades_pct: "Participação (unidades)",
  participacao_faturamento_pct: "Participação (faturamento)",
  meta_unidades: "Meta",
  atingimento_meta_pct: "Atingimento da meta",
  forma_pagamento: "Forma de pagamento",
  mes: "Mês",
  unidades_vendidas: "Unidades vendidas",
  atingimento_pct: "Atingimento",
  valor_total: "Valor total",
  vendido_em: "Vendido em",
};

export function rotuloDaColuna(coluna: string): string {
  const conhecido = ROTULOS[coluna];
  if (conhecido) return conhecido;
  const texto = coluna.replace(/_/g, " ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function formatarDuracao(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${decimal.format(Math.round(ms / 100) / 10)} s`;
}

export const formatarInteiro = (n: number) => inteiro.format(n);
