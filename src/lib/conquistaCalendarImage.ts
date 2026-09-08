import { loadImg, roundRect } from './rankingImage';
import { ALL_CONQUISTA_CATEGORIAS, type ConquistaCategoria, type DayAchievement } from './business/conquistas';

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
  /** Nome completo do colaborador — exibido no card do topo, sempre por
   * extenso (não o apelido), a pedido explícito para este documento. */
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
const HEADER_CARD_TOP = 20;
const HEADER_CARD_H = 130;
const HEADER_GAP = 18;
const WEEKDAY_ROW_H = 32;
const DETAIL_GAP = 26;
const DETAIL_TITLE_H = 30;
const DETAIL_COL_GAP = 12;
const DETAIL_COL_PAD = 10;
const DETAIL_HEADER_H = 26;
const DETAIL_LINE_H = 18;
const FOOTER_H = 30;

/** 'dark' is the on-screen/JPG/WhatsApp look (unchanged). 'print' is used
 * only for the PDF export: a black-and-white office printer renders any
 * dark fill as a heavy, ink-hungry block, so this swaps the near-black
 * background and borders for white/light-gray, keeping color (the amber
 * accent) only on the day cells that actually have an achievement — per
 * the explicit ask that non-date chrome (background, header, weekday row)
 * stay plain while only the dated cells carry any color. All text/ink
 * tones in this palette are kept near-black (not mid-gray) so a printer
 * lays them down as a solid, legible black instead of a faded gray. */
type CalendarTheme = 'dark' | 'print';

const PALETTES: Record<
  CalendarTheme,
  {
    bgFrom: string;
    bgTo: string;
    cardBg: string;
    cardBorder: string;
    headerName: string;
    headerSub: string;
    headerTotalLabel: string;
    divider: string;
    weekdayLabel: string;
    avatarFallbackBg: string;
    cellFillAchieved: string;
    cellFillEmpty: string;
    cellBorderAchieved: string;
    cellBorderEmpty: string;
    dayNumberAchieved: string;
    dayNumberEmpty: string;
    starEmpty: string;
    catLine: string;
    footer: string;
    detailTitle: string;
    detailColBg: string;
    detailColBorder: string;
    detailDateText: string;
    detailEmptyText: string;
  }
> = {
  dark: {
    bgFrom: '#0d1428',
    bgTo: '#070814',
    cardBg: 'rgba(255,183,0,.06)',
    cardBorder: 'rgba(255,183,0,.35)',
    headerName: '#ffffff',
    headerSub: '#8b90bf',
    headerTotalLabel: '#8b90bf',
    divider: 'rgba(255,183,0,.3)',
    weekdayLabel: '#8b90bf',
    avatarFallbackBg: '#212948',
    cellFillAchieved: 'rgba(255,183,0,.08)',
    cellFillEmpty: '#0b0e1d',
    cellBorderAchieved: '#ffb700',
    cellBorderEmpty: '#212948',
    dayNumberAchieved: '#ffb700',
    dayNumberEmpty: '#4a5178',
    starEmpty: '#2b3350',
    catLine: '#c9d3e6',
    footer: '#8b90bf',
    detailTitle: '#ffb700',
    detailColBg: '#0b0e1d',
    detailColBorder: '#212948',
    detailDateText: '#c9d3e6',
    detailEmptyText: '#4a5178',
  },
  print: {
    bgFrom: '#ffffff',
    bgTo: '#ffffff',
    cardBg: '#ffffff',
    cardBorder: '#000000',
    headerName: '#000000',
    headerSub: '#1a1a1a',
    headerTotalLabel: '#000000',
    divider: '#000000',
    weekdayLabel: '#1a1a1a',
    avatarFallbackBg: '#eef0f5',
    cellFillAchieved: 'rgba(255,183,0,.18)',
    cellFillEmpty: '#ffffff',
    cellBorderAchieved: '#000000',
    cellBorderEmpty: '#000000',
    dayNumberAchieved: '#000000',
    dayNumberEmpty: '#1a1a1a',
    starEmpty: '#9a9a9a',
    catLine: '#000000',
    footer: '#1a1a1a',
    detailTitle: '#000000',
    detailColBg: '#ffffff',
    detailColBorder: '#000000',
    detailDateText: '#000000',
    detailEmptyText: '#3a3a3a',
  },
};

/** Category accent color per theme — vivid for screen/JPG, darkened for
 * print so a grayscale office printer still lays each one down as a
 * legible dark ink instead of a washed-out light gray. */
const CAT_COLOR: Record<CalendarTheme, Record<ConquistaCategoria, string>> = {
  dark: { DERM: '#ff3df0', GEN: '#14ff00', MP: '#a82bff', LEVMEL: '#ffb700', CHIP: '#00e5ff' },
  print: { DERM: '#8a1f76', GEN: '#1f7a12', MP: '#5b1a8a', LEVMEL: '#8a5c00', CHIP: '#00707a' },
};

