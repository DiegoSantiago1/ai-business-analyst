import { useState } from "react";
import {
  formatarDuracao,
  formatarInteiro,
  formatarNumero,
  formatarValor,
  rotuloDaColuna,
} from "../formatar.ts";
import { blocos } from "../texto.ts";
import type { Numero, Passo, Resultado, Tabela } from "../tipos.ts";
import { Grafico } from "./Grafico.tsx";

const NOME_FERRAMENTA: Record<string, string> = {
  consultar_metrica: "Métrica oficial",
  executar_sql: "SQL livre (com travas)",
  descrever_tabelas: "Descrição das tabelas",
};

export function Resposta({ r }: { r: Resultado }) {
  const [aba, setAba] = useState<"grafico" | "tabela">(r.grafico ? "grafico" : "tabela");
  return (
    <article className="rounded-2xl border border-linha bg-superficie p-4 sm:p-5">
      <TextoRico texto={r.resposta} />

      {r.numeros.length > 0 && <Numeros numeros={r.numeros} />}

      {r.limitacoes && !/^nenhum/i.test(r.limitacoes) && (
        <p className="mt-3 mb-0 text-sm text-tinta-2">
          <span className="font-medium">Ressalva:</span> {r.limitacoes}
        </p>
      )}

      {r.tabela && r.tabela.linhas.length > 0 && (
        <section className="mt-5">
          {r.grafico && (
            <div role="tablist" aria-label="Ver resultado como" className="mb-3 flex gap-1 text-sm">
              {(["grafico", "tabela"] as const).map((opcao) => (
                <button
                  key={opcao}
                  type="button"
                  role="tab"
                  aria-selected={aba === opcao}
                  onClick={() => setAba(opcao)}
                  className={`rounded-full px-3 py-1 ${aba === opcao ? "bg-tinta text-superficie" : "text-tinta-2 hover:bg-fundo"}`}
                >
                  {opcao === "grafico" ? "Gráfico" : "Tabela"}
                </button>
              ))}
            </div>
          )}
          {r.grafico && aba === "grafico" ? (
            <Grafico grafico={r.grafico} linhas={r.tabela.linhas} />
          ) : (
            <TabelaDados tabela={r.tabela} />
          )}
        </section>
      )}

      <Bastidores passos={r.passos} uso={r.uso} />
    </article>
  );
}

/** Parágrafos, tópicos e negrito da resposta; tudo como texto (o React escapa). */
function TextoRico({ texto }: { texto: string }) {
  return (
    <div className="space-y-2 text-[15px] leading-relaxed">
      {blocos(texto).map((bloco, i) =>
        bloco.tipo === "lista" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: blocos de um texto fixo, sem reordenação
          <ul key={i} className="m-0 list-disc space-y-1 pl-5">
            {bloco.itens.map((item, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: idem
              <li key={j}>
                <Pedacos pedacos={item} />
              </li>
            ))}
          </ul>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: idem
          <p key={i} className="m-0">
            <Pedacos pedacos={bloco.pedacos} />
          </p>
        ),
      )}
    </div>
  );
}

function Pedacos({ pedacos }: { pedacos: { texto: string; negrito: boolean }[] }) {
  return (
    <>
      {pedacos.map((p, i) =>
        // biome-ignore lint/suspicious/noArrayIndexKey: idem
        p.negrito ? <strong key={i}>{p.texto}</strong> : <span key={i}>{p.texto}</span>,
      )}
    </>
  );
}

const CARTOES_VISIVEIS = 4;

function Numeros({ numeros }: { numeros: Numero[] }) {
  const [todos, setTodos] = useState(false);
  const visiveis = todos ? numeros : numeros.slice(0, CARTOES_VISIVEIS);
  const escondidos = numeros.length - visiveis.length;
  return (
    <>
      <ul className="mt-4 grid list-none gap-2 p-0 sm:grid-cols-2">
        {visiveis.map((n) => (
          <CartaoNumero key={`${n.rotulo}-${n.valor}`} n={n} />
        ))}
      </ul>
      {escondidos > 0 && (
        <button
          type="button"
          onClick={() => setTodos(true)}
          className="mt-2 text-sm text-acento hover:underline"
        >
          Ver mais {escondidos} {escondidos === 1 ? "número" : "números"} citados
        </button>
      )}
    </>
  );
}

