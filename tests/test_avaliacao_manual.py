"""Avaliador do RAG (D30): perguntas, checagens determinísticas, leitura da nota do juiz e
casos de controle. Sem rede: o juiz de verdade só roda em `python -m analista.avaliacao_manual`."""

from pathlib import Path
from typing import Any

import pytest

from analista import avaliacao_manual as am
from analista.config import RAIZ_PROJETO


def test_perguntas_do_manual_sao_validas() -> None:
    perguntas = am.carregar()
    assert len(perguntas) >= 12
    tipos = {p.tipo for p in perguntas}
    assert tipos == {"manual", "manual+banco", "fora"}
    for p in perguntas:
        if p.tipo != "fora":
            assert p.fonte and " > " in p.fonte, p.id
        assert p.contem or p.contem_algum or p.tipo == "fora", p.id


def test_fontes_esperadas_existem_no_manual() -> None:
    """Cada "documento > seção" esperado tem de existir nos arquivos do manual."""
    pasta = Path(RAIZ_PROJETO / "manual")
    secoes = set()
    for arquivo in pasta.glob("*.md"):
        documento = ""
        for linha in arquivo.read_text(encoding="utf-8").splitlines():
            if linha.startswith("# "):
                documento = linha[2:].strip()
            elif linha.startswith("## "):
                secoes.add(f"{documento} > {linha[3:].strip()}")
    for p in am.carregar():
        if p.fonte:
            assert p.fonte in secoes, f"{p.id}: {p.fonte}"


def test_carregar_recusa_tipo_desconhecido_e_ids_repetidos(tmp_path: Path) -> None:
    ruim = tmp_path / "p.toml"
    ruim.write_text('[[pergunta]]\nid="x"\ntipo="outro"\npergunta="?"\ngabarito="g"\n', "utf-8")
    with pytest.raises(ValueError, match="tipo desconhecido"):
        am.carregar(ruim)
    sem_fonte = tmp_path / "s.toml"
    sem_fonte.write_text(
        '[[pergunta]]\nid="x"\ntipo="manual"\npergunta="?"\ngabarito="g"\n', "utf-8"
    )
    with pytest.raises(ValueError, match="sem fonte"):
        am.carregar(sem_fonte)
    repetido = tmp_path / "r.toml"
    item = '[[pergunta]]\nid="x"\ntipo="fora"\npergunta="?"\ngabarito="g"\n'
    repetido.write_text(item + item, "utf-8")
    with pytest.raises(ValueError, match="repetidos"):
        am.carregar(repetido)


P = am.PerguntaManual(
    id="t",
    tipo="manual",
    pergunta="?",
    gabarito="g",
    fonte="Política de metas e bônus > Bônus de equipe",
    contem=("600",),
    contem_algum=("vendedor", "pessoa"),
    nao_contem=("900",),
)


def test_checar_aprova_quando_tudo_bate() -> None:
    c = am.checar(P, "São R$ 600,00 por Vendedor.", ["Política de metas e bônus > Bônus de equipe"])
    assert c.fonte_consultada is True and c.palavras_ok and c.faltando == []


def test_checar_reprova_fonte_ausente_palavra_faltando_e_proibida() -> None:
    c = am.checar(P, "São R$ 900,00.", ["Glossário de métricas > Faturamento"])
    assert c.fonte_consultada is False
    assert not c.palavras_ok
    assert "600" in c.faltando and "vendedor ou pessoa" in c.faltando
    assert "não devia ter: 900" in c.faltando


def test_pergunta_fora_nao_tem_fonte_esperada() -> None:
    fora = am.PerguntaManual(id="f", tipo="fora", pergunta="?", gabarito="g")
    assert am.checar(fora, "O manual não tem essa regra.", []).fonte_consultada is None


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ('{"fiel": true, "correta": 2, "justificativa": "ok"}', am.Nota(True, 2, "ok")),
        ('raciocínio... {"fiel": false, "correta": 0, "justificativa": "inventou"} fim',
         am.Nota(False, 0, "inventou")),
    ],
)  # fmt: skip
def test_ler_nota(texto: str, esperado: am.Nota) -> None:
    assert am.ler_nota(texto) == esperado


@pytest.mark.parametrize(
    "texto",
    [
        "sem json",
        '{"fiel": "sim", "correta": 2}',
        '{"fiel": true, "correta": 3}',
        '{"fiel": true, "correta": true}',
    ],
)
def test_ler_nota_recusa_formato_errado(texto: str) -> None:
    with pytest.raises(ValueError):
        am.ler_nota(texto)


def test_contexto_consultado_junta_manual_e_banco_e_ignora_erros() -> None:
    passos: list[dict[str, Any]] = [
        {"ferramenta": "consultar_manual", "linhas": [{"fonte": "A > B", "texto": "regra"}]},
        {
            "ferramenta": "consultar_metrica",
            "colunas": ["loja"],
            "linhas": [{"loja": "Loja Serra"}],
        },
        {"ferramenta": "executar_sql", "erro": "falhou"},
    ]
    texto = am.contexto_consultado(passos)
    assert "[manual: A > B]\nregra" in texto
    assert "[banco: consultar_metrica]" in texto and "Loja Serra" in texto
    assert "falhou" not in texto
    assert am.contexto_consultado([]) == "(nada consultado)"


def test_mensagens_do_juiz_levam_gabarito_consultado_e_resposta() -> None:
    m = am.mensagens_do_juiz(P, "resposta X", "trecho Y")
    assert m[0]["role"] == "system" and "JSON" in m[0]["content"]
    assert "GABARITO: g" in m[1]["content"]
    assert "trecho Y" in m[1]["content"] and "RESPOSTA: resposta X" in m[1]["content"]


def test_casos_de_controle_tem_certos_e_errados() -> None:
    casos = am.casos_de_controle(am.carregar())
    assert any(deve for *_, deve in casos) and any(not deve for *_, deve in casos)
    errados = [r for _, _, r, deve in casos if not deve]
    assert any("900" in r for r in errados)  # número trocado
    assert any("reduz a meta" in r for r in errados)  # regra invertida


def test_resumir() -> None:
    itens = [
        {
            "checagem": {"fonte_consultada": True, "palavras_ok": True},
            "nota": {"fiel": True, "correta": 2},
        },
        {
            "checagem": {"fonte_consultada": None, "palavras_ok": False},
            "nota": {"fiel": False, "correta": 0},
        },
    ]
    r = am.resumir(itens)
    assert r["fonte_consultada"] == "1/1"
    assert r["palavras_ok"] == "1/2"
    assert r["juiz_fiel"] == "1/2" and r["juiz_correta_2"] == "1/2"
    assert r["juiz_nota_media"] == 1.0
