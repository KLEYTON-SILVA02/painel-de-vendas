import { conquistaTierLabel, conquistaTierParts, type ConquistaCategoria, type ConquistaRow } from './business/conquistas';
import { CANVAS_H, CANVAS_W, renderConquistaCard, type ConquistaCardTemplate } from './conquistaCardRender';
import { fmtDateBR } from './format';

// "Copiar galeria (imagem)" for Galeria de Conquistas — now renders each
// achiever through the exact same engine as the on-screen figurinha
// (renderConquistaCard, using the ADM's active template), instead of the
// old hand-drawn generic box. A single achiever is copied as that card
// alone (matching "Baixar imagem"/"Copiar imagem" for one figurinha
// one-for-one); 2+ achievers get their real cards laid out in a grid on
// one canvas, with a small header/footer so the result still reads as a
// gallery rather than a loose pile of cards.

export async function generateConquistaImageBlob(
  rows: ConquistaRow[],
  categoria: ConquistaCategoria,
  catLabel: string,
  fromDate: string,
  toDate: string,
  storeName: string | undefined,
  template: ConquistaCardTemplate,
  logoUrl: string | null | undefined,
  color: string,
): Promise<Blob | null> {
  const achievers = rows.slice(0, 10);
  if (achievers.length === 0) return null;

  const cards = await Promise.all(
    achievers.map((r) => {
      const { valor: valorText, categoria: categoriaText } = conquistaTierParts(categoria, r.tier);
      return renderConquistaCard(template, {
        photoUrl: r.foto,
        logoUrl: logoUrl ?? null,
        tierText: conquistaTierLabel(categoria, r.tier),
        valorText,
        categoriaText,
        color,
      });
    }),
  );

  // A single achiever: the card itself IS the deliverable — no gallery
  // chrome wrapped around it, straight copy of what the template produces.
  if (cards.length === 1) {
    return new Promise((resolve) => cards[0].toBlob((blob) => resolve(blob), 'image/png'));
  }

  const cardAspect = CANVAS_H / CANVAS_W;
  const cardW = cards.length <= 3 ? 260 : cards.length <= 6 ? 210 : 170;
  const cardH = Math.round(cardW * cardAspect);
  const gap = 24;
  const cols = Math.min(cards.length, cards.length <= 3 ? cards.length : 5);
  const rowsCount = Math.ceil(cards.length / cols);
  const margin = 40;
  const headerH = 110;
  const footerH = 40;

  const W = cols * cardW + (cols - 1) * gap + margin * 2;
  const H = headerH + rowsCount * cardH + (rowsCount - 1) * gap + footerH + margin;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0d1428');
  bg.addColorStop(1, '#070814');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#ffb700';
  ctx.font = '700 15px Arial';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.fillText('🏆 GALERIA DE CONQUISTAS', W / 2, 40);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 30px Arial';
  ctx.fillText(catLabel.toUpperCase(), W / 2, 74);
  ctx.fillStyle = '#00f0ff';
  ctx.font = '600 13px Arial';
  ctx.fillText(`${fmtDateBR(fromDate)} a ${fmtDateBR(toDate)}`, W / 2, 96);

  const totalRowW = cols * cardW + (cols - 1) * gap;
  const startX = (W - totalRowW) / 2;
  cards.forEach((card, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * (cardW + gap);
    const y = headerH + row * (cardH + gap);
    ctx.drawImage(card, x, y, cardW, cardH);
  });

  ctx.fillStyle = '#8b90bf';
  ctx.font = '500 12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(
    `Gerado pelo Gestão de Vendas${storeName ? ' — ' + storeName : ''} · ${achievers.length} conquista${achievers.length === 1 ? '' : 's'}`,
    W / 2,
    H - 16,
  );

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
