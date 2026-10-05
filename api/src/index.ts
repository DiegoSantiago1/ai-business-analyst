/**
 * Sobe a API. Uso: npm start (ou npm run dev, que reinicia ao salvar).
 * Escuta só em 127.0.0.1 (lição do Projeto 1): não fica exposta na rede local.
 */
import { fileURLToPath } from "node:url";
import { criarPool } from "./banco.ts";
import { carregarConfigBanco, carregarConfigIA, lerAmbiente } from "./config.ts";
import { ClienteGroq } from "./ia/groq.ts";
import { criarApp } from "./servidor/app.ts";
import { LimitePorIp, OrcamentoDiario } from "./servidor/limites.ts";
import { Registro } from "./servidor/registro.ts";
import { carregarVocabulario } from "./vocabulario.ts";

const env = lerAmbiente();
const porta = Number(env.PORTA ?? 3335);
// Teto próprio de tokens por dia, abaixo dos 200 mil do provedor: sobra cota para a avaliação.
const teto = Number(env.ORCAMENTO_DIARIO_TOKENS ?? 150_000);
// Perguntas por minuto por IP (a avaliação, rodando na mesma máquina, usa um valor maior).
const porMinuto = Number(env.LIMITE_POR_MINUTO ?? 6);

const ia = carregarConfigIA(env);
const pool = criarPool(carregarConfigBanco(env));
const registro = new Registro(fileURLToPath(new URL("../registros", import.meta.url)));
const app = criarApp({
  provedor: new ClienteGroq({ chave: ia.chave, modelo: ia.modelo, esforco: ia.esforco }),
  contexto: { pool, vocabulario: await carregarVocabulario(pool) },
  limitePorIp: new LimitePorIp(porMinuto),
  orcamento: new OrcamentoDiario(teto, await registro.tokensDeHoje(ia.modelo)),
  registro,
  pastaWeb: fileURLToPath(new URL("../../web/dist", import.meta.url)),
});

const servidor = app.listen(porta, "127.0.0.1", () => {
  console.log(`API em http://127.0.0.1:${porta} (modelo ${ia.modelo})`);
});

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.once(sinal, () => {
    servidor.close(() => void pool.end());
  });
}
