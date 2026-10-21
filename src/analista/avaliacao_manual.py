"""Avaliação do RAG do manual (D30): checagens determinísticas + LLM-as-a-Judge.

    python -m analista.avaliacao_manual                  # todas as perguntas
    python -m analista.avaliacao_manual --ids m01,m08
    python -m analista.avaliacao_manual --so-controle    # só a validação do juiz

Precisa da API rodando com RAG_URL (e do serviço de RAG no ar). Para cada pergunta:

1. **Determinístico:** a seção esperada do manual foi consultada (vem em `fontes`)? As
   palavras de `contem` / `contem_algum` aparecem e as de `nao_contem` não?
2. **Juiz:** outro modelo (padrão `qwen/qwen3.8-27b`, de outra família que o gpt-oss que
   responde, para não avaliar a si mesmo) recebe a pergunta, o gabarito, os trechos do manual
   e os números do banco que o agente viu, e dá: `fiel` (toda afirmação tem apoio no que o
   agente consultou), `correta` (0, 1 ou 2 contra o gabarito) e uma justificativa curta.
   Temperatura 0 e saída em JSON validado.
3. **Controle do juiz:** antes de confiar nas notas, o juiz avalia respostas que já sabemos
   certas (o próprio gabarito) e erradas (números trocados, regra inventada). Se ele não
   aprovar as certas e reprovar as erradas, a rodada avisa que as notas não são confiáveis.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import tomllib
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from dotenv import dotenv_values

from analista.avaliacao import (
    PASTA_RESULTADOS,
    URL_API,
    CotaEsgotada,
    gravar,
    modelo_da_api,
    normalizar,
    perguntar_api,
)
from analista.config import RAIZ_PROJETO

ARQUIVO_PERGUNTAS = RAIZ_PROJETO / "avaliacao" / "perguntas_manual.toml"
URL_GROQ = "https://api.groq.com/openai/v1/chat/completions"
JUIZ_PADRAO = "qwen/qwen3.8-27b"
TIPOS = ("manual", "manual+banco", "fora")


@dataclass(frozen=True)
class PerguntaManual:
    id: str
    tipo: str
    pergunta: str
    gabarito: str
    fonte: str | None = None
    contem: tuple[str, ...] = ()
    contem_algum: tuple[str, ...] = ()
    nao_contem: tuple[str, ...] = ()


def carregar(arquivo: Path = ARQUIVO_PERGUNTAS) -> list[PerguntaManual]:
    dados = tomllib.loads(arquivo.read_text(encoding="utf-8"))
    perguntas = []
    for p in dados["pergunta"]:
        if p["tipo"] not in TIPOS:
            raise ValueError(f"{p['id']}: tipo desconhecido {p['tipo']!r}")
        if p["tipo"] != "fora" and not p.get("fonte"):
            raise ValueError(f"{p['id']}: pergunta do manual sem fonte esperada")
        perguntas.append(
            PerguntaManual(
                id=p["id"],
                tipo=p["tipo"],
                pergunta=p["pergunta"],
                gabarito=p["gabarito"],
                fonte=p.get("fonte"),
                contem=tuple(p.get("contem", ())),
                contem_algum=tuple(p.get("contem_algum", ())),
                nao_contem=tuple(p.get("nao_contem", ())),
            )
        )
    ids = [p.id for p in perguntas]
    if len(ids) != len(set(ids)):
        raise ValueError("ids repetidos em perguntas_manual.toml")
    return perguntas


# --------------------------------------------------------------------------- determinístico


@dataclass
class Checagem:
    fonte_consultada: bool | None  # None = pergunta "fora" (não há fonte esperada)
    palavras_ok: bool
    faltando: list[str] = field(default_factory=list)


def checar(p: PerguntaManual, resposta: str, fontes: list[str]) -> Checagem:
    texto = normalizar(resposta)
    faltando = [c for c in p.contem if normalizar(c) not in texto]
    if p.contem_algum and not any(normalizar(c) in texto for c in p.contem_algum):
        faltando.append(" ou ".join(p.contem_algum))
    proibidas = [c for c in p.nao_contem if normalizar(c) in texto]
    faltando += [f"não devia ter: {c}" for c in proibidas]
    fonte_ok = None if p.fonte is None else p.fonte in fontes
    return Checagem(fonte_ok, not faltando, faltando)


# --------------------------------------------------------------------------- juiz

PROMPT_JUIZ = """Você avalia respostas de um assistente de dados de uma rede de
concessionárias. Compare a RESPOSTA com o GABARITO e com o que o assistente CONSULTOU
(trechos do manual e números do banco).

