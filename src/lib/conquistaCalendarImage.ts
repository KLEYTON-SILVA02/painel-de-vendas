import { loadImg, roundRect } from './rankingImage';
import type { ConquistaCategoria, DayAchievement } from './business/conquistas';

// Galeria de Figurinhas — monthly calendar of a single collaborator's daily
// achievements, same native Canvas 2D approach as every other image export
// in the app (no library). Reused for both the on-screen preview and the
// JPG/PDF download, so this is the only place the calendar is actually laid
// out — export code (conquistaCalendarExport.ts) just asks for the canvas.

const WEEKDAY_LABELS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

const CAT_SHORT_LABEL: Record<ConquistaCategoria, string> = {
  DERM: 'DERMO',
  GEN: 'GEN',
  MP: 'M.EXCL',
  LEVMEL: 'LEVMEL',
  CHIP: 'CHIP',
};

export interface ConquistaCalendarData {
  nome: string;
  matricula: string;
  foto: string | null;
  ano: number;
  mes: number; // 0-11
  mesLabel: string; // "SETEMBRO"
  achievements: DayAchievement[];
  totalEstrelas: number;
  percentual: number;
  storeName?: string;
}

const CELL_W = 132;
const CELL_H = 132;
const GRID_LEFT = 20;
const HEADER_H = 168;
const WEEKDAY_ROW_H = 32;

function starsRow(ctx: CanvasRenderingContext2D, count: number, cx: number, cy: number, size: number) {
  const gap = size * 0.15;
  const totalW = 5 * size + 4 * gap;
  let sx = cx - totalW / 2 + size / 2;
  ctx.textAlign = 'center';
  ctx.font = `${size}px Arial`;
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < count ? '#ffb700' : '#2b3350';
    ctx.fillText('★', sx, cy);
    sx += size + gap;
  }
}

export async function renderConquistaCalendar(data: ConquistaCalendarData): Promise<HTMLCanvasElement> {
  const firstWeekday = new Date(data.ano, data.mes, 1).getDay();
  const diasNoMes = new Date(data.ano, data.mes + 1, 0).getDate();
  const totalCells = firstWeekday + diasNoMes;
  const rows = Math.ceil(totalCells / 7);

  const W = GRID_LEFT * 2 + CELL_W * 7;
  const H = HEADER_H + WEEKDAY_ROW_H + rows * CELL_H + 40;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0d1428');
  bg.addColorStop(1, '#070814');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Header: photo, name/matricula, month, totals
  const avatarR = 40;
  const avatarCx = 76;
  const avatarCy = 76;
  const img = await loadImg(data.foto);
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = '#212948';
  ctx.fill();
  ctx.strokeStyle = '#ffb700';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.clip();
  if (img) {
    ctx.drawImage(img, avatarCx - avatarR, avatarCy - avatarR, avatarR * 2, avatarR * 2);
  } else {
    ctx.fillStyle = '#ffb700';
    ctx.font = '700 34px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((data.nome || '?').charAt(0).toUpperCase(), avatarCx, avatarCy);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 24px Arial';
  ctx.fillText(data.nome, avatarCx + avatarR + 20, 56);
  ctx.fillStyle = '#8b90bf';
  ctx.font = '600 13px Arial';
  ctx.fillText(`Mat. ${data.matricula}${data.storeName ? ' · ' + data.storeName : ''}`, avatarCx + avatarR + 20, 78);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffb700';
  ctx.font = '700 22px Arial';
  ctx.fillText(`${data.mesLabel} / ${data.ano}`, W - 20, 44);
  ctx.fillStyle = '#14ff00';
  ctx.font = '700 15px Arial';
  ctx.fillText(`⭐ ${data.totalEstrelas} estrela(s) no mês`, W - 20, 68);
  ctx.fillStyle = '#8b90bf';
  ctx.font = '600 13px Arial';
  ctx.fillText(`${data.percentual.toFixed(0)}% de atingimento`, W - 20, 88);

  ctx.strokeStyle = 'rgba(255,183,0,.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(20, HEADER_H - 12);
  ctx.lineTo(W - 20, HEADER_H - 12);
  ctx.stroke();

  // Weekday header row
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8b90bf';
  ctx.font = '700 12px Arial';
  WEEKDAY_LABELS.forEach((label, i) => {
    ctx.fillText(label, GRID_LEFT + i * CELL_W + CELL_W / 2, HEADER_H + WEEKDAY_ROW_H - 10);
  });

  const byDay = new Map(data.achievements.map((a) => [a.dia, a]));
  const gridTop = HEADER_H + WEEKDAY_ROW_H;

  for (let day = 1; day <= diasNoMes; day++) {
    const cellIndex = firstWeekday + day - 1;
    const col = cellIndex % 7;
    const row = Math.floor(cellIndex / 7);
    const x = GRID_LEFT + col * CELL_W;
    const y = gridTop + row * CELL_H;
    const dia = `${data.ano}-${String(data.mes + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const achievement = byDay.get(dia);

    ctx.fillStyle = achievement ? 'rgba(255,183,0,.08)' : '#0b0e1d';
    roundRect(ctx, x + 4, y + 4, CELL_W - 8, CELL_H - 8, 10);
    ctx.fill();
    ctx.strokeStyle = achievement ? '#ffb700' : '#212948';
    ctx.lineWidth = achievement ? 2 : 1;
    roundRect(ctx, x + 4, y + 4, CELL_W - 8, CELL_H - 8, 10);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = achievement ? '#ffb700' : '#4a5178';
    ctx.font = '700 13px Arial';
    ctx.fillText(String(day), x + 12, y + 22);

    if (achievement) {
      const miniR = 14;
      const miniCx = x + CELL_W - 12 - miniR;
      const miniCy = y + 12 + miniR;
      ctx.save();
      ctx.beginPath();
      ctx.arc(miniCx, miniCy, miniR, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = '#212948';
      ctx.fill();
      ctx.strokeStyle = '#ffb700';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.clip();
      if (img) ctx.drawImage(img, miniCx - miniR, miniCy - miniR, miniR * 2, miniR * 2);
      ctx.restore();

      starsRow(ctx, achievement.categorias.length, x + CELL_W / 2, y + CELL_H / 2 + 8, 15);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#c9d3e6';
      ctx.font = '600 9px Arial';
      const catLine = achievement.categorias.map((c) => CAT_SHORT_LABEL[c]).join(' · ');
      ctx.fillText(catLine, x + CELL_W / 2, y + CELL_H - 14, CELL_W - 12);
    }
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#8b90bf';
  ctx.font = '500 11px Arial';
  ctx.fillText('Gerado pelo Gestão de Vendas' + (data.storeName ? ' — ' + data.storeName : ''), W / 2, H - 14);

  return canvas;
}
