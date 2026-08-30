import { loadImg, roundRect } from './rankingImage';

// Per-vendor "cartão de dinâmica" export — same canvas-drawing approach as
// generateRankingImageBlob (native Canvas 2D, no library), just a different
// layout: header (photo/nome/matrícula/loja), one block per dynamic
// (título/meta/realizado/barra/detalhamento dia-a-dia), motivational footer.

export interface DinamicaCardDay {
  label: string;
  valorLabel: string;
}

export interface DinamicaCardEntry {
  titulo: string;
  metaLabel: string;
  realizadoLabel: string;
  pct: number;
  dias: DinamicaCardDay[];
}

export interface DinamicaCardData {
  nome: string;
  matricula: string;
  foto: string | null;
  lojaNome?: string;
  dinamicas: DinamicaCardEntry[];
}

const W = 360;
const PAD = 18;
const HEADER_H = 76;
const DIA_ROW_H = 14;
const BLOCK_GAP = 14;
const FOOTER_H = 44;

function blockHeight(d: DinamicaCardEntry): number {
  return 20 + 44 + 10 + (d.dias.length > 0 ? 6 + d.dias.length * DIA_ROW_H : 0) + BLOCK_GAP;
}

export async function generateDinamicaCardBlob(data: DinamicaCardData): Promise<Blob | null> {
  const bodyH = data.dinamicas.reduce((a, d) => a + blockHeight(d), 0);
  const H = HEADER_H + bodyH + FOOTER_H + PAD * 2;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0d1428');
  bg.addColorStop(1, '#070814');
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, W, H, 14);
  ctx.fill();

  // Header
  const avatarR = 24;
  const avatarCx = PAD + avatarR;
  const avatarCy = PAD + avatarR;
  const img = await loadImg(data.foto);
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = '#212948';
  ctx.fill();
  ctx.strokeStyle = '#a82bff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.clip();
  if (img) {
    ctx.drawImage(img, avatarCx - avatarR, avatarCy - avatarR, avatarR * 2, avatarR * 2);
  } else {
    ctx.fillStyle = '#a82bff';
    ctx.font = '700 20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((data.nome || '?').charAt(0).toUpperCase(), avatarCx, avatarCy);
  }
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 16px Arial';
  ctx.fillText(data.nome, PAD + avatarR * 2 + 12, PAD + 20);
  ctx.fillStyle = '#8b90bf';
  ctx.font = '600 11px Arial';
  ctx.fillText(`Mat. ${data.matricula}${data.lojaNome ? ' · ' + data.lojaNome : ''}`, PAD + avatarR * 2 + 12, PAD + 38);

  // Dynamics blocks
  let y = HEADER_H + PAD;
  data.dinamicas.forEach((d) => {
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 13px Arial';
    ctx.fillText(d.titulo, PAD, y + 14);
    y += 20;

    const statW = (W - PAD * 2 - 8) / 2;
    ctx.strokeStyle = '#212948';
    ctx.lineWidth = 1;
    roundRect(ctx, PAD, y, statW, 40, 8);
    ctx.stroke();
    roundRect(ctx, PAD + statW + 8, y, statW, 40, 8);
    ctx.stroke();

    ctx.fillStyle = '#8b90bf';
    ctx.font = '600 8px Arial';
    ctx.fillText('META', PAD + 8, y + 15);
    ctx.fillText('REALIZADO', PAD + statW + 16, y + 15);

    ctx.fillStyle = '#ffd700';
    ctx.font = '700 13px Arial';
    ctx.fillText(d.metaLabel, PAD + 8, y + 32);
    ctx.fillStyle = d.pct >= 100 ? '#14ff00' : '#ffffff';
    ctx.fillText(`${d.realizadoLabel} (${d.pct.toFixed(0)}%)`, PAD + statW + 16, y + 32);
    y += 44;

    const barW = W - PAD * 2;
    ctx.fillStyle = '#1a1a1a';
    roundRect(ctx, PAD, y, barW, 4, 2);
    ctx.fill();
    ctx.fillStyle = d.pct >= 100 ? '#14ff00' : '#00f0ff';
    roundRect(ctx, PAD, y, Math.max(2, (barW * Math.min(100, d.pct)) / 100), 4, 2);
    ctx.fill();
    y += 10;

    if (d.dias.length > 0) {
      y += 6;
      ctx.font = '600 9px Arial';
      d.dias.forEach((dia) => {
        ctx.fillStyle = '#8b90bf';
        ctx.textAlign = 'left';
        ctx.fillText(dia.label, PAD, y + 10);
        ctx.fillStyle = '#c9d3e6';
        ctx.textAlign = 'right';
        ctx.fillText(dia.valorLabel, W - PAD, y + 10);
        ctx.textAlign = 'left';
        y += DIA_ROW_H;
      });
    }
    y += BLOCK_GAP;
  });

  // Footer
  ctx.fillStyle = '#8b90bf';
  ctx.font = 'italic 500 10px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('"Meta é compromisso, resultado é orgulho."', W / 2, H - PAD - 14);
  ctx.font = '500 9px Arial';
  ctx.fillText('Gerado pelo Gestão de Vendas', W / 2, H - PAD);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