function starsRow(ctx: CanvasRenderingContext2D, count: number, cx: number, cy: number, size: number, palette: (typeof PALETTES)['dark']) {
  // Stars are filled left-to-right purely by count — never mapped to a
  // specific category or its position in ALL_CONQUISTA_CATEGORIAS — so the
  // filled run always starts at the leftmost star regardless of which
  // categories were actually reached that day.
  const gap = size * 0.15;
  const totalW = 5 * size + 4 * gap;
  let sx = cx - totalW / 2 + size / 2;
  ctx.textAlign = 'center';
  ctx.font = `${size}px Arial`;
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < count ? '#ffb700' : palette.starEmpty;
    ctx.fillText('★', sx, cy);
    sx += size + gap;
  }
}

/** Greedily wraps a sorted list of "DD" day numbers into comma-separated
 * lines that fit `maxWidth` under the context's current font — used to lay
 * out each category's achievement-dates column without a fixed line count. */
function wrapDateList(ctx: CanvasRenderingContext2D, days: string[], maxWidth: number): string[] {
  if (days.length === 0) return ['—'];
  const sorted = [...days].sort((a, b) => Number(a) - Number(b));
  const lines: string[] = [];
  let current = '';
  for (const day of sorted) {
    const candidate = current ? `${current}, ${day}` : day;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = day;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function renderConquistaCalendar(data: ConquistaCalendarData, theme: CalendarTheme = 'dark'): Promise<HTMLCanvasElement> {
  const palette = PALETTES[theme];
  const catColor = CAT_COLOR[theme];
  const firstWeekday = new Date(data.ano, data.mes, 1).getDay();
  const diasNoMes = new Date(data.ano, data.mes + 1, 0).getDate();
  const totalCells = firstWeekday + diasNoMes;
  const rows = Math.ceil(totalCells / 7);

  const W = GRID_LEFT * 2 + CELL_W * 7;

  // Detalhamento por categoria: dates (day-of-month) this collaborator
  // reached each of the 5 categories this month, in the app's fixed
  // category order (ALL_CONQUISTA_CATEGORIAS) — independent of the order
  // achievements happened to occur in.
  const datesByCategory: Record<ConquistaCategoria, string[]> = { DERM: [], GEN: [], MP: [], LEVMEL: [], CHIP: [] };
  data.achievements.forEach((a) => {
    const dayNum = a.dia.slice(-2);
    a.categorias.forEach((cat) => datesByCategory[cat].push(dayNum));
  });

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = 10;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Pre-measure the detail columns (their text wraps to a variable number
  // of lines) so the canvas can be sized correctly before anything is
  // drawn — resizing canvas.width/height after drawing would wipe it.
  const colW = (W - GRID_LEFT * 2 - DETAIL_COL_GAP * 4) / 5;
  const detailFont = '600 13px Arial';
  ctx.font = detailFont;
  const wrappedByCat = ALL_CONQUISTA_CATEGORIAS.map((cat) => wrapDateList(ctx, datesByCategory[cat], colW - DETAIL_COL_PAD * 2));
  const maxLines = Math.max(1, ...wrappedByCat.map((w) => w.length));
  const detailColH = DETAIL_HEADER_H + maxLines * DETAIL_LINE_H + DETAIL_COL_PAD * 2;

  const gridTop = HEADER_CARD_TOP + HEADER_CARD_H + HEADER_GAP + WEEKDAY_ROW_H;
  const gridBottom = gridTop + rows * CELL_H;
  const detailTop = gridBottom + DETAIL_GAP;
  const H = detailTop + DETAIL_TITLE_H + detailColH + FOOTER_H;

  canvas.width = W;
  canvas.height = H;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, palette.bgFrom);
  bg.addColorStop(1, palette.bgTo);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Header card: the very first thing on the page — collaborator photo,
  // nome completo, and the month's total conquistas — enclosed in its own
  // bordered card instead of loose header text.
  roundRect(ctx, GRID_LEFT, HEADER_CARD_TOP, W - GRID_LEFT * 2, HEADER_CARD_H, 14);
  ctx.fillStyle = palette.cardBg;
  ctx.fill();
  ctx.strokeStyle = palette.cardBorder;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const avatarR = 42;
  const avatarCx = GRID_LEFT + 18 + avatarR;
  const avatarCy = HEADER_CARD_TOP + HEADER_CARD_H / 2;
  const img = await loadImg(data.foto);
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = palette.avatarFallbackBg;
  ctx.fill();
  ctx.strokeStyle = '#ffb700';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.clip();
  if (img) {
    ctx.drawImage(img, avatarCx - avatarR, avatarCy - avatarR, avatarR * 2, avatarR * 2);
  } else {
    ctx.fillStyle = '#ffb700';
    ctx.font = '700 36px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((data.nome || '?').charAt(0).toUpperCase(), avatarCx, avatarCy);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.fillStyle = palette.headerName;
  ctx.font = '700 25px Arial';
  ctx.fillText(data.nome, avatarCx + avatarR + 22, avatarCy - 10);
  ctx.fillStyle = palette.headerSub;
  ctx.font = '600 13px Arial';
  ctx.fillText(`Mat. ${data.matricula}${data.storeName ? ' · ' + data.storeName : ''}`, avatarCx + avatarR + 22, avatarCy + 14);

  const rightX = W - GRID_LEFT - 18;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffb700';
  ctx.font = '700 20px Arial';
  ctx.fillText(`${data.mesLabel} / ${data.ano}`, rightX, avatarCy - 30);
  ctx.fillStyle = palette.headerTotalLabel;
  ctx.font = '700 22px Arial';
  ctx.fillText(`${data.totalEstrelas} conquistas no mês`, rightX, avatarCy);
  ctx.fillStyle = palette.headerSub;
  ctx.font = '600 13px Arial';
  ctx.fillText(`${data.percentual.toFixed(0)}% de atingimento`, rightX, avatarCy + 22);

  // Weekday header row
  const weekdayY = HEADER_CARD_TOP + HEADER_CARD_H + HEADER_GAP;
  ctx.textAlign = 'center';
  ctx.fillStyle = palette.weekdayLabel;
  ctx.font = '700 12px Arial';
  WEEKDAY_LABELS.forEach((label, i) => {
    ctx.fillText(label, GRID_LEFT + i * CELL_W + CELL_W / 2, weekdayY + WEEKDAY_ROW_H - 10);
  });

  const byDay = new Map(data.achievements.map((a) => [a.dia, a]));

  for (let day = 1; day <= diasNoMes; day++) {
    const cellIndex = firstWeekday + day - 1;
    const col = cellIndex % 7;
    const row = Math.floor(cellIndex / 7);
    const x = GRID_LEFT + col * CELL_W;
    const y = gridTop + row * CELL_H;
    const dia = `${data.ano}-${String(data.mes + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const achievement = byDay.get(dia);

    ctx.fillStyle = achievement ? palette.cellFillAchieved : palette.cellFillEmpty;
    roundRect(ctx, x + 4, y + 4, CELL_W - 8, CELL_H - 8, 10);
    ctx.fill();
    ctx.strokeStyle = achievement ? palette.cellBorderAchieved : palette.cellBorderEmpty;
    ctx.lineWidth = achievement ? 2 : 1;
    roundRect(ctx, x + 4, y + 4, CELL_W - 8, CELL_H - 8, 10);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = achievement ? palette.dayNumberAchieved : palette.dayNumberEmpty;
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
      ctx.fillStyle = palette.avatarFallbackBg;
      ctx.fill();
      ctx.strokeStyle = '#ffb700';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.clip();
      if (img) ctx.drawImage(img, miniCx - miniR, miniCy - miniR, miniR * 2, miniR * 2);
      ctx.restore();

      starsRow(ctx, achievement.categorias.length, x + CELL_W / 2, y + CELL_H / 2 + 8, 15, palette);

      ctx.textAlign = 'center';
      ctx.fillStyle = palette.catLine;
      ctx.font = '600 9px Arial';
      const catLine = achievement.categorias.map((c) => CAT_SHORT_LABEL[c]).join(' · ');
      ctx.fillText(catLine, x + CELL_W / 2, y + CELL_H - 14, CELL_W - 12);
    }
  }

  // Detalhamento por categoria: below the date cells, one column per
  // category laid out side by side, each listing every date this month
  // that category's tier was reached.
  ctx.textAlign = 'left';
  ctx.fillStyle = palette.detailTitle;
  ctx.font = '700 14px Arial';
  ctx.fillText('DETALHAMENTO POR CATEGORIA', GRID_LEFT, detailTop + DETAIL_TITLE_H - 10);

  const colsTop = detailTop + DETAIL_TITLE_H;
  ALL_CONQUISTA_CATEGORIAS.forEach((cat, i) => {
    const colX = GRID_LEFT + i * (colW + DETAIL_COL_GAP);
    roundRect(ctx, colX, colsTop, colW, detailColH, 10);
    ctx.fillStyle = palette.detailColBg;
    ctx.fill();
    ctx.strokeStyle = palette.detailColBorder;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = catColor[cat];
    ctx.beginPath();
    roundRect(ctx, colX, colsTop, colW, 4, 2);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = catColor[cat];
    ctx.font = '700 12px Arial';
    ctx.fillText(CAT_SHORT_LABEL[cat], colX + colW / 2, colsTop + 20);

    const lines = wrappedByCat[i];
    const hasDates = datesByCategory[cat].length > 0;
    ctx.fillStyle = hasDates ? palette.detailDateText : palette.detailEmptyText;
    ctx.font = detailFont;
    lines.forEach((line, li) => {
      ctx.fillText(line, colX + colW / 2, colsTop + DETAIL_HEADER_H + DETAIL_COL_PAD + li * DETAIL_LINE_H + 11);
    });
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = palette.footer;
  ctx.font = '500 11px Arial';
  ctx.fillText('Gerado pelo Gestão de Vendas' + (data.storeName ? ' — ' + data.storeName : ''), W / 2, H - 14);

  return canvas;
}
