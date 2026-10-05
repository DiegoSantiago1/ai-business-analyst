/**
 * Faz UMA pergunta à IA de verdade (Groq) sobre o banco principal e mostra o resultado.
 * Gasta cota: use para medir tokens e conferir o comportamento real.
 *
 * Uso: node scripts/perguntar.ts "Qual loja vendeu mais este mês?" [--json]
 */
import { criarPool } from "../src/banco.ts";
import { carregarConfigBanco, carregarConfigIA } from "../src/config.ts";
import { perguntar } from "../src/ia/analista.ts";
import { ClienteGroq } from "../src/ia/groq.ts";
import { carregarVocabulario } from "../src/vocabulario.ts";

const pergunta = process.argv[2];
if (!pergunta) {
  console.error('Uso: node scripts/perguntar.ts "pergunta" [--json]');
  process.exit(2);
}
const ia = carregarConfigIA();
const pool = criarPool(carregarConfigBanco());
try {
  // --depurar: mostra o corpo de toda resposta de erro do Groq (ex.: failed_generation).
  const depurar: typeof fetch = async (url, init) => {
    const r = await fetch(url, init);
    const restantes = r.headers.get("x-ratelimit-remaining-tokens");
    const reinicia = r.headers.get("x-ratelimit-reset-tokens");
    console.error(
      `[groq ${r.status}] restantes=${restantes} reinicia=${reinicia} retry-after=${r.headers.get("retry-after")}`,
    );
    if (!r.ok) console.error(await r.clone().text());
    return r;
  };
  const esperarDepurando = async (ms: number) => {
    console.error(`[espera ${ms} ms]`);
    await new Promise((resolver) => setTimeout(resolver, ms));
  };
  const provedor = new ClienteGroq({
    chave: ia.chave,
    modelo: ia.modelo,
    esforco: ia.esforco,
    ...(process.argv.includes("--depurar") ? { fetch: depurar, esperar: esperarDepurando } : {}),
  });
  const contexto = { pool, vocabulario: await carregarVocabulario(pool) };
  const r = await perguntar(pergunta, provedor, contexto, [], {
    detalhada: process.argv.includes("--detalhada"),
  });
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    for (const p of r.passos) {
      console.log(`→ ${p.ferramenta} ${JSON.stringify(p.argumentos)}`);
      console.log(
        p.erro ? `  ERRO: ${p.erro}` : `  ${p.totalLinhas ?? 0} linha(s), ${p.duracaoMs} ms`,
      );
    }
    console.log(`\n${r.resposta}`);
    for (const n of r.numeros)
      console.log(`  ${n.conferido ? "✓" : "?"} ${n.rotulo}: ${n.valor} ${n.unidade}`);
    if (r.grafico) console.log(`  gráfico: ${r.grafico.tipo} ${r.grafico.x} × ${r.grafico.y}`);
    if (r.limitacoes) console.log(`  limitações: ${r.limitacoes}`);
    console.log(`\n${JSON.stringify(r.uso)}`);
  }
} catch (erro) {
  console.error(`ERRO ${(erro as Error).name}: ${(erro as Error).message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
