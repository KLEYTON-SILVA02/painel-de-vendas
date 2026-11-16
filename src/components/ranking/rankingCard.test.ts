import { describe, expect, it } from 'vitest';
import { cardProgress, cardsPerPage, columnsForWidth, fitFontCqw, pageCount } from './rankingCard';

describe('cardProgress', () => {
  it('é a razão valor ÷ líder', () => {
    expect(cardProgress(50, 200)).toBe(0.25);
    expect(cardProgress(200, 200)).toBe(1);
  });
  it('nunca passa de 1 nem fica abaixo de 0', () => {
    expect(cardProgress(300, 200)).toBe(1);
    expect(cardProgress(-5, 200)).toBe(0);
  });
  it('sem líder positivo ou com valor inválido não preenche nada', () => {
    expect(cardProgress(10, 0)).toBe(0);
    expect(cardProgress(10, -3)).toBe(0);
    expect(cardProgress(NaN, 10)).toBe(0);
    expect(cardProgress(10, Infinity)).toBe(0);
  });
});

describe('fitFontCqw', () => {
  it('valor normal fica no tamanho base', () => {
    expect(fitFontCqw('R$ 3.269,35', 11.09, 71, 6)).toBe(11.09);
  });
  it('valor muito comprido encolhe, mas respeita o mínimo', () => {
    const grande = fitFontCqw('R$ 123.456.789,00', 11.09, 71, 6);
    expect(grande).toBeLessThan(11.09);
    expect(grande).toBeGreaterThanOrEqual(6);
    expect(fitFontCqw('R$ 999.999.999.999.999,00', 11.09, 71, 6)).toBe(6);
  });
});

describe('pageCount', () => {
  it('10 por página, sempre ao menos 1', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(10)).toBe(1);
    expect(pageCount(11)).toBe(2);
    expect(pageCount(42)).toBe(5);
  });
});

describe('pageCount com tamanho de página', () => {
  it('usa o tamanho informado', () => {
    expect(pageCount(9, 8)).toBe(2);
    expect(pageCount(8, 8)).toBe(1);
    expect(pageCount(0, 4)).toBe(1);
  });
});

describe('columnsForWidth', () => {
  it('grade da Tela Inicial: menu fechado 5 colunas, aberto 4 (mesmo tamanho de card)', () => {
    expect(columnsForWidth(776, 'grid')).toBe(5);
    expect(columnsForWidth(624, 'grid')).toBe(4);
  });
  it('cards compridos (Biosintética): menu fechado 5 colunas, aberto 4', () => {
    expect(columnsForWidth(1100, 'tall')).toBe(5);
    expect(columnsForWidth(948, 'tall')).toBe(4);
  });
  it('nunca passa de 5 nem fica abaixo de 2', () => {
    expect(columnsForWidth(4000, 'grid')).toBe(5);
    expect(columnsForWidth(120, 'tall')).toBe(2);
  });
  it('largura inválida/ainda não medida usa o máximo', () => {
    expect(columnsForWidth(0, 'grid')).toBe(5);
    expect(columnsForWidth(NaN, 'tall')).toBe(5);
  });
});

describe('cardsPerPage', () => {
  it('grid = 2 linhas; tall = 1 linha', () => {
    expect(cardsPerPage(5, 'grid')).toBe(10);
    expect(cardsPerPage(4, 'grid')).toBe(8);
    expect(cardsPerPage(5, 'tall')).toBe(5);
    expect(cardsPerPage(4, 'tall')).toBe(4);
  });
});
