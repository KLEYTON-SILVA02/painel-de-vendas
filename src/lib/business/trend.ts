// Seta de tendência (dia anterior) — comparação genérica do valor de um
// colaborador num ranking (R$, unidades ou razão, tanto faz) contra o
// mesmo valor dele no dia de venda anterior. Puramente visual: nunca muda
// o cálculo do próprio valor exibido, só decide a cor/direção da setinha
// ao lado. Regra combinada com o usuário (2026-10-24): maior que ontem =
// seta pra cima verde; igual = seta pra cima laranja; menor = seta pra
// baixo vermelha (sinaliza que precisa melhorar).
export type TrendColor = 'green' | 'orange' | 'red';

export interface Trend {
  direction: 'up' | 'down';
  color: TrendColor;
}

export function computeTrend(current: number, previous: number): Trend {
  if (current > previous) return { direction: 'up', color: 'green' };
  if (current === previous) return { direction: 'up', color: 'orange' };
  return { direction: 'down', color: 'red' };
}
