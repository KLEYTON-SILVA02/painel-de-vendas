// Helpers puros do card de colocação (RankingCardGrid) — separados do
// componente pra poder testar sem montar React.

/** Quanto do arco preencher: valor do colaborador ÷ valor do líder (1º do
 * ranking), de 0 a 1. É uma razão real entre dois números que a tela já
 * mostra — nunca um tempo nem uma animação fingindo progresso. Líder sem
 * valor positivo (ranking zerado) ou valor negativo → 0. */
export function cardProgress(value: number, leaderValue: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(leaderValue) || leaderValue <= 0 || value <= 0) return 0;
  return Math.min(1, value / leaderValue);
}

// Larguras aproximadas (em "em") de Arial Bold — o suficiente pra decidir se
// um valor comprido ("R$ 123.456,78") cabe no card ou precisa de fonte menor.
const CHAR_EM: Record<string, number> = { '.': 0.278, ',': 0.278, ' ': 0.278, R: 0.722, $: 0.556 };

export function estimateTextEm(text: string): number {
  let em = 0;
  for (const ch of text) em += /\d/.test(ch) ? 0.556 : (CHAR_EM[ch] ?? 0.62);
  return em;
}

/** Tamanho de fonte (em cqw, % da largura do card) que faz `text` caber em
 * `maxWidthCqw`, nunca maior que `baseCqw` nem menor que `minCqw` (abaixo
 * disso o CSS corta com reticências em vez de ficar ilegível). */
export function fitFontCqw(text: string, baseCqw: number, maxWidthCqw: number, minCqw: number): number {
  const em = Math.max(estimateTextEm(text), 0.1);
  return Math.max(minCqw, Math.min(baseCqw, maxWidthCqw / em));
}

export const CARDS_PER_PAGE = 10;

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / CARDS_PER_PAGE));
}
