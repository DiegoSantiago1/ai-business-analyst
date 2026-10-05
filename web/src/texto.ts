/**
 * Markdown mínimo da resposta da IA: parágrafos, tópicos ("- " ou "• ") e **negrito**.
 *
 * O texto vem do modelo (e pode carregar dado hostil, como o cliente "<script>..."), então
 * NUNCA vira HTML: este analisador devolve blocos com pedaços de texto, e o React monta os
 * elementos escapando tudo. Função pura, testada no Node.
 */

export interface Pedaco {
  texto: string;
  negrito: boolean;
}

export type Bloco = { tipo: "paragrafo"; pedacos: Pedaco[] } | { tipo: "lista"; itens: Pedaco[][] };

/** "a **b** c" -> [{a }, {b, negrito}, { c}]. Asteriscos sem par ficam como texto. */
export function pedacos(linha: string): Pedaco[] {
  const partes = linha.split("**");
  if (partes.length % 2 === 0) return [{ texto: linha, negrito: false }];
  return partes.map((texto, i) => ({ texto, negrito: i % 2 === 1 })).filter((p) => p.texto !== "");
}

export function blocos(texto: string): Bloco[] {
  const resultado: Bloco[] = [];
  for (const bruta of texto.replace(/\r\n/g, "\n").split("\n")) {
    const linha = bruta.trim();
    if (!linha) continue;
    const topico = linha.match(/^(?:[-•*]|\d+[.)])\s+(.*)$/);
    const anterior = resultado.at(-1);
    if (topico) {
      const item = pedacos(topico[1] ?? "");
      if (anterior?.tipo === "lista") anterior.itens.push(item);
      else resultado.push({ tipo: "lista", itens: [item] });
    } else {
      resultado.push({ tipo: "paragrafo", pedacos: pedacos(linha) });
    }
  }
  return resultado;
}
