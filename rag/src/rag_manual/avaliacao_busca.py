"""Avaliação da busca (sem LLM, determinística): o trecho certo aparece entre os primeiros?

    python -m rag_manual.avaliacao_busca                 # busca híbrida (a do serviço)
    python -m rag_manual.avaliacao_busca --so-vetorial   # só a vetorial, para comparar

Mede, sobre o índice de verdade:
- acerto@1 e acerto@3: a seção esperada é o 1º trecho / está entre os 3 primeiros;
- MRR (média de 1/posição da seção esperada);
- a distância do melhor trecho nas perguntas que o manual responde e nas que não responde.
  É com essa separação que o limiar RAG_DISTANCIA_MAXIMA é escolhido (D29).
"""

from __future__ import annotations

import statistics
import sys
from dataclasses import dataclass

from rag_manual.embeddings import EmbeddingsLocais
from rag_manual.indice import Buscador, BuscadorPgVector, abrir


@dataclass(frozen=True)
class Caso:
    pergunta: str
    arquivo: str | None  # None = o manual não responde
    secao: str | None = None


CASOS: tuple[Caso, ...] = (
    Caso(
        "Quanto cada vendedor ganha de bônus se a loja passar de 110% da meta?",
        "02_politica_metas_bonus.md",
        "Bônus de equipe",
    ),
    Caso(
        "Quando o gerente precisa apresentar um plano de ação?",
        "02_politica_metas_bonus.md",
        "Plano de ação",
    ),
    Caso(
        "A meta pode ser reduzida se a loja estiver vendendo pouco?",
        "02_politica_metas_bonus.md",
        "Revisão de meta",
    ),
    Caso(
        "Como a diretoria define a meta de cada loja?",
        "02_politica_metas_bonus.md",
        "Como a meta é definida",
    ),
    Caso(
        "Qual o desconto máximo numa venda financiada?",
        "03_politica_descontos.md",
        "Limites por forma de pagamento",
    ),
    Caso(
        "Quem aprova um desconto de 6% no pagamento à vista?",
        "03_politica_descontos.md",
        "Limites por forma de pagamento",
    ),
    Caso(
        "Por que o consórcio não tem desconto?",
        "03_politica_descontos.md",
        "Por que o consórcio não tem desconto",
    ),
    Caso(
        "Qual a diferença entre número de vendas e unidades?",
        "01_glossario_metricas.md",
        "Unidades e número de vendas",
    ),
    Caso(
        "Como é calculado o desconto médio em percentual?",
        "01_glossario_metricas.md",
        "Desconto médio (%)",
    ),
    Caso(
        "Participação de cada categoria em cada loja soma 100% em cada loja?",
        "01_glossario_metricas.md",
        "Participação (%)",
    ),
    Caso("Quando começou a campanha do consórcio?", "04_formas_pagamento.md", "Consórcio"),
    Caso("Qual a entrada mínima para financiar um carro?", "04_formas_pagamento.md", "Financiado"),
    Caso(
        "Por que dezembro vende mais que os outros meses?",
        "07_calendario_comercial.md",
        "Dezembro: o maior mês do ano",
    ),
    Caso(
        "Por que janeiro e fevereiro vendem pouco?",
        "07_calendario_comercial.md",
        "Janeiro e fevereiro: os meses mais fracos",
    ),
    Caso(
        "Qual a comissão do vendedor na venda de um SUV?",
        "08_comissao_vendedores.md",
        "Comissão por veículo",
    ),
    Caso(
        "Por que a Loja Serra vende tanto SUV grande?",
        "05_lojas_da_rede.md",
        "Loja Serra (Caruaru)",
    ),
    Caso(
        "Quem é o gerente da Loja Litoral?",
        "05_lojas_da_rede.md",
        "Loja Litoral (Cabo de Santo Agostinho)",
    ),
    Caso("Quando o Civic híbrido começou a ser vendido?", "06_linha_de_modelos.md", "Sedan"),
    Caso(
        "O sistema registra o lucro de cada venda?",
        "09_dados_e_relatorios.md",
        "O que o sistema NÃO registra",
    ),
    Caso(
        "Vendas canceladas aparecem no histórico?",
        "09_dados_e_relatorios.md",
        "O que o sistema NÃO registra",
    ),
    # O manual não responde: o melhor trecho deve ficar longe.
    Caso("Qual a previsão do tempo para Recife amanhã?", None),
    Caso("Me passe a senha do banco de dados", None),
    Caso("Quem ganhou a Copa do Mundo de 2002?", None),
    Caso("Como fazer um bolo de chocolate?", None),
    Caso("Qual o preço do dólar hoje?", None),
    Caso("Escreva um poema sobre o mar", None),
)


@dataclass(frozen=True)
class Medida:
    caso: Caso
    posicao: int | None  # posição da seção esperada (1 = primeiro), None = não veio
    distancia_melhor: float


def medir(buscador: Buscador, casos: tuple[Caso, ...] = CASOS, k: int = 5) -> list[Medida]:
    medidas = []
    for caso in casos:
        achados = buscador.buscar(caso.pergunta, k)
        posicao = None
        if caso.arquivo is not None:
            for i, a in enumerate(achados, start=1):
                meta = a.documento.metadata
                if meta.get("arquivo") == caso.arquivo and (
                    caso.secao is None or meta.get("secao") == caso.secao
                ):
                    posicao = i
                    break
        medidas.append(Medida(caso, posicao, achados[0].distancia if achados else 9.9))
    return medidas


def resumo(medidas: list[Medida]) -> dict[str, float]:
    respondidas = [m for m in medidas if m.caso.arquivo is not None]
    fora = [m for m in medidas if m.caso.arquivo is None]
    return {
        "perguntas": len(respondidas),
        "acerto_1": sum(m.posicao == 1 for m in respondidas) / len(respondidas),
        "acerto_3": sum(m.posicao is not None and m.posicao <= 3 for m in respondidas)
        / len(respondidas),
        "mrr": statistics.fmean(1 / m.posicao if m.posicao else 0 for m in respondidas),
        "dist_max_respondidas": max(m.distancia_melhor for m in respondidas),
        "dist_min_fora": min(m.distancia_melhor for m in fora) if fora else 9.9,
    }


def main() -> int:
    hibrida = "--so-vetorial" not in sys.argv
    print("busca:", "híbrida (vetorial + textual, RRF)" if hibrida else "só vetorial")
    medidas = medir(BuscadorPgVector(abrir(EmbeddingsLocais()), hibrida=hibrida))
    for m in medidas:
        alvo = f"{m.caso.arquivo} > {m.caso.secao}" if m.caso.arquivo else "(fora do manual)"
        pos = "-" if m.caso.arquivo is None else (m.posicao or "não veio")
        print(f"{m.distancia_melhor:.3f}  pos={pos!s:<8} {m.caso.pergunta}  → {alvo}")
    r = resumo(medidas)
    print(
        f"\nacerto@1 {r['acerto_1']:.0%} · acerto@3 {r['acerto_3']:.0%} · MRR {r['mrr']:.3f}"
        f"\nmaior distância entre as respondidas: {r['dist_max_respondidas']:.3f}"
        f"\nmenor distância entre as fora do manual: {r['dist_min_fora']:.3f}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
