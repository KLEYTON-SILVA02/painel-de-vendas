import { describe, expect, it } from 'vitest';
import { computeTrend } from './trend';

describe('computeTrend', () => {
  it('maior que o dia anterior → seta pra cima verde', () => {
    expect(computeTrend(10, 5)).toEqual({ direction: 'up', color: 'green' });
  });

  it('igual ao dia anterior → seta pra cima laranja', () => {
    expect(computeTrend(5, 5)).toEqual({ direction: 'up', color: 'orange' });
    expect(computeTrend(0, 0)).toEqual({ direction: 'up', color: 'orange' });
  });

  it('menor que o dia anterior → seta pra baixo vermelha', () => {
    expect(computeTrend(3, 5)).toEqual({ direction: 'down', color: 'red' });
  });
});
