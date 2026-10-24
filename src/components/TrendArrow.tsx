import { computeTrend, type TrendColor } from '../lib/business/trend';

const COLORS: Record<TrendColor, string> = {
  green: '#14ff00',
  orange: '#ffb700',
  red: '#ff3b3b',
};

const LABELS: Record<TrendColor, string> = {
  green: 'Acima do dia anterior',
  orange: 'Igual ao dia anterior',
  red: 'Abaixo do dia anterior — precisa melhorar',
};

/** Setinha de tendência vs. o dia de venda anterior, usada ao lado (ou,
 * no pódio, sobre a foto) do valor de um colaborador em qualquer ranking.
 * `previous` null/undefined (sem base de comparação — fora de "dia único",
 * ou colaborador novo sem dado no dia anterior) não renderiza nada, em vez
 * de uma seta enganosa. Puramente visual — nunca é a fonte do valor
 * mostrado ao lado, só decide a cor/direção desta seta.
 *
 * Um triângulo CSS sólido (border-trick) em vez do glyph unicode ▲/▼
 * antigo — pedido explícito do usuário (2026-10-24, com referência visual):
 * mais destaque, mantendo a forma de triângulo. `size` aceita um número
 * (px) ou uma string CSS (ex.: '4cqw', pro pódio escalar com o container
 * igual todo o resto de PodiumSplit). */
export function TrendArrow({
  current,
  previous,
  size = 14,
}: {
  current: number;
  previous: number | null | undefined;
  size?: number | string;
}) {
  if (previous === null || previous === undefined) return null;
  const trend = computeTrend(current, previous);
  const color = COLORS[trend.color];
  const h = typeof size === 'number' ? `${size}px` : size;
  const w = typeof size === 'number' ? `${size * 0.65}px` : `calc(${size} * 0.65)`;
  return (
    <span
      role="img"
      aria-label={LABELS[trend.color]}
      title={LABELS[trend.color]}
      style={{
        display: 'inline-block',
        width: 0,
        height: 0,
        borderLeft: `${w} solid transparent`,
        borderRight: `${w} solid transparent`,
        borderBottom: trend.direction === 'up' ? `${h} solid ${color}` : undefined,
        borderTop: trend.direction === 'down' ? `${h} solid ${color}` : undefined,
        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.6))',
        verticalAlign: 'middle',
      }}
    />
  );
}
