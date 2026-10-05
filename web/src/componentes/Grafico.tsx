/**
 * Gráfico de uma série (a métrica pedida), em SVG feito à mão:
 * - barra (horizontal, rótulos longos como "Loja Litoral" cabem): <= 24 px de espessura,
 *   ponta arredondada de 4 px, base reta, valor na ponta;
 * - linha (série no tempo): 2 px, ponto final com anel na cor da superfície, valor no fim,
 *   cruz + dica do ponto mais próximo ao passar o mouse ou tocar.
 * Uma série só: sem legenda (o título diz o que é). A tabela ao lado é a "visão em tabela".
 */
import { useEffect, useRef, useState } from "react";
import { escalaLinear, maisProximo, marcas } from "../escalas.ts";
import { formatarValor, rotuloDaColuna } from "../formatar.ts";
import type { Linha, Grafico as TipoGrafico } from "../tipos.ts";

function useLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;
    const observador = new ResizeObserver(([entrada]) => {
      if (entrada) setLargura(Math.floor(entrada.contentRect.width));
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);
  return { ref, largura };
}

interface Props {
  grafico: TipoGrafico;
  linhas: Linha[];
}

export function Grafico({ grafico, linhas }: Props) {
  const { ref, largura } = useLargura<HTMLDivElement>();
  const titulo = `${rotuloDaColuna(grafico.y)} por ${rotuloDaColuna(grafico.x).toLowerCase()}`;
  return (
    <figure className="m-0">
      <figcaption className="mb-2 text-sm font-medium text-tinta-2">{titulo}</figcaption>
      <div ref={ref} className="relative w-full">
        {largura > 0 &&
          (grafico.tipo === "barra" ? (
            <Barras grafico={grafico} linhas={linhas.slice(0, 15)} largura={largura} />
          ) : (
            <LinhaTempo grafico={grafico} linhas={linhas} largura={largura} />
          ))}
      </div>
    </figure>
  );
}

const ALTURA_BANDA = 34;
const ESPESSURA = 20;

function caminhoBarra(x0: number, y: number, comprimento: number, altura: number): string {
  // Base reta no eixo, ponta arredondada (raio 4) no fim da barra.
  const r = Math.min(4, comprimento / 2, altura / 2);
  const x1 = x0 + comprimento;
  return `M${x0},${y} H${x1 - r} Q${x1},${y} ${x1},${y + r} V${y + altura - r} Q${x1},${y + altura} ${x1 - r},${y + altura} H${x0} Z`;
}

function Barras({ grafico, linhas, largura }: Props & { largura: number }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const valores = linhas.map((l) => Number(l[grafico.y] ?? 0));
  const rotulos = linhas.map((l) => formatarValor(grafico.x, l[grafico.x]));
  const larguraRotulo = Math.min(
    150,
    Math.max(64, Math.max(...rotulos.map((r) => r.length)) * 7.2),
  );
  const margemValor = 84;
  const inicio = larguraRotulo + 8;
  const util = Math.max(40, largura - inicio - margemValor);
  // Uma marca a cada ~80 px: no celular sobram 2 ou 3, sem rótulos encavalados.
  const ticks = marcas(Math.max(...valores, 0), Math.max(2, Math.min(5, Math.floor(util / 80))));
  const escala = escalaLinear(0, ticks.at(-1) ?? 1, 0, util);
  const altura = linhas.length * ALTURA_BANDA + 22;

  return (
    <svg
      width={largura}
      height={altura}
      role="img"
      aria-label={`Gráfico de barras: ${rotuloDaColuna(grafico.y)}`}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={inicio + escala(t)}
            x2={inicio + escala(t)}
            y1={0}
            y2={altura - 20}
            stroke="var(--grade)"
            strokeWidth={1}
          />
          <text
            x={inicio + escala(t)}
            y={altura - 6}
            textAnchor="middle"
            fontSize={11}
            fill="var(--tinta-3)"
          >
            {formatarValor(grafico.y, t, true)}
          </text>
        </g>
      ))}
      {linhas.map((_, i) => {
        const valor = valores[i] ?? 0;
        const y = i * ALTURA_BANDA + (ALTURA_BANDA - ESPESSURA) / 2;
        const comprimento = Math.max(1, escala(valor));
        return (
          <g
            key={rotulos[i]}
            onPointerEnter={() => setAtivo(i)}
            onPointerLeave={() => setAtivo(null)}
            style={{ cursor: "default" }}
          >
            {/* Alvo de toque maior que a barra */}
            <rect
              x={0}
              y={i * ALTURA_BANDA}
              width={largura}
              height={ALTURA_BANDA}
              fill="transparent"
            />
            <text
              x={larguraRotulo}
              y={y + ESPESSURA / 2}
              dy="0.35em"
              textAnchor="end"
              fontSize={12}
              fill="var(--tinta-2)"
            >
              {rotulos[i]}
            </text>
            <path
              d={caminhoBarra(inicio, y, comprimento, ESPESSURA)}
              fill="var(--serie-1)"
              opacity={ativo === null || ativo === i ? 1 : 0.45}
            />
            <text
              x={inicio + comprimento + 6}
              y={y + ESPESSURA / 2}
              dy="0.35em"
              fontSize={12}
              fontWeight={500}
              fill="var(--tinta)"
            >
              {formatarValor(grafico.y, valor, true)}
            </text>
          </g>
        );
      })}
      {ativo !== null && (
        <Dica
          x={Math.min(inicio + escala(valores[ativo] ?? 0), largura - 170)}
          y={ativo * ALTURA_BANDA}
          titulo={rotulos[ativo] ?? ""}
          valor={formatarValor(grafico.y, valores[ativo])}
        />
      )}
    </svg>
  );
}

