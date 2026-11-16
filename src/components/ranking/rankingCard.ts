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

export function pageCount(total: number, perPage: number = CARDS_PER_PAGE): number {
  return Math.max(1, Math.ceil(total / perPage));
}

// ---- Quantas colunas cabem (grade de cards 4+) -----------------------------
//
// Antes eram faixas fixas por largura (5/3/2): com o menu lateral aberto a
// grade caía de 5 para 3 colunas, os cards ficavam MAIORES (~50%) e as 2
// linhas viravam 4 — passava da altura do pódio. Agora o card tem um tamanho
// mínimo "alvo" e a grade põe quantas colunas couberem com ele: abrir/fechar o
// menu lateral muda só a quantidade de cards por linha (e por página), nunca o
// tamanho deles (pedido do usuário, 2026-11-16).

/** 'grid' = 2 linhas de cards baixos (Tela Inicial etc.); 'tall' = 1 linha de
 * cards compridos, da altura do pódio (Biosintética). */
export type CardLayout = 'grid' | 'tall';

const GAP_PX = 16;
// Largura mínima do card em cada layout. 'grid': ~140px (como ficava com o
// menu fechado numa tela de ~1700px); 'tall': ~190px.
const MIN_CARD_PX: Record<CardLayout, number> = { grid: 135, tall: 190 };
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 5;

export function columnsForWidth(width: number, layout: CardLayout): number {
  if (!Number.isFinite(width) || width <= 0) return MAX_COLUMNS;
  const fit = Math.floor((width + GAP_PX) / (MIN_CARD_PX[layout] + GAP_PX));
  return Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, fit));
}

/** Cards por página: 'grid' = 2 linhas; 'tall' = 1 linha só (os cards já ocupam
 * a altura inteira). */
export function cardsPerPage(columns: number, layout: CardLayout): number {
  return layout === 'tall' ? columns : columns * 2;
}
