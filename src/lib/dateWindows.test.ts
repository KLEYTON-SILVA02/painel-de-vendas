import { describe, expect, it } from 'vitest';
import { mapWithConcurrency, splitDateRange } from './dateWindows';

describe('splitDateRange', () => {
  it('divide em janelas de 7 dias sem sobrepor nem perder dia', () => {
    expect(splitDateRange('2026-08-01', '2026-08-20', 7)).toEqual([
      { from: '2026-08-01', to: '2026-08-07' },
      { from: '2026-08-08', to: '2026-08-14' },
      { from: '2026-08-15', to: '2026-08-20' },
    ]);
  });
  it('intervalo curto vira uma janela só', () => {
    expect(splitDateRange('2026-08-05', '2026-08-05', 7)).toEqual([{ from: '2026-08-05', to: '2026-08-05' }]);
  });
  it('atravessa virada de mês/ano', () => {
    expect(splitDateRange('2026-12-29', '2027-01-03', 7)).toEqual([{ from: '2026-12-29', to: '2027-01-03' }]);
  });
  it('entrada inválida devolve vazio', () => {
    expect(splitDateRange('2026-09-01', '2026-08-01', 7)).toEqual([]);
    expect(splitDateRange('', '2026-08-01', 7)).toEqual([]);
  });
});

describe('mapWithConcurrency', () => {
  it('mantém a ordem e respeita o limite', async () => {
    let running = 0;
    let max = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (n) => {
      running++;
      max = Math.max(max, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60]);
    expect(max).toBeLessThanOrEqual(2);
  });
  it('propaga erro', async () => {
    await expect(mapWithConcurrency([1, 2], 2, async (n) => { if (n === 2) throw new Error('x'); return n; })).rejects.toThrow('x');
  });
});