Dê:
- "fiel": true se TODA afirmação da resposta tem apoio no que foi consultado (ou é a recusa
  correta de dizer que o manual não tem a regra); false se a resposta inventa regra, valor
  ou causa.
- "correta": 2 = responde o que o gabarito responde; 1 = parcialmente (falta parte
  importante ou tem imprecisão); 0 = errada, contraditória ou não responde.
- "justificativa": uma frase curta.

Responda SÓ com um objeto JSON: {"fiel": true|false, "correta": 0|1|2, "justificativa": "..."}"""


def contexto_consultado(passos: list[dict[str, Any]]) -> str:
    """Trechos do manual e resultados do banco que o agente viu (compactos)."""
    partes = []
    for passo in passos:
        if passo.get("erro"):
            continue
        if passo.get("ferramenta") == "consultar_manual":
            for linha in passo.get("linhas") or []:
                partes.append(f"[manual: {linha.get('fonte')}]\n{linha.get('texto')}")
        elif passo.get("colunas"):
            linhas = passo.get("linhas") or []
            amostra = json.dumps(linhas[:12], ensure_ascii=False, default=str)
            partes.append(f"[banco: {passo.get('ferramenta')}]\n{amostra}")
    return "\n\n".join(partes) or "(nada consultado)"


def mensagens_do_juiz(p: PerguntaManual, resposta: str, consultado: str) -> list[dict[str, str]]:
    usuario = (
        f"PERGUNTA: {p.pergunta}\n\nGABARITO: {p.gabarito}\n\n"
        f"CONSULTADO:\n{consultado}\n\nRESPOSTA: {resposta}"
    )
    return [{"role": "system", "content": PROMPT_JUIZ}, {"role": "user", "content": usuario}]


@dataclass(frozen=True)
class Nota:
    fiel: bool
    correta: int
    justificativa: str


def ler_nota(texto: str) -> Nota:
    """Valida o JSON do juiz; tolera texto em volta do objeto (ex.: raciocínio antes)."""
    inicio, fim = texto.find("{"), texto.rfind("}")
    if inicio < 0 or fim <= inicio:
        raise ValueError(f"juiz não devolveu JSON: {texto[:120]!r}")
    dados = json.loads(texto[inicio : fim + 1])
    fiel, correta = dados.get("fiel"), dados.get("correta")
    if not isinstance(fiel, bool) or correta not in (0, 1, 2) or isinstance(correta, bool):
        raise ValueError(f"nota fora do formato: {dados}")
    return Nota(fiel, int(correta), str(dados.get("justificativa", ""))[:300])


def chave_groq() -> str:
    chave = os.environ.get("GROQ_API_KEY") or dotenv_values(RAIZ_PROJETO / ".env").get(
        "GROQ_API_KEY"
    )
    if not chave:
        raise RuntimeError("GROQ_API_KEY não definida (.env)")
    return chave


def julgar(mensagens: list[dict[str, str]], modelo: str, chave: str, tentativas: int = 5) -> Nota:
    corpo = json.dumps(
        {
            "model": modelo,
            "messages": mensagens,
            "temperature": 0,
            "max_tokens": 600,
            "response_format": {"type": "json_object"},
        }
    ).encode()
    for tentativa in range(tentativas):
        pedido = urllib.request.Request(
            URL_GROQ,
            data=corpo,
            headers={
                "Authorization": f"Bearer {chave}",
                "Content-Type": "application/json",
                # O Cloudflare na frente do Groq recusa o User-Agent padrão do urllib
                # ("Python-urllib/3.x"): HTTP 403, "error code: 1010" (medido em 21/10/2026).
                "User-Agent": "ai-business-analyst-avaliacao/1.0",
            },
        )
        try:
            with urllib.request.urlopen(pedido, timeout=120) as r:  # noqa: S310
                dados = json.loads(r.read())
            return ler_nota(dados["choices"][0]["message"]["content"] or "")
        except urllib.error.HTTPError as erro:
            espera = float(erro.headers.get("retry-after") or 10 * (tentativa + 1))
            corpo_erro = erro.read()[:200]
            erro.close()
            if erro.code != 429 or tentativa == tentativas - 1:
                raise RuntimeError(f"juiz: HTTP {erro.code} {corpo_erro!r}") from None
            time.sleep(min(espera, 60) + 1)
        except ValueError:
            if tentativa == tentativas - 1:
                raise
    raise RuntimeError("juiz: desistiu")


# --------------------------------------------------------------------------- controle do juiz


Caso = tuple[str, PerguntaManual, str, bool]


def casos_de_controle(perguntas: list[PerguntaManual]) -> list[Caso]:
    """(rótulo, pergunta, resposta, deve_aprovar): o gabarito tem de passar; erros, não."""
    por_id = {p.id: p for p in perguntas}
    casos = []
    for p in perguntas:
        if p.tipo == "manual":
            casos.append((f"{p.id}: o próprio gabarito", p, p.gabarito, True))
    erros = {
        "m01": "Cada vendedor recebe R$ 900,00 de bônus quando a loja passa de 110% da meta.",
        "m02": "O desconto máximo na venda financiada é de 7%, aprovado pelo vendedor.",
        "m06": "Sim, a diretoria reduz a meta sempre que a loja vende pouco por dois meses.",
        "m07": "A comissão é de 2,5% sobre o preço de tabela.",
    }
    for id_, errada in erros.items():
        if id_ in por_id:
            casos.append((f"{id_}: resposta errada de propósito", por_id[id_], errada, False))
    return casos


def controlar_juiz(
    perguntas: list[PerguntaManual], modelo: str, chave: str, contexto_manual: dict[str, str]
) -> dict[str, Any]:
    acertos, detalhes = 0, []
    for rotulo, p, resposta, deve_aprovar in casos_de_controle(perguntas):
        consultado = contexto_manual.get(p.id, f"[manual: {p.fonte}]\n{p.gabarito}")
        nota = julgar(mensagens_do_juiz(p, resposta, consultado), modelo, chave)
        aprovou = nota.correta == 2 and nota.fiel
        ok = aprovou == deve_aprovar
        acertos += ok
        detalhes.append({"caso": rotulo, "esperado": deve_aprovar, "nota": nota.__dict__, "ok": ok})
        marca = "ok " if ok else "ERRO"
        print(f"  controle {marca}  {rotulo}: correta={nota.correta} fiel={nota.fiel}")
    total = len(detalhes)
    return {"acertos": acertos, "total": total, "confiavel": acertos == total, "casos": detalhes}


# --------------------------------------------------------------------------- rodada


def resumir(itens: list[dict[str, Any]]) -> dict[str, Any]:
    com_fonte = [i for i in itens if i["checagem"]["fonte_consultada"] is not None]
    julgados = [i for i in itens if i.get("nota")]
    return {
        "perguntas": len(itens),
        "fonte_consultada": f"{sum(i['checagem']['fonte_consultada'] for i in com_fonte)}"
        f"/{len(com_fonte)}",
        "palavras_ok": f"{sum(i['checagem']['palavras_ok'] for i in itens)}/{len(itens)}",
        "juiz_fiel": f"{sum(i['nota']['fiel'] for i in julgados)}/{len(julgados)}",
        "juiz_correta_2": f"{sum(i['nota']['correta'] == 2 for i in julgados)}/{len(julgados)}",
        "juiz_nota_media": round(sum(i["nota"]["correta"] for i in julgados) / len(julgados), 2)
        if julgados
        else None,
    }


def main(argumentos: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Avalia o RAG do manual (determinístico + juiz).")
    parser.add_argument("--ids", help="ids separados por vírgula (padrão: todas)")
    parser.add_argument("--url", default=URL_API)
    parser.add_argument("--juiz", default=JUIZ_PADRAO)
    parser.add_argument("--so-controle", action="store_true")
    args = parser.parse_args(argumentos)

    perguntas = carregar()
    if args.ids:
        pedidos = set(args.ids.split(","))
        perguntas = [p for p in perguntas if p.id in pedidos]
    chave = chave_groq()

    print(f"Controle do juiz ({args.juiz}):")
    controle = controlar_juiz(carregar(), args.juiz, chave, {})
    print(f"  {controle['acertos']}/{controle['total']} casos de controle certos")
    rodada: dict[str, Any] = {
        "quando": datetime.now(UTC).isoformat(timespec="seconds"),
        "juiz": args.juiz,
        "controle_do_juiz": controle,
        "itens": [],
    }
    if args.so_controle:
        print(json.dumps({k: v for k, v in controle.items() if k != "casos"}, ensure_ascii=False))
        return 0 if controle["confiavel"] else 1

    modelo = modelo_da_api(args.url)
    rodada["modelo"] = modelo
    carimbo = datetime.now().strftime("%Y-%m-%d_%H%M")
    arquivo = PASTA_RESULTADOS / f"{carimbo}_manual_{modelo.split('/')[-1]}.json"
    for p in perguntas:
        try:
            status, r = perguntar_api(p.pergunta, args.url)
        except CotaEsgotada as erro:
            print(f"cota esgotada: {erro}")
            break
        if status != 200:
            print(f"{p.id}: HTTP {status} {r}")
            rodada["itens"].append({"id": p.id, "erro": r})
            continue
        resposta, fontes = r.get("resposta", ""), r.get("fontes") or []
        chk = checar(p, resposta, fontes)
        consultado = contexto_consultado(r["passos"])
        nota = julgar(mensagens_do_juiz(p, resposta, consultado), args.juiz, chave)
        rodada["itens"].append(
            {
                "id": p.id,
                "tipo": p.tipo,
                "pergunta": p.pergunta,
                "resposta": resposta,
                "fontes": fontes,
                "ferramentas": [x.get("ferramenta") for x in r["passos"]],
                # O que o modelo perguntou ao manual e quantos trechos voltaram (diagnóstico).
                "consultas_manual": [
                    {
                        "pergunta": (x.get("argumentos") or {}).get("pergunta"),
                        "trechos": len(x.get("linhas") or []),
                        "erro": x.get("erro"),
                    }
                    for x in r["passos"]
                    if x.get("ferramenta") == "consultar_manual"
                ],
                "erros_ferramentas": [x["erro"] for x in r["passos"] if x.get("erro")],
                "checagem": chk.__dict__,
                "nota": nota.__dict__,
                "tokens": r["uso"]["tokensTotal"],
                "latencia_ms": r["uso"]["latenciaMs"],
            }
        )
        marca = "ok " if chk.palavras_ok and nota.correta == 2 and nota.fiel else "-- "
        print(
            f"{marca}{p.id} [{p.tipo}] fonte={chk.fonte_consultada} palavras={chk.palavras_ok}"
            f" juiz: correta={nota.correta} fiel={nota.fiel}  {nota.justificativa[:90]}"
        )
        gravar(arquivo, rodada)
    rodada["resumo"] = resumir([i for i in rodada["itens"] if "checagem" in i])
    gravar(arquivo, rodada)
    print(json.dumps(rodada["resumo"], ensure_ascii=False, indent=1))
    print(f"gravado em {arquivo.relative_to(RAIZ_PROJETO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
