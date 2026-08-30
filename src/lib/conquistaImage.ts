import { fmtDateBR, fmtMoney } from './format';
import { loadImg, roundRect } from './rankingImage';
import type { ConquistaRow } from './business/conquistas';

// "Copiar galeria (imagem)" for Galeria de Conquistas — adaptive layout:
// 1-3 achievers get large centered cards (70px avatar), 4-10 get a
// horizontal strip of smaller cards (32px avatar) evenly distributed.
// Reuses loadImg/roundRect from rankingImage.ts (same canvas primitives).

function tierLabel(row: ConquistaRow): string {
  return row.tier > 0 ? `🏆 ${row.tier / 1000}k` : '⭐ SUPER META';
}

export async function generateConquistaImageBlob(
  rows: ConquistaRow[],
  catLabel: string,
  fromDate: string,
  toDate: string,
  storeName?: string,
): Promise<Blob | null> {
  const achievers = rows.slice(0, 10);

  const W = 1000;
  const H = 620;
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
  ctx.fillText('🏆 GALERIA DE CONQUISTAS', W / 2, 46);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 34px Arial';
  ctx.fillText(catLabel.toUpperCase(), W / 2, 86);
  ctx.fillStyle = '#00f0ff';
  ctx.font = '600 14px Arial';
  ctx.fillText(`${fmtDateBR(fromDate)} a ${fmtDateBR(toDate)}`, W / 2, 112);

  if (achievers.length === 0) {
    ctx.fillStyle = '#8b90bf';
    ctx.font = '600 18px Arial';
    ctx.fillText('Nenhuma conquista no período.', W / 2, H / 2);
  } else {
    const imgs = await Promise.all(achievers.map((r) => loadImg(r.foto)));
    const large = achievers.length <= 3;
    const cardW = large ? 240 : 180;
    const cardH = large ? 300 : 150;
    const gap = large ? 40 : 20;
    const totalW = achievers.length * cardW + (achievers.length - 1) * gap;
    const startX = (W - totalW) / 2;
    const cardY = large ? 190 : 260;
    const avR = large ? 35 : 16;
    const color = '#ffb700';

    achievers.forEach((r, i) => {
      const x = startX + i * (cardW + gap);
      const cx = x + cardW / 2;

      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      roundRect(ctx, x, cardY, cardW, cardH, 16);
      ctx.fill();
      ctx.strokeStyle = r.bateuSuper && r.tier === 0 ? '#a82bff' : color;
      ctx.lineWidth = 2;
      roundRect(ctx, x, cardY, cardW, cardH, 16);
      ctx.stroke();

      const avCy = cardY + (large ? 60 : 40);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, avCy, avR, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = '#101426';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.clip();
      if (imgs[i]) {
        ctx.drawImage(imgs[i]!, cx - avR, avCy - avR, avR * 2, avR * 2);
      } else {
        ctx.fillStyle = color;
        ctx.font = `700 ${large ? 26 : 14}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((r.apelido || r.nome || '?').charAt(0).toUpperCase(), cx, avCy);
      }
      ctx.restore();

      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${large ? 16 : 12}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      let nome = (r.apelido || r.nome || '').toUpperCase();
      const maxLen = large ? 16 : 12;
      if (nome.length > maxLen) nome = nome.slice(0, maxLen - 1) + '…';
      ctx.fillText(nome, cx, avCy + avR + (large ? 26 : 18));

      ctx.fillStyle = '#14ff00';
      ctx.font = `700 ${large ? 15 : 12}px Arial`;
      ctx.fillText(fmtMoney(r.valor), cx, avCy + avR + (large ? 48 : 36));

      ctx.fillStyle = r.bateuSuper && r.tier === 0 ? '#a82bff' : '#ffb700';
      ctx.font = `800 ${large ? 14 : 11}px Arial`;
      ctx.fillText(tierLabel(r), cx, avCy + avR + (large ? 70 : 52));
    });
  }

  ctx.fillStyle = '#8b90bf';
  ctx.font = '500 12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(
    `Gerado pelo Gestão de Vendas${storeName ? ' — ' + storeName : ''} · ${achievers.length} conquista${achievers.length === 1 ? '' : 's'}`,
    W / 2,
    H - 18,
  );

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
