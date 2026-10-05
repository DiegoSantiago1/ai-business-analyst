/**
 * Camada 1 da defesa (D6): as travas do SQL livre (ferramenta executar_sql) na APLICAÇÃO.
 *
 * Elas param o problema cedo e dão à IA uma mensagem clara para corrigir o SQL. Não são a
 * garantia: um SQL criativo pode passar por uma checagem de texto. Por baixo delas ainda
 * há o protocolo estendido (um comando só), a transação READ ONLY com tempo máximo e,
 * por fim, as permissões do banco (o usuário da IA só tem SELECT nas views do schema ia).
 */
import { ErroFerramenta } from "../metricas.ts";

export const TAMANHO_MAXIMO_SQL = 4_000;
export const MAX_LINHAS = 200;

/** Palavras que um SELECT de análise não precisa e que aparecem em ataques. */
const PROIBIDAS: [RegExp, string][] = [
  [/\binto\b/i, "SELECT ... INTO cria tabela"],
  [/\bfor\s+(update|share|no\s+key\s+update|key\s+share)\b/i, "trava de linhas"],
  [/\bpg_sleep/i, "pg_sleep (espera proposital)"],
  [/\bpg_(terminate|cancel)_backend\b/i, "derrubar conexões"],
  [/\bset_config\b/i, "mudar configuração da sessão"],
  [/\bpg_(read_file|read_binary_file|ls_dir|stat_file)\b/i, "ler arquivos do servidor"],
  [/\blo_(import|export|get|put|open)\b/i, "large objects"],
  [/\bdblink|\bpg_advisory|\btxid_|\bpg_notify\b/i, "função de sistema"],
  [
    /\bpg_catalog\b|\binformation_schema\b|\bpg_(stat|roles|user|authid|shadow|settings|proc)/i,
    "catálogo do sistema (use descrever_tabelas)",
  ],
  [/\bcopy\b/i, "COPY"],
];

/**
 * Valida o SQL escrito pela IA e devolve o SQL que vai de fato ao banco: envolvido num
 * SELECT externo com LIMIT (MAX_LINHAS + 1, para saber se houve corte).
 */
export function prepararSqlLivre(entrada: unknown): string {
  if (typeof entrada !== "string" || entrada.trim() === "") {
    throw new ErroFerramenta("Informe o SQL em 'sql'.");
  }
  // Um ";" no fim é comum e inofensivo; qualquer outro é recusado.
  const sql = entrada.trim().replace(/;\s*$/, "").trim();
  if (sql.length > TAMANHO_MAXIMO_SQL) {
    throw new ErroFerramenta(`SQL longo demais (máx. ${TAMANHO_MAXIMO_SQL} caracteres).`);
  }
  if (!/^(select|with)\b/i.test(sql)) {
    throw new ErroFerramenta("Só consultas: o SQL tem de começar com SELECT ou WITH.");
  }
  if (sql.includes(";")) {
    throw new ErroFerramenta("Um comando só: tire o ';' do meio do SQL.");
  }
  for (const [padrao, motivo] of PROIBIDAS) {
    if (padrao.test(sql)) throw new ErroFerramenta(`SQL recusado: ${motivo} não é permitido.`);
  }
  // As quebras de linha isolam um comentário "--" no fim do SQL da IA: sem elas, o
  // comentário engoliria o ") AS consulta_ia" e o LIMIT.
  return `SELECT * FROM (\n${sql}\n) AS consulta_ia LIMIT ${MAX_LINHAS + 1}`;
}
