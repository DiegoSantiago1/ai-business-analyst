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
  ANALISTA_DB_NAME_TESTE: identificador,
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

  const config = {
    host: v.ANALISTA_DB_HOST,
    porta: v.ANALISTA_DB_PORT,
    banco: teste ? v.ANALISTA_DB_NAME_TESTE : v.ANALISTA_DB_NAME,
    usuario: v.ANALISTA_IA_USER,
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
});

export interface ConfigIA {
  readonly modelo: "openai/gpt-oss-20b" | "openai/gpt-oss-120b";
  readonly esforco: "low" | "medium" | "high";
  readonly chave: string;
}

export function carregarConfigIA(env: Ambiente = lerAmbiente()): ConfigIA {
  const resultado = esquemaIA.safeParse(env);
  if (!resultado.success) throw erroDeValidacao(resultado.error);
  const v = resultado.data;
  const config = { modelo: v.GROQ_MODELO, esforco: v.GROQ_ESFORCO };
  return Object.freeze(
    Object.defineProperty(config, "chave", { value: v.GROQ_API_KEY, enumerable: false }),
  ) as ConfigIA;
}
