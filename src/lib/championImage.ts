import { loadImg, roundRect } from './rankingImage';
import type { ChampionStar } from './business/champion';

// Champion card export — same canvas-drawing approach as the ranking/
// dinâmica generators (native Canvas 2D, no library).

export interface ChampionCardData {
  nome: string;
  label: string;
  valorLabel: string;
  itensLabel: string;
  foto: string | null;
  stars: ChampionStar[];
  storeName?: string;
}

const W = 500;
const H = 320;

export async function generateChampionCardBlob(data: ChampionCardData): Promise<Blob | null> {
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

  ctx.strokeStyle = '#ffb700';
  ctx.lineWidth = 3;
  roundRect(ctx, 6, 6, W - 12, H - 12, 20);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb700';
  ctx.font = '700 15px Arial';
  ctx.fillText(`👑 ${data.label.toUpperCase()}`, W / 2, 46);

  const avatarR = 54;
  const cx = W / 2;
  const cy = 120;
  const img = await loadImg(data.foto);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, avatarR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = '#212948';
  ctx.fill();
  ctx.strokeStyle = '#ffb700';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.clip();
  if (img) {
    ctx.drawImage(img, cx - avatarR, cy - avatarR, avatarR * 2, avatarR * 2);
  } else {
    ctx.fillStyle = '#ffb700';
    ctx.font = '700 44px Arial';
    ctx.textBaseline = 'middle';
    ctx.fillText((data.nome || '?').charAt(0).toUpperCase(), cx, cy);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 24px Arial';
  ctx.fillText(data.nome, cx, cy + avatarR + 32);

  ctx.fillStyle = '#8b90bf';
  ctx.font = '600 14px Arial';
  ctx.fillText(`${data.valorLabel} · ${data.itensLabel}`, cx, cy + avatarR + 54);

  // Stars
  const starSize = 20;
  const gap = 8;
  const totalW = data.stars.length * starSize + (data.stars.length - 1) * gap;
  let sx = cx - totalW / 2 + starSize / 2;
  const sy = cy + avatarR + 78;
  ctx.font = `${starSize}px Arial`;
  data.stars.forEach((s) => {
    ctx.fillStyle = s.achieved ? '#ffb700' : '#2b3350';
    ctx.fillText('★', sx, sy);
    sx += starSize + gap;
  });

  ctx.fillStyle = '#8b90bf';
  ctx.font = '500 11px Arial';
  ctx.fillText(`Gerado pelo Gestão de Vendas${data.storeName ? ' — ' + data.storeName : ''}`, cx, H - 16);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
