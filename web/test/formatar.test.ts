import assert from "node:assert/strict";
import { test } from "node:test";
import { escalaLinear, maisProximo, marcas, passoRedondo } from "../src/escalas.ts";
import {
  formatarData,
  formatarDuracao,
  formatarMes,
  formatarNumero,
  formatarValor,
  rotuloDaColuna,
  tipoDaColuna,
} from "../src/formatar.ts";

// O Intl usa espaço não separável entre "R$" e o número.
const sem = (s: string) => s.replace(/\u00a0/g, " ");

test("tipo da coluna pelo nome", () => {
  assert.equal(tipoDaColuna("faturamento"), "reais");
  assert.equal(tipoDaColuna("ticket_medio"), "reais");
  assert.equal(tipoDaColuna("atingimento_meta_pct"), "pct");
  assert.equal(tipoDaColuna("unidades"), "inteiro");
  assert.equal(tipoDaColuna("mes"), "mes");
  assert.equal(tipoDaColuna("vendido_em"), "data");
  assert.equal(tipoDaColuna("loja"), "texto");
});

test("valores em pt-BR", () => {
  assert.equal(sem(formatarValor("faturamento", 45412345.67)), "R$ 45.412.345,67");
  assert.equal(sem(formatarValor("faturamento", 45412345.67, true)), "R$ 45,4 mi");
  assert.equal(formatarValor("atingimento_meta_pct", 72.1), "72,1%");
  assert.equal(formatarValor("unidades", 6581), "6.581");
  assert.equal(formatarValor("ano", 2026), "2026");
  assert.equal(formatarValor("mes", "2026-09-01"), "set/26");
  assert.equal(formatarValor("vendido_em", "2026-09-30 18:22:10-03"), "30/09/2026 18:22");
  assert.equal(formatarValor("loja", null), "—");
  assert.equal(formatarValor("ativo", false), "não");
});

test("número da resposta com unidade e plural", () => {
  assert.equal(formatarNumero(93, "unidades"), "93 unidades");
  assert.equal(formatarNumero(1, "unidades"), "1 unidade");
  assert.equal(formatarNumero(96.3, "%"), "96,3%");
  assert.equal(formatarNumero(2, "vendas"), "2 vendas");
});

test("datas, meses, rótulos e duração", () => {
  assert.equal(formatarMes("2024-12-01"), "dez/24");
  assert.equal(formatarData("2026-09-30"), "30/09/2026");
  assert.equal(formatarData("texto"), "texto");
  assert.equal(rotuloDaColuna("ticket_medio"), "Ticket médio");
  assert.equal(rotuloDaColuna("cliente_vip"), "Cliente vip");
  assert.equal(formatarDuracao(450), "450 ms");
  assert.equal(formatarDuracao(1728), "1,7 s");
});

test("escalas: passo e marcas redondas", () => {
  assert.equal(passoRedondo(93), 25);
  assert.deepEqual(marcas(93), [0, 25, 50, 75, 100]);
  // 45,4 mi / 4 marcas = passo bruto de 11,35 mi -> arredonda para 2 x 10^7.
  assert.deepEqual(marcas(45_412_345), [0, 20_000_000, 40_000_000, 60_000_000]);
  assert.deepEqual(marcas(0), [0, 1]);
  const x = escalaLinear(0, 100, 10, 210);
  assert.equal(x(50), 110);
  assert.equal(maisProximo([0, 10, 20, 30], 17), 2);
});