function LinhaTempo({ grafico, linhas, largura }: Props & { largura: number }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const altura = 220;
  const margem = { esquerda: 64, direita: 72, topo: 14, base: 26 };
  const valores = linhas.map((l) => Number(l[grafico.y] ?? 0));
  const ticks = marcas(Math.max(...valores, 0));
  const y = escalaLinear(0, ticks.at(-1) ?? 1, altura - margem.base, margem.topo);
  const x = escalaLinear(
    0,
    Math.max(1, linhas.length - 1),
    margem.esquerda,
    largura - margem.direita,
  );
  const posicoes = linhas.map((_, i) => x(i));
  const pontos = valores.map((v, i) => `${posicoes[i]},${y(v)}`).join(" ");
  const passoRotulo = Math.max(
    1,
    Math.ceil(linhas.length / Math.max(2, Math.floor((largura - 140) / 56))),
  );
  const ultimo = linhas.length - 1;

  return (
    <svg
      width={largura}
      height={altura}
      role="img"
      aria-label={`Gráfico de linha: ${rotuloDaColuna(grafico.y)}`}
      onPointerMove={(e) => {
        const caixa = e.currentTarget.getBoundingClientRect();
        setAtivo(maisProximo(posicoes, e.clientX - caixa.left));
      }}
      onPointerLeave={() => setAtivo(null)}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={margem.esquerda}
            x2={largura - margem.direita}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--grade)"
            strokeWidth={1}
          />
          <text
            x={margem.esquerda - 8}
            y={y(t)}
            dy="0.35em"
            textAnchor="end"
            fontSize={11}
            fill="var(--tinta-3)"
          >
            {formatarValor(grafico.y, t, true)}
          </text>
        </g>
      ))}
      {linhas.map((l, i) =>
        i % passoRotulo === 0 || i === ultimo ? (
          <text
            key={String(l[grafico.x])}
            x={posicoes[i]}
            y={altura - 6}
            textAnchor="middle"
            fontSize={11}
            fill="var(--tinta-3)"
          >
            {formatarValor(grafico.x, l[grafico.x])}
          </text>
        ) : null,
      )}
      <polyline
        points={pontos}
        fill="none"
        stroke="var(--serie-1)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {ativo !== null && (
        <line
          x1={posicoes[ativo]}
          x2={posicoes[ativo]}
          y1={margem.topo}
          y2={altura - margem.base}
          stroke="var(--tinta-3)"
          strokeWidth={1}
        />
      )}
      {(ativo === null ? [ultimo] : [ativo]).map((i) => (
        <circle
          key={i}
          cx={posicoes[i]}
          cy={y(valores[i] ?? 0)}
          r={5}
          fill="var(--serie-1)"
          stroke="var(--superficie)"
          strokeWidth={2}
        />
      ))}
      {ativo === null && (
        <text
          x={(posicoes[ultimo] ?? 0) + 10}
          y={y(valores[ultimo] ?? 0)}
          dy="0.35em"
          fontSize={12}
          fontWeight={500}
          fill="var(--tinta)"
        >
          {formatarValor(grafico.y, valores[ultimo], true)}
        </text>
      )}
      {ativo !== null && (
        <Dica
          x={Math.min((posicoes[ativo] ?? 0) + 8, largura - 170)}
          y={Math.max(0, y(valores[ativo] ?? 0) - 56)}
          titulo={formatarValor(grafico.x, linhas[ativo]?.[grafico.x])}
          valor={formatarValor(grafico.y, valores[ativo])}
        />
      )}
    </svg>
  );
}

function Dica({ x, y, titulo, valor }: { x: number; y: number; titulo: string; valor: string }) {
  return (
    <g transform={`translate(${Math.max(0, x)},${y})`} pointerEvents="none">
      <rect width={164} height={46} rx={8} fill="var(--superficie-2)" stroke="var(--linha)" />
      <text x={10} y={18} fontSize={11} fill="var(--tinta-3)">
        {titulo}
      </text>
      <text x={10} y={36} fontSize={13} fontWeight={600} fill="var(--tinta)">
        {valor}
      </text>
    </g>
  );
}
