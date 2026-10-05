/**
 * App HTTP (Express 5). Rotas:
 *   GET  /api/saude      -> estado da API, do banco e do orçamento do dia
 *   POST /api/perguntar  -> { pergunta, historico? } -> resposta da IA
 * E, se existir, a interface React compilada (web/dist) na raiz.
 *
 * Erros têm um código estável em `erro`, que a interface usa para escolher a mensagem:
 *   entrada_invalida (400) | limite_por_ip (429) | ocupado (503) | cota_esgotada (503)
 *   | falha_ia (502) | interno (500)
 */
import { existsSync } from "node:fs";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { consultarSomenteLeitura } from "../banco.ts";
import { ErroRespostaInvalida, perguntar } from "../ia/analista.ts";
import type { Contexto } from "../ia/ferramentas.ts";
import {
  ErroCotaEsgotada,
  ErroLimitePorMinuto,
  ErroProvedor,
  type ProvedorIA,
} from "../ia/provedor.ts";
import { Fila, FilaCheia, type LimitePorIp, type OrcamentoDiario } from "./limites.ts";
import type { Registro } from "./registro.ts";

export interface Dependencias {
  provedor: ProvedorIA;
  contexto: Contexto;
  limitePorIp: LimitePorIp;
  orcamento: OrcamentoDiario;
  registro: Registro;
  fila?: Fila;
  pastaWeb?: string;
}

const esquemaPergunta = z
  .object({
    pergunta: z.string().trim().min(3).max(500),
    historico: z
      .array(z.object({ pergunta: z.string().max(500), resposta: z.string().max(2_000) }).strict())
      .max(3)
      .default([]),
  })
  .strict();

class ErroHttp extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly extra: Record<string, unknown>;
  constructor(
    status: number,
    codigo: string,
    mensagem: string,
    extra: Record<string, unknown> = {},
  ) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.extra = extra;
  }
}

const MENSAGEM_COTA =
  "As perguntas de hoje acabaram (limite gratuito do provedor de IA). Volte amanhã ou veja as conversas gravadas.";

function cabecalhosDeSeguranca(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
  );
  next();
}

export function criarApp(d: Dependencias): express.Express {
  const app = express();
  const fila = d.fila ?? new Fila(3);
  app.disable("x-powered-by");
  app.use(cabecalhosDeSeguranca);
  app.use(express.json({ limit: "8kb" }));

  app.get("/api/saude", async (_req, res) => {
    let banco = "ok";
    try {
      await consultarSomenteLeitura(d.contexto.pool, "SELECT 1");
    } catch {
      banco = "fora do ar";
    }
    res.json({
      api: "ok",
      banco,
      modelo: d.provedor.modelo,
      dataReferencia: d.contexto.vocabulario.dataReferencia,
      orcamento: { gastoHoje: d.orcamento.gasto, teto: d.orcamento.teto },
    });
  });

  app.post("/api/perguntar", async (req, res) => {
    const lido = esquemaPergunta.safeParse(req.body);
    if (!lido.success) {
      throw new ErroHttp(400, "entrada_invalida", "Escreva uma pergunta de 3 a 500 caracteres.");
    }
    const espera = d.limitePorIp.consumir(req.ip ?? "desconhecido");
    if (espera > 0) {
      throw new ErroHttp(
        429,
        "limite_por_ip",
        `Muitas perguntas seguidas. Tente de novo em ${espera} s.`,
        {
          tentarEmSegundos: espera,
        },
      );
    }
    if (d.orcamento.esgotado()) {
      throw new ErroHttp(503, "cota_esgotada", MENSAGEM_COTA, {
        tentarEmSegundos: d.orcamento.segundosAteReiniciar(),
      });
    }

    const { pergunta, historico } = lido.data;
    const inicio = performance.now();
    try {
      const r = await fila.executar(() => perguntar(pergunta, d.provedor, d.contexto, historico));
      d.orcamento.registrar(r.uso.tokensTotal);
      await d.registro.gravar({
        pergunta,
        modelo: r.uso.modelo,
        versaoPrompt: r.uso.versaoPrompt,
        voltas: r.uso.voltas,
        tokensTotal: r.uso.tokensTotal,
        latenciaMs: r.uso.latenciaMs,
        ferramentas: r.passos.map((p) => p.ferramenta),
        numeros: r.numeros.length,
        numerosConferidos: r.numeros.filter((n) => n.conferido).length,
      });
      res.json(r);
    } catch (erro) {
      await d.registro
        .gravar({
          pergunta,
          latenciaMs: Math.round(performance.now() - inicio),
          erro: (erro as Error).name,
        })
        .catch(() => {});
      if (erro instanceof FilaCheia) {
        throw new ErroHttp(
          503,
          "ocupado",
          "A IA está respondendo outras perguntas. Tente de novo em instantes.",
          {
            tentarEmSegundos: 20,
          },
        );
      }
      if (erro instanceof ErroCotaEsgotada) {
        // A cota do provedor acabou antes do nosso teto: o nosso passa a valer esgotado.
        d.orcamento.registrar(d.orcamento.teto);
        throw new ErroHttp(503, "cota_esgotada", MENSAGEM_COTA, {
          tentarEmSegundos: erro.tentarDeNovoEmSegundos ?? d.orcamento.segundosAteReiniciar(),
        });
      }
      if (erro instanceof ErroLimitePorMinuto) {
        throw new ErroHttp(
          503,
          "ocupado",
          `Muitas perguntas neste minuto. Tente de novo em ${erro.tentarDeNovoEmSegundos} s.`,
          {
            tentarEmSegundos: erro.tentarDeNovoEmSegundos,
          },
        );
      }
      if (erro instanceof ErroProvedor || erro instanceof ErroRespostaInvalida) {
        throw new ErroHttp(
          502,
          "falha_ia",
          "A IA não conseguiu responder agora. Tente reformular a pergunta.",
        );
      }
      throw erro;
    }
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ erro: "nao_encontrado", mensagem: "Rota inexistente." });
  });

  if (d.pastaWeb && existsSync(d.pastaWeb)) {
    app.use(express.static(d.pastaWeb, { index: "index.html", maxAge: "1h" }));
  }

  // Tratador de erros (Express 5 encaminha também as rejeições das rotas async).
  app.use((erro: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (erro instanceof ErroHttp) {
      res.status(erro.status).json({ erro: erro.codigo, mensagem: erro.message, ...erro.extra });
      return;
    }
    const corpoInvalido = (erro as { type?: string }).type;
    if (corpoInvalido === "entity.parse.failed" || corpoInvalido === "entity.too.large") {
      res.status(400).json({ erro: "entrada_invalida", mensagem: "Corpo da requisição inválido." });
      return;
    }
    console.error("[erro interno]", erro);
    res.status(500).json({ erro: "interno", mensagem: "Erro interno." });
  });

  return app;
}
