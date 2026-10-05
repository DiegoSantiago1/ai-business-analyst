import type { ErroApi, Resultado } from "./tipos.ts";

export interface Troca {
  pergunta: string;
  resposta: string;
}

export class FalhaApi extends Error {
  readonly detalhe: ErroApi;
  constructor(detalhe: ErroApi) {
    super(detalhe.mensagem);
    this.detalhe = detalhe;
  }
}

/** Pergunta à API. Toda falha vira FalhaApi com um código estável (ver tipos.ts). */
export async function perguntarApi(
  pergunta: string,
  historico: Troca[],
  sinal?: AbortSignal,
): Promise<Resultado> {
  let resposta: Response;
  try {
    resposta = await fetch("/api/perguntar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pergunta, historico: historico.slice(-3) }),
      ...(sinal ? { signal: sinal } : {}),
    });
  } catch {
    throw new FalhaApi({ erro: "rede", mensagem: "Sem conexão com a API. Ela está rodando?" });
  }
  const corpo: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const erro = corpo as Partial<ErroApi> | null;
    throw new FalhaApi({
      erro: erro?.erro ?? "interno",
      mensagem: erro?.mensagem ?? `Erro ${resposta.status}.`,
      ...(erro?.tentarEmSegundos ? { tentarEmSegundos: erro.tentarEmSegundos } : {}),
    });
  }
  return corpo as Resultado;
}
