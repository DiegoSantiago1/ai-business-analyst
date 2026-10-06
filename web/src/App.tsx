import { useEffect, useRef, useState } from "react";
import { FalhaApi, perguntarApi, type Saude, saudeApi, type Troca } from "./api.ts";
import { Resposta } from "./componentes/Resposta.tsx";
import type { ErroApi, Resultado } from "./tipos.ts";

const SUGESTOES = [
  "Quais lojas ficaram abaixo da meta em setembro de 2026?",
  "Qual linha de carro mais vendeu em 2026?",
  "Como evoluiu o faturamento mês a mês nos últimos 12 meses?",
  "O consórcio ganhou participação em 2026?",
  "Quem são os 5 melhores vendedores de 2026, em unidades?",
  "Qual loja tem o maior ticket médio?",
];

/** Link para a página com as conversas gravadas (publicada no GitHub Pages). */
const PAGINA_RESULTADOS =
  "https://diegosantiago1.github.io/Portifolio/projetos/ai-business-analyst/";

interface Item {
  id: number;
  pergunta: string;
  resultado?: Resultado;
  erro?: ErroApi;
}

type Tema = "light" | "dark";

function temaAtual(): Tema {
  const marcado = document.documentElement.dataset.theme;
  if (marcado === "light" || marcado === "dark") return marcado;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function App() {
  const [itens, setItens] = useState<Item[]>([]);
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [tema, setTema] = useState<Tema>(temaAtual);
  const fim = useRef<HTMLDivElement>(null);
  const proximoId = useRef(1);
  const [saude, setSaude] = useState<Saude | null>(null);
  // Resposta detalhada (contexto + sugestão) ligada por padrão; a escolha fica no navegador.
  const [detalhada, setDetalhada] = useState<boolean>(() => {
    try {
      return localStorage.getItem("detalhada") !== "nao";
    } catch {
      return true;
    }
  });
  const [acordando, setAcordando] = useState(false);

  // Estado da demonstração: perguntas restantes hoje e, se a 1ª resposta demora, o aviso
  // de que o servidor gratuito está acordando (pode levar ~1 min).
  useEffect(() => {
    const controle = new AbortController();
    const lento = setTimeout(() => setAcordando(true), 2_500);
    saudeApi(controle.signal)
      .then(setSaude)
      .catch(() => {})
      .finally(() => {
        clearTimeout(lento);
        setAcordando(false);
      });
    return () => {
      clearTimeout(lento);
      controle.abort();
    };
  }, []);

  // Rola até a última mensagem sempre que a conversa muda (as dependências são o gatilho).
  // biome-ignore lint/correctness/useExhaustiveDependencies: itens e carregando disparam a rolagem
  useEffect(() => {
    if (itens.length === 0) return; // sem conversa, a página fica no topo
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [itens, carregando]);

  function trocarTema() {
    const novo: Tema = tema === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = novo;
    try {
      localStorage.setItem("tema", novo);
    } catch {
      // sem armazenamento (aba privada): o tema vale só nesta visita
    }
    setTema(novo);
  }

  async function enviar(pergunta: string) {
    const limpa = pergunta.trim();
    if (limpa.length < 3 || carregando) return;
    const id = proximoId.current++;
    const historico: Troca[] = itens
      .filter((i) => i.resultado)
      .map((i) => ({ pergunta: i.pergunta, resposta: i.resultado?.resposta ?? "" }));
    setItens((atual) => [...atual, { id, pergunta: limpa }]);
    setTexto("");
    setCarregando(true);
    try {
      const resultado = await perguntarApi(limpa, historico, detalhada);
      setItens((atual) => atual.map((i) => (i.id === id ? { ...i, resultado } : i)));
      saudeApi()
        .then(setSaude)
        .catch(() => {});
    } catch (e) {
      const erro: ErroApi =
        e instanceof FalhaApi
          ? e.detalhe
          : { erro: "interno", mensagem: "Algo deu errado. Tente de novo." };
      setItens((atual) => atual.map((i) => (i.id === id ? { ...i, erro } : i)));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4">
      <header className="flex items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-3">
          <img src="/icone.svg" alt="" width={36} height={36} />
          <div>
            <h1 className="m-0 font-titulo text-lg leading-tight font-bold">
              Analista de Vendas IA
            </h1>
            <p className="m-0 text-xs text-tinta-3">
              5 concessionárias fictícias · dados até 30/09/2026
              <span className="hidden sm:inline"> · só leitura</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={PAGINA_RESULTADOS}
            className="hidden rounded-full px-3 py-1.5 text-sm text-tinta-2 hover:bg-superficie sm:inline"
          >
            Conversas gravadas ↗
          </a>
          <button
            type="button"
            onClick={trocarTema}
            className="shrink-0 rounded-full border border-linha px-3 py-1.5 text-sm whitespace-nowrap text-tinta-2 hover:bg-superficie"
            aria-label={tema === "dark" ? "Usar tema claro" : "Usar tema escuro"}
          >
            {tema === "dark" ? "☀ Claro" : "☾ Escuro"}
          </button>
        </div>
      </header>
      <AvisoDemo saude={saude} acordando={acordando} />

      <main className="flex-1 space-y-6 pb-6">
        {itens.length === 0 && <BoasVindas aoEscolher={enviar} />}
        {itens.map((item) => (
          <section key={item.id} className="space-y-3" aria-live="polite">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-tinta px-4 py-2.5 text-[15px] text-superficie">
              {item.pergunta}
            </p>
            {item.resultado && <Resposta r={item.resultado} />}
            {item.erro && <AvisoErro erro={item.erro} />}
            {!item.resultado && !item.erro && <Carregando />}
          </section>
        ))}
        <div ref={fim} />
      </main>

      <form
        className="sticky bottom-0 -mx-4 border-t border-linha bg-fundo/95 px-4 pt-3 pb-4 backdrop-blur"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(texto);
        }}
      >
        <div className="flex items-end gap-2 rounded-2xl border border-linha bg-superficie-2 p-2 focus-within:border-acento">
          <label htmlFor="pergunta" className="sr-only">
            Sua pergunta
          </label>
          <textarea
            id="pergunta"
            rows={1}
            maxLength={500}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar(texto);
              }
            }}
            placeholder="Sua pergunta sobre as vendas…"
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-tinta-3"
          />
          <button
            type="submit"
            disabled={carregando || texto.trim().length < 3}
            className="rounded-xl bg-tinta px-4 py-2.5 text-sm font-semibold text-limao disabled:opacity-40 dark:bg-limao dark:text-[#111316]"
          >
            Perguntar
          </button>
        </div>
        <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 text-xs text-tinta-2 select-none">
          <input
            type="checkbox"
            checked={detalhada}
            onChange={(e) => {
              setDetalhada(e.target.checked);
              try {
                localStorage.setItem("detalhada", e.target.checked ? "sim" : "nao");
              } catch {
                // sem armazenamento: vale só nesta visita
              }
            }}
            className="accent-[var(--acento)]"
          />
          Resposta detalhada (com contexto e sugestão; usa mais da cota gratuita)
        </label>
        <p className="mt-1 mb-0 text-center text-xs text-tinta-3">
          A IA consulta o banco só para leitura e mostra o SQL de cada número. Dados 100% fictícios.
        </p>
      </form>
    </div>
  );
}

