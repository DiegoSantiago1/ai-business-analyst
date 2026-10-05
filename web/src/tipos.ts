/**
 * Contrato da API (POST /api/perguntar), espelhado de api/src/ia/analista.ts.
 * Duplicado de propósito: a interface depende só do JSON, não do código da API.
 */

export type Unidade = "R$" | "unidades" | "vendas" | "%" | "outro";

export interface Numero {
  rotulo: string;
  valor: number;
  unidade: Unidade;
  conferido: boolean;
}

export type Linha = Record<string, string | number | boolean | null>;

export interface Tabela {
  colunas: string[];
  linhas: Linha[];
  sql: string;
  truncado: boolean;
}

export interface Grafico {
  tipo: "barra" | "linha";
  x: string;
  y: string;
}

export interface Passo {
  ferramenta: string;
  argumentos: unknown;
  sql?: string;
  parametros?: unknown[];
  colunas?: string[];
  linhas?: Linha[];
  totalLinhas?: number;
  truncado?: boolean;
  erro?: string;
  duracaoMs: number;
}

export interface Resultado {
  pergunta: string;
  resposta: string;
  numeros: Numero[];
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
    /** Parte da latência esperando a cota por minuto do plano gratuito do provedor. */
    esperaCotaMs?: number;
  };
}

export type CodigoErro =
  | "entrada_invalida"
  | "limite_por_ip"
  | "ocupado"
  | "cota_esgotada"
  | "falha_ia"
  | "interno"
  | "rede";

export interface ErroApi {
  erro: CodigoErro;
  mensagem: string;
  tentarEmSegundos?: number;
}