function CartaoNumero({ n }: { n: Numero }) {
  return (
    <li className="rounded-xl border border-linha bg-superficie-2 px-3 py-2">
      <div className="text-xs text-tinta-3">{n.rotulo}</div>
      <div className="font-titulo text-xl font-semibold">{formatarNumero(n.valor, n.unidade)}</div>
      {n.conferido ? (
        <div className="mt-0.5 text-xs text-bom">
          <span aria-hidden="true">✓ </span>conferido no banco
        </div>
      ) : (
        <div
          className="mt-0.5 text-xs text-aviso"
          title="Este valor não aparece igual em nenhum resultado do banco: foi calculado (ou copiado errado) pela IA."
        >
          <span aria-hidden="true">△ </span>calculado pela IA
        </div>
      )}
    </li>
  );
}

function TabelaDados({ tabela }: { tabela: Tabela }) {
  const linhas = tabela.linhas.slice(0, 50);
  return (
    <div className="max-h-80 overflow-auto rounded-xl border border-linha">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-superficie-2">
          <tr>
            {tabela.colunas.map((c) => (
              <th
                key={c}
                scope="col"
                className={`border-b border-linha px-3 py-2 font-medium whitespace-nowrap text-tinta-2 ${
                  typeof linhas[0]?.[c] === "number" ? "text-right" : "text-left"
                }`}
              >
                {rotuloDaColuna(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: linhas de resultado não têm id próprio
            <tr key={i} className="border-b border-linha last:border-0">
              {tabela.colunas.map((c) => (
                <td
                  key={c}
                  className={`px-3 py-1.5 ${typeof l[c] === "number" ? "text-right tabular-nums whitespace-nowrap" : ""}`}
                >
                  {formatarValor(c, l[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {(tabela.linhas.length > linhas.length || tabela.truncado) && (
        <p className="m-0 px-3 py-2 text-xs text-tinta-3">
          Mostrando {linhas.length} de {tabela.linhas.length}
          {tabela.truncado ? "+ (resultado cortado em 200 linhas)" : ""}.
        </p>
      )}
    </div>
  );
}

function Bastidores({ passos, uso }: { passos: Passo[]; uso: Resultado["uso"] }) {
  return (
    <details className="group mt-5 rounded-xl border border-linha bg-superficie-2">
      <summary className="cursor-pointer list-none px-3 py-2 text-sm text-tinta-2 select-none">
        <span className="inline-block transition-transform group-open:rotate-90" aria-hidden="true">
          ›
        </span>{" "}
        Como a IA chegou aqui · {passos.length} {passos.length === 1 ? "consulta" : "consultas"} ·{" "}
        {formatarDuracao(uso.latenciaMs)}
        {(uso.esperaCotaMs ?? 0) >= 1000 &&
          ` (${formatarDuracao(uso.esperaCotaMs ?? 0)} esperando a cota gratuita)`}{" "}
        · {formatarInteiro(uso.tokensTotal)} tokens
      </summary>
      <ol className="m-0 list-none space-y-3 px-3 pb-3">
        {passos.map((p, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a ordem dos passos é a identidade deles
          <li key={i} className="text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">
                {i + 1}. {NOME_FERRAMENTA[p.ferramenta] ?? p.ferramenta}
              </span>
              <span className="text-xs text-tinta-3">
                {p.erro ? "recusado / erro" : `${p.totalLinhas ?? 0} linha(s)`} ·{" "}
                {formatarDuracao(p.duracaoMs)}
              </span>
            </div>
            {p.erro && <p className="my-1 text-critico">{p.erro}</p>}
            {p.sql && (
              <pre className="mt-1 mb-0 overflow-x-auto rounded-lg bg-fundo p-2 font-mono text-xs leading-relaxed">
                <code>{p.sql}</code>
              </pre>
            )}
            {p.parametros && p.parametros.length > 0 && (
              <p className="mt-1 mb-0 font-mono text-xs break-all text-tinta-3">
                parâmetros:{" "}
                {p.parametros.map((v, j) => `$${j + 1} = ${JSON.stringify(v)}`).join(" · ")}
              </p>
            )}
            {!p.sql && !p.erro && p.ferramenta !== "descrever_tabelas" && (
              <p className="mt-1 mb-0 font-mono text-xs text-tinta-3">
                {JSON.stringify(p.argumentos)}
              </p>
            )}
          </li>
        ))}
        <li className="text-xs text-tinta-3">
          Modelo {uso.modelo} · prompt {uso.versaoPrompt} · {uso.voltas}{" "}
          {uso.voltas === 1 ? "volta" : "voltas"} · {formatarInteiro(uso.tokensEntrada)} tokens de
          entrada e {formatarInteiro(uso.tokensSaida)} de saída
        </li>
      </ol>
    </details>
  );
}