function AvisoDemo({ saude, acordando }: { saude: Saude | null; acordando: boolean }) {
  if (acordando) {
    return (
      <p
        className="m-0 mb-2 rounded-xl border border-linha bg-superficie px-3 py-2 text-sm text-tinta-2"
        role="status"
      >
        <span className="pulso">Acordando o servidor…</span> a hospedagem gratuita dorme quando
        ninguém usa; a primeira resposta pode levar até 1 minuto.
      </p>
    );
  }
  if (!saude) return null;
  return (
    <p className="m-0 mb-2 rounded-xl border border-linha bg-superficie px-3 py-2 text-sm text-tinta-2">
      Demonstração ao vivo no plano gratuito do provedor de IA: cerca de{" "}
      <strong className="text-tinta">{saude.perguntasRestantes}</strong>{" "}
      {saude.perguntasRestantes === 1 ? "pergunta restante" : "perguntas restantes"} hoje, ~1 por
      minuto. Se acabar,{" "}
      <a href={PAGINA_RESULTADOS} className="text-acento hover:underline">
        veja as conversas gravadas
      </a>
      .
    </p>
  );
}

function BoasVindas({ aoEscolher }: { aoEscolher: (pergunta: string) => void }) {
  return (
    <div className="pt-6 sm:pt-12">
      <p className="m-0 text-sm font-medium tracking-wide text-acento uppercase">
        Pergunte em português
      </p>
      <h2 className="mt-2 mb-3 font-titulo text-3xl leading-tight font-bold sm:text-4xl">
        O gerente pergunta. A IA consulta o banco e mostra a conta.
      </h2>
      <p className="m-0 max-w-xl text-tinta-2">
        Cada número vem de uma consulta SQL de verdade, e você vê qual foi. Quando a IA calcula algo
        por conta própria, a tela avisa.
      </p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {SUGESTOES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => aoEscolher(s)}
            className="rounded-xl border border-linha bg-superficie px-3 py-2.5 text-left text-sm hover:border-acento"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Carregando() {
  return (
    <div className="rounded-2xl border border-linha bg-superficie p-4 text-sm text-tinta-2">
      <span className="pulso">Consultando o banco…</span>
      <p className="mt-1 mb-0 text-xs text-tinta-3">
        No plano gratuito do provedor de IA, uma pergunta pode esperar alguns segundos pela cota do
        minuto.
      </p>
    </div>
  );
}

function AvisoErro({ erro }: { erro: ErroApi }) {
  const cota = erro.erro === "cota_esgotada";
  return (
    <div role="alert" className="rounded-2xl border border-linha bg-superficie p-4 text-sm">
      <p className="m-0 font-medium">
        <span aria-hidden="true">{cota ? "☾ " : "△ "}</span>
        {cota ? "As perguntas de hoje acabaram" : "Não deu para responder agora"}
      </p>
      <p className="mt-1 mb-0 text-tinta-2">{erro.mensagem}</p>
      {cota && (
        <a
          href={PAGINA_RESULTADOS}
          className="mt-2 inline-block font-medium text-acento underline-offset-2 hover:underline"
        >
          Ver as conversas gravadas →
        </a>
      )}
    </div>
  );
}
