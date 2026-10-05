/**
 * O loop de tool calling: pergunta -> ferramenta -> resultado -> ... -> responder.
 *
 * Limites que protegem a cota e o tempo de resposta:
 * - no máximo MAX_VOLTAS chamadas ao modelo por pergunta; na última, o modelo é obrigado
 *   a chamar "responder" (tool_choice com o nome da ferramenta);
 * - orçamento de tokens por pergunta: estourou, a próxima volta também força "responder";
 * - resposta final inválida (zod): o erro volta ao modelo UMA vez para ele corrigir;
 *   falhou de novo, ErroRespostaInvalida.
 */
import type { Contexto, Passo } from "./ferramentas.ts";
import { executarFerramenta, FERRAMENTAS, resultadoParaModelo } from "./ferramentas.ts";
import { montarPromptSistema, versaoDoPrompt } from "./prompt.ts";
import type { EscolhaFerramenta, Mensagem, ProvedorIA } from "./provedor.ts";
import {
  conferir,
  esquemaResposta,
  type Grafico,
  inferirGrafico,
  type NumeroConferido,
  numerosDosResultados,
  type Tabela,
  ultimaTabela,
  validarGrafico,
} from "./resposta.ts";

export const MAX_VOLTAS = 6;
export const ORCAMENTO_TOKENS_POR_PERGUNTA = 16_000;
const MAX_HISTORICO = 3;

export class ErroRespostaInvalida extends Error {
  override name = "ErroRespostaInvalida";
}

export interface TrocaAnterior {
  pergunta: string;
  resposta: string;
}

export interface ResultadoPergunta {
  pergunta: string;
  resposta: string;
  numeros: NumeroConferido[];
  limitacoes?: string;
  tabela?: Tabela;
  grafico?: Grafico;
  passos: Passo[];
  uso: {
    modelo: string;
    versaoPrompt: string;
    voltas: number;
    tokensEntrada: number;
    tokensSaida: number;
    tokensTotal: number;
    latenciaMs: number;
    /** Parte da latência gasta esperando a cota do minuto do provedor. */
    esperaCotaMs: number;
  };
}

const RESPONDER: EscolhaFerramenta = { type: "function", function: { name: "responder" } };

