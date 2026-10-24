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

/** Setinha de tendência vs. o dia de venda anterior, usada ao lado do valor
 * de um colaborador em qualquer ranking (pódio, pílulas, lista, tabela).
 * `previous` null/undefined (sem base de comparação — fora de "dia único",
 * ou colaborador novo sem dado no dia anterior) não renderiza nada, em vez
 * de uma seta enganosa. Puramente visual — nunca é a fonte do valor
 * mostrado ao lado, só decide a cor/direção desta seta. */
export function TrendArrow({ current, previous }: { current: number; previous: number | null | undefined }) {
  if (previous === null || previous === undefined) return null;
  const trend = computeTrend(current, previous);
  return (
    <span
      role="img"
      aria-label={LABELS[trend.color]}
      title={LABELS[trend.color]}
      style={{ color: COLORS[trend.color], fontSize: '0.85em', lineHeight: 1, fontWeight: 900 }}
    >
      {trend.direction === 'up' ? '▲' : '▼'}
    </span>
  );
}
