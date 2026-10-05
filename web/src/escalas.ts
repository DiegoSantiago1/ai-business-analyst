/**
 * Escalas do gráfico (SVG feito à mão, sem biblioteca): marcas "redondas" no eixo e
 * conversão valor -> pixel. Funções puras, testadas no Node.
 */

/** Passo "redondo" (1, 2, 2,5 ou 5 x 10^n) para ~`alvo` marcas entre 0 e `maximo`. */
export function passoRedondo(maximo: number, alvo = 4): number {
  if (!(maximo > 0)) return 1;
  const bruto = maximo / alvo;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const fracao = bruto / potencia;
  const fator = fracao <= 1 ? 1 : fracao <= 2 ? 2 : fracao <= 2.5 ? 2.5 : fracao <= 5 ? 5 : 10;
  return fator * potencia;
}

/** Marcas do eixo de 0 até um teto redondo que cobre `maximo`. */
export function marcas(maximo: number, alvo = 4): number[] {
  const passo = passoRedondo(maximo, alvo);
  const teto = Math.max(passo, Math.ceil(maximo / passo) * passo);
  const lista: number[] = [];
  for (let v = 0; v <= teto + passo / 1e6; v += passo) lista.push(Number(v.toPrecision(12)));
  return lista;
}

/** Converte valor do domínio [d0, d1] para o intervalo de pixels [r0, r1]. */
export function escalaLinear(d0: number, d1: number, r0: number, r1: number) {
  const span = d1 - d0 || 1;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** Índice do ponto mais próximo de `x` numa lista de posições crescentes. */
export function maisProximo(posicoes: number[], x: number): number {
  let melhor = 0;
  for (let i = 1; i < posicoes.length; i++) {
    if (Math.abs((posicoes[i] ?? 0) - x) < Math.abs((posicoes[melhor] ?? 0) - x)) melhor = i;
  }
  return melhor;
}
