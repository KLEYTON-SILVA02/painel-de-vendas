import { fmtDateBR, fmtMoney } from './format';

// Ported 1:1 from legacy/index-original.html (generateRankingImage /
// loadImg / roundRect) — draws the same 1000x620 PNG via the native
// Canvas 2D API (no charting/screenshot library needed).

export function loadImg(src: string | null): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    // Avatars are served from Supabase Storage (a different origin than
    // the app), so this is required to keep the canvas untainted —
    // legacy's avatars were base64 data: URIs and never needed it.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export interface RankingImageRow {
  nome: string;
  apelido: string;
  foto: string | null;
  valor: number;
}

export async function generateRankingImageBlob(
  rankingIn: RankingImageRow[],
  catLabel: string,
  fromDate: string,
  toDate: string,
  storeName?: string,
  /** LEVMEL/CHIP are unit-count categories, not currency — `r.valor` on
   * those rows is already an item count by the time it reaches this
   * function (see each caller), but the label under each bar and the
   * "total" box still need to know not to run it through fmtMoney. */
  isUnit = false,
): Promise<Blob | null> {
  const ranking = rankingIn.filter((r) => r.valor > 0).slice(0, 10);
  const totalValor = ranking.reduce((a, r) => a + r.valor, 0);
  const fmtValue = (v: number) => (isUnit ? `${Math.round(v)} un.` : fmtMoney(v));

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

  ctx.fillStyle = '#00f0ff';
  ctx.font = '700 15px Arial';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('RANKING DO PERÍODO', 40, 46);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 34px Arial';
  ctx.fillText(catLabel.toUpperCase(), 40, 84);

  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 1.5;
  roundRect(ctx, W - 300, 24, 260, 40, 10);
  ctx.stroke();
  ctx.fillStyle = '#00f0ff';
  ctx.font = '600 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`${fmtDateBR(fromDate)} a ${fmtDateBR(toDate)}`, W - 170, 49);

  ctx.strokeStyle = '#14ff00';
  roundRect(ctx, W - 300, 76, 260, 54, 10);
  ctx.stroke();
  ctx.fillStyle = '#8b90bf';
  ctx.font = '600 10px Arial';
  ctx.fillText(isUnit ? 'TOTAL DE UNIDADES' : 'TOTAL VENDIDO', W - 170, 94);
  ctx.fillStyle = '#14ff00';
  ctx.font = '800 22px Arial';
  ctx.fillText(fmtValue(totalValor), W - 170, 118);
  ctx.textAlign = 'left';

  if (ranking.length === 0) {
    ctx.fillStyle = '#8b90bf';
    ctx.font = '600 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Sem vendas registradas no período.', W / 2, H / 2);
  } else {
    const imgs = await Promise.all(ranking.map((r) => loadImg(r.foto)));
    const maxValor = Math.max(...ranking.map((r) => r.valor));
    const n = ranking.length;
    const areaLeft = 40;
    const areaRight = W - 40;
    const areaBottom = H - 50;
    const baseY = areaBottom;
    const colW = (areaRight - areaLeft) / n;
    const barW = Math.min(70, colW * 0.6);
    const maxBarH = 260;
    const colors = ['#ffb700', '#c9d3e6', '#ff6a00'];

    ranking.forEach((r, i) => {
      const cx = areaLeft + colW * i + colW / 2;
      const barH = Math.max(30, (r.valor / maxValor) * maxBarH);
      const barTop = baseY - barH;
      const color = colors[i] || '#3b6bf5';

      const grad = ctx.createLinearGradient(0, barTop, 0, baseY);
      grad.addColorStop(0, color);
      grad.addColorStop(1, i < 3 ? color : '#1e3a8a');
      ctx.fillStyle = grad;
      roundRect(ctx, cx - barW / 2, barTop, barW, barH, 8);
      ctx.fill();

      const avR = 30;
      const avCy = barTop - avR - 6;
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
        ctx.font = '700 22px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((r.apelido || r.nome || '?').charAt(0).toUpperCase(), cx, avCy);
      }
      ctx.restore();

      ctx.beginPath();
      ctx.arc(cx, avCy + avR - 2, 11, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#0d1428';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#04121a';
      ctx.font = '800 11px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), cx, avCy + avR - 1);

      ctx.fillStyle = '#ffffff';
      ctx.font = '700 12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      let nome = (r.apelido || r.nome || '').toUpperCase();
      if (nome.length > 12) nome = nome.slice(0, 11) + '…';
      ctx.fillText(nome, cx, avCy - avR - 22);
      ctx.fillStyle = '#14ff00';
      ctx.font = '700 12px Arial';
      ctx.fillText(fmtValue(r.valor), cx, avCy - avR - 8);
    });
  }

  ctx.fillStyle = '#8b90bf';
  ctx.font = '500 12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`Gerado pelo Gestão de Vendas${storeName ? ' — ' + storeName : ''} · ${ranking.length} colaboradores com vendas`, W / 2, H - 18);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

/** Tries the modern async-clipboard image write; returns whether it succeeded
 * so the caller can fall back to an on-screen preview + download link. */
export async function tryCopyImage(blob: Blob): Promise<boolean> {
  if (navigator.clipboard && window.ClipboardItem) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    } catch {
      // fall through
    }
  }
  return false;
}
