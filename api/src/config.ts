/**
 * Configuração da API, lida de variáveis de ambiente (arquivo .env da raiz do projeto).
 *
 * A validação acontece aqui, na borda, com zod: valor ausente ou inválido gera um erro
 * claro na subida, e não um erro confuso lá dentro do driver do PostgreSQL.
 *
 * A API só conhece o usuário SOMENTE LEITURA da IA (ANALISTA_IA_USER). A senha do dono
 * do banco nunca é lida aqui: mesmo que alguém engane a IA, a API não tem como conectar
 * com mais privilégio do que o necessário.
 */
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { z } from "zod";

z.config(z.locales.pt());

const ARQUIVO_ENV = new URL("../../.env", import.meta.url);

export class ConfigError extends Error {
  override name = "ConfigError";
}

export type Ambiente = Readonly<Record<string, string | undefined>>;

/**
 * Variáveis do processo por cima das do .env (quem define no ambiente ganha, como no
 * python-dotenv com override=False). Não altera process.env.
 */
export function lerAmbiente(arquivo: URL = ARQUIVO_ENV): Ambiente {
  const doArquivo = existsSync(arquivo) ? parseEnv(readFileSync(arquivo, "utf8")) : {};
  return { ...doArquivo, ...process.env };
}

// Mesma regra do lado Python (analista.config): só minúsculas, dígitos e "_".
const identificador = z
  .string()
  .regex(/^[a-z_][a-z0-9_]{0,62}$/, "use só letras minúsculas, dígitos e '_' (máx. 63)");

const esquemaBanco = z.object({
  ANALISTA_DB_HOST: z.string().trim().min(1),
  ANALISTA_DB_PORT: z.coerce.number().int().min(1).max(65535),
  ANALISTA_DB_NAME: identificador,
  // Opcional em produção (lá não há banco de testes); obrigatório para { teste: true }.
  ANALISTA_DB_NAME_TESTE: identificador.optional(),
  // TLS até o banco: obrigatório num PostgreSQL gerenciado (Neon); desligado no local.
  ANALISTA_DB_SSL: z.stringbool().default(false),
  ANALISTA_IA_USER: identificador,
  ANALISTA_IA_PASSWORD: z.string().min(1),
  // Opcional: só serve para recusar a configuração se o usuário da IA for o dono.
  ANALISTA_DB_USER: identificador.optional(),
});

export interface ConfigBanco {
  readonly host: string;
  readonly porta: number;
  readonly banco: string;
  readonly usuario: string;
  readonly senha: string;
  readonly ssl: boolean;
}

function erroDeValidacao(erro: z.ZodError): ConfigError {
  const linhas = erro.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  return new ConfigError(`Configuração inválida (veja .env.example):\n${linhas.join("\n")}`);
}

/**
 * Configuração do banco para o usuário da IA. Com `teste: true`, aponta para o banco
 * de testes (o mesmo que o pytest recria).
 */
export function carregarConfigBanco(
  env: Ambiente = lerAmbiente(),
  { teste = false }: { teste?: boolean } = {},
): ConfigBanco {
  const resultado = esquemaBanco.safeParse(env);
  if (!resultado.success) throw erroDeValidacao(resultado.error);
  const v = resultado.data;

  if (v.ANALISTA_IA_USER === v.ANALISTA_DB_USER || v.ANALISTA_IA_USER === "analista_leitura") {
    throw new ConfigError(
      "ANALISTA_IA_USER precisa ser o usuário somente leitura da IA, nunca o dono do banco.",
    );
  }

  if (teste && !v.ANALISTA_DB_NAME_TESTE) {
    throw new ConfigError("ANALISTA_DB_NAME_TESTE: obrigatório para usar o banco de testes.");
  }
  const config = {
    host: v.ANALISTA_DB_HOST,
    porta: v.ANALISTA_DB_PORT,
    banco: teste ? (v.ANALISTA_DB_NAME_TESTE as string) : v.ANALISTA_DB_NAME,
    usuario: v.ANALISTA_IA_USER,
    ssl: v.ANALISTA_DB_SSL,
  };
  // Senha não enumerável: não aparece em console.log nem em JSON.stringify (o mesmo
  // papel do repr=False do lado Python), mas continua acessível para o driver.
  return Object.freeze(
    Object.defineProperty(config, "senha", { value: v.ANALISTA_IA_PASSWORD, enumerable: false }),
  ) as ConfigBanco;
}