export async function perguntar(
  pergunta: string,
  provedor: ProvedorIA,
  contexto: Contexto,
  historico: TrocaAnterior[] = [],
  { detalhada = false }: { detalhada?: boolean } = {},
): Promise<ResultadoPergunta> {
  const inicio = performance.now();
  const mensagens: Mensagem[] = [
    { role: "system", content: montarPromptSistema(contexto.vocabulario, { detalhada }) },
  ];
  for (const troca of historico.slice(-MAX_HISTORICO)) {
    mensagens.push(
      { role: "user", content: troca.pergunta },
      { role: "assistant", content: troca.resposta },
    );
  }
  mensagens.push({ role: "user", content: pergunta });

  const passos: Passo[] = [];
  const uso = { entrada: 0, saida: 0, total: 0, espera: 0 };
  let modelo = provedor.modelo;
  let correcoes = 0;
  // Depois de uma resposta em texto livre, a volta seguinte OBRIGA a ferramenta responder.
  let forcarResposta = false;

  for (let volta = 1; volta <= MAX_VOLTAS; volta++) {
    const ultimaChance =
      forcarResposta || volta === MAX_VOLTAS || uso.total >= ORCAMENTO_TOKENS_POR_PERGUNTA;
    forcarResposta = false;
    const r = await provedor.completar({
      mensagens,
      ferramentas: FERRAMENTAS,
      escolha: ultimaChance ? RESPONDER : "required",
      // A resposta detalhada (tópicos + sugestão) é mais longa: mais espaço de saída.
      maxTokensSaida: detalhada ? 1_200 : 800,
    });
    uso.entrada += r.uso.entrada;
    uso.saida += r.uso.saida;
    uso.total += r.uso.total;
    uso.espera += r.uso.esperaMs ?? 0;
    modelo = r.modelo;

    // Os gpt-oss chamam uma ferramenta por volta; se vierem várias, todas são atendidas.
    const chamadas = r.mensagem.tool_calls ?? [];
    if (chamadas.length === 0) {
      // Respondeu em texto livre (fora do contrato): pede a resposta pela ferramenta.
      mensagens.push(
        { role: "assistant", content: r.mensagem.content ?? "" },
        { role: "user", content: "Use a ferramenta responder para dar a resposta final." },
      );
      forcarResposta = true;
      continue;
    }
    mensagens.push({
      role: "assistant",
      content: r.mensagem.content ?? null,
      tool_calls: chamadas,
    });

    for (const chamada of chamadas) {
      const { name: nome, arguments: argumentos } = chamada.function;
      if (nome === "responder") {
        const final = validarResposta(argumentos, passos);
        if (final.ok) {
          return {
            pergunta,
            ...final.valor,
            passos,
            uso: {
              modelo,
              versaoPrompt: versaoDoPrompt({ detalhada }),
              voltas: volta,
              tokensEntrada: uso.entrada,
              tokensSaida: uso.saida,
              tokensTotal: uso.total,
              latenciaMs: Math.round(performance.now() - inicio),
              esperaCotaMs: uso.espera,
            },
          };
        }
        correcoes++;
        if (correcoes > 1) throw new ErroRespostaInvalida(`Resposta final inválida: ${final.erro}`);
        mensagens.push({
          role: "tool",
          tool_call_id: chamada.id,
          name: nome,
          content: JSON.stringify({ erro: `Resposta inválida, corrija: ${final.erro}` }),
        });
        continue;
      }
      const passo = await executarFerramenta(nome, argumentos, contexto);
      passos.push(passo);
      mensagens.push({
        role: "tool",
        tool_call_id: chamada.id,
        name: nome,
        content: resultadoParaModelo(passo),
      });
    }
  }
  // Sem resposta: o erro conta o que aconteceu (fica no registro, para diagnosticar).
  const usadas =
    passos.map((p) => `${p.ferramenta}${p.erro ? "(erro)" : ""}`).join(", ") || "nenhuma";
  const ultimaFalha = passos.findLast((p) => p.erro)?.erro ?? "";
  throw new ErroRespostaInvalida(
    `A IA não respondeu em ${MAX_VOLTAS} voltas. Ferramentas: ${usadas}.${ultimaFalha ? ` Última falha: ${ultimaFalha}` : ""}`,
  );
}

type Validacao =
  | {
      ok: true;
      valor: Pick<ResultadoPergunta, "resposta" | "numeros" | "limitacoes" | "tabela" | "grafico">;
    }
  | { ok: false; erro: string };

function validarResposta(argumentos: string, passos: Passo[]): Validacao {
  let bruto: unknown;
  try {
    bruto = JSON.parse(argumentos || "{}");
  } catch {
    return { ok: false, erro: "argumentos não são JSON válido" };
  }
  const lido = esquemaResposta.safeParse(bruto);
  if (!lido.success) {
    return {
      ok: false,
      erro: lido.error.issues
        .map((i) => `${i.path.join(".") || "resposta"}: ${i.message}`)
        .join("; "),
    };
  }
  const doBanco = numerosDosResultados(passos);
  const tabela = ultimaTabela(passos);
  const { resposta, numeros, grafico, limitacoes } = lido.data;
  // Sem pedido de gráfico: deduz um quando o formato da tabela é óbvio.
  const graficoValido = grafico ? validarGrafico(grafico, tabela) : inferirGrafico(tabela);
  return {
    ok: true,
    valor: {
      resposta,
      numeros: numeros.map((n) => ({ ...n, conferido: conferir(n.valor, doBanco) })),
      ...(limitacoes ? { limitacoes } : {}),
      ...(tabela ? { tabela } : {}),
      ...(graficoValido ? { grafico: graficoValido } : {}),
    },
  };
}
