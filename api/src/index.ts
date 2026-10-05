/**
 * Sobe a API. Uso: npm start (ou npm run dev, que reinicia ao salvar).
 * Na máquina escuta só em 127.0.0.1 (lição do Projeto 1); no container da nuvem,
 * HOST=0.0.0.0 e TRUST_PROXY=true (ver docs/DEPLOY.md).
 */
import { fileURLToPath } from "node:url";
import { criarPool } from "./banco.ts";
import {
  carregarConfigBanco,
  carregarConfigIA,
  carregarConfigServidor,
  lerAmbiente,
} from "./config.ts";
import { ClienteGroq } from "./ia/groq.ts";
import type { ProvedorIA } from "./ia/provedor.ts";
import { ProvedorComReserva } from "./ia/reserva.ts";
import { criarApp } from "./servidor/app.ts";
import { LimitePorIp, OrcamentoPorModelo } from "./servidor/limites.ts";
import { Registro } from "./servidor/registro.ts";
import { carregarVocabulario } from "./vocabulario.ts";

const env = lerAmbiente();
const servidorConfig = carregarConfigServidor(env);
const ia = carregarConfigIA(env);
const pool = criarPool(carregarConfigBanco(env));
const registro = new Registro(fileURLToPath(new URL("../registros", import.meta.url)));

const modelos = ia.reserva ? [ia.modelo, ia.reserva] : [ia.modelo];
const gastoInicial = Object.fromEntries(
  await Promise.all(modelos.map(async (m) => [m, await registro.tokensDeHoje(m)] as const)),
);
const orcamento = new OrcamentoPorModelo(servidorConfig.orcamentoDiario, gastoInicial);

const cliente = (modelo: string) =>
  new ClienteGroq({ chave: ia.chave, modelo, esforco: ia.esforco });
const provedor: ProvedorIA = ia.reserva
  ? new ProvedorComReserva(
      cliente(ia.modelo),
      cliente(ia.reserva),
      (m) => orcamento.disponivel(m),
      (m) => orcamento.esgotar(m),
    )
  : cliente(ia.modelo);

const app = criarApp({
  provedor,
  contexto: { pool, vocabulario: await carregarVocabulario(pool) },
  limitePorIp: new LimitePorIp(servidorConfig.limitePorMinuto),
  orcamento,
  modelos,
  registro,
  pastaWeb: fileURLToPath(new URL("../../web/dist", import.meta.url)),
});
// Atrás do proxy da plataforma, o IP do visitante vem no X-Forwarded-For (1 salto).
if (servidorConfig.confiarNoProxy) app.set("trust proxy", 1);

const servidor = app.listen(servidorConfig.porta, servidorConfig.host, () => {
  console.log(
    `API em http://${servidorConfig.host}:${servidorConfig.porta} (modelos: ${modelos.join(" -> ")})`,
  );
});

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.once(sinal, () => {
    servidor.close(() => void pool.end());
  });
}