// --------------------------------------------------------------------------- IA

const esquemaIA = z.object({
  GROQ_API_KEY: z.string().trim().min(1),
  // Só modelos "production" do Groq (D4); o padrão economiza a cota do 120b (D12).
  GROQ_MODELO: z.enum(["openai/gpt-oss-20b", "openai/gpt-oss-120b"]).default("openai/gpt-oss-20b"),
  GROQ_ESFORCO: z.enum(["low", "medium", "high"]).default("low"),
  // Modelo reserva: quando a cota do dia do principal acaba, as perguntas vão para ele
  // (a cota do Groq é por modelo, então a reserva dobra as perguntas por dia).
  GROQ_MODELO_RESERVA: z.enum(["openai/gpt-oss-20b", "openai/gpt-oss-120b"]).optional(),
});

type Modelo = "openai/gpt-oss-20b" | "openai/gpt-oss-120b";

export interface ConfigIA {
  readonly modelo: Modelo;
  readonly reserva: Modelo | undefined;
  readonly esforco: "low" | "medium" | "high";
  readonly chave: string;
}

export function carregarConfigIA(env: Ambiente = lerAmbiente()): ConfigIA {
  const resultado = esquemaIA.safeParse(env);
  if (!resultado.success) throw erroDeValidacao(resultado.error);
  const v = resultado.data;
  if (v.GROQ_MODELO_RESERVA === v.GROQ_MODELO) {
    throw new ConfigError("GROQ_MODELO_RESERVA precisa ser diferente de GROQ_MODELO.");
  }
  const config = { modelo: v.GROQ_MODELO, reserva: v.GROQ_MODELO_RESERVA, esforco: v.GROQ_ESFORCO };
  return Object.freeze(
    Object.defineProperty(config, "chave", { value: v.GROQ_API_KEY, enumerable: false }),
  ) as ConfigIA;
}

// --------------------------------------------------------------------------- servidor

const esquemaServidor = z.object({
  // 127.0.0.1 na máquina (lição do Projeto 1); 0.0.0.0 dentro do container na nuvem.
  HOST: z.string().trim().min(1).default("127.0.0.1"),
  // PORT é o nome que as plataformas (Render, Hugging Face) usam; PORTA, o nosso.
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
  PORTA: z.coerce.number().int().min(1).max(65535).default(3335),
  // Atrás do proxy da plataforma, o IP do visitante vem no X-Forwarded-For.
  TRUST_PROXY: z.stringbool().default(false),
  // Teto próprio de tokens por dia e por modelo (o provedor dá 200 mil no gratuito).
  ORCAMENTO_DIARIO_TOKENS: z.coerce.number().int().min(1).default(150_000),
  LIMITE_POR_MINUTO: z.coerce.number().int().min(1).max(600).default(6),
});

export interface ConfigServidor {
  readonly host: string;
  readonly porta: number;
  readonly confiarNoProxy: boolean;
  readonly orcamentoDiario: number;
  readonly limitePorMinuto: number;
}

export function carregarConfigServidor(env: Ambiente = lerAmbiente()): ConfigServidor {
  const resultado = esquemaServidor.safeParse(env);
  if (!resultado.success) throw erroDeValidacao(resultado.error);
  const v = resultado.data;
  return {
    host: v.HOST,
    porta: v.PORT ?? v.PORTA,
    confiarNoProxy: v.TRUST_PROXY,
    orcamentoDiario: v.ORCAMENTO_DIARIO_TOKENS,
    limitePorMinuto: v.LIMITE_POR_MINUTO,
  };
}
