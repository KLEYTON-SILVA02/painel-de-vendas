import maskFotoUrl from '../assets/conquistas/mascara-foto.jpg';
import maskLogoUrl from '../assets/conquistas/mascara-logo.jpg';
import maskTextoUrl from '../assets/conquistas/mascara-texto.jpg';
import bgUrl from '../assets/conquistas/plano-de-fundo.jpg';
import { loadImg } from './rankingImage';

// Exact-cutout renderer for the Galeria de Conquistas "figurinha" achievement
// card. Each of the 3 content zones (photo / store logo / tier-text banner)
// is clipped to a mask shape via `destination-in` compositing instead of the
// previous CSS border-radius approximation. A zone's mask is either:
//   - a real raster image (the 4 reference assets supplied for the built-in
//     Hiteck template — exact pixel geometry, not reproducible with a
//     parametric shape), or
//   - a procedural shape (circle/roundedRect/pill/trapezoid/notched) with
//     normalized position+scale, used by admin-created templates from the
//     manual card editor (there's no per-template raster mask upload tool —
//     shapes are built by picking a primitive and dragging/scaling it).

export type CardZoneShapeKind = 'image' | 'circle' | 'roundedRect' | 'pill' | 'trapezoid' | 'notched';

export interface CardZoneShape {
  kind: CardZoneShapeKind;
  /** kind 'image' only: URL of a full-canvas-sized grayscale mask (white = visible). */
  imageUrl?: string;
  /** roundedRect only: corner radius as a fraction (0-1) of min(w,h)/2. */
  radius?: number;
  /** trapezoid only: how much narrower the top edge is than the bottom, as a fraction (0-0.5) of the zone width. */
  topInset?: number;
  /** notched only: size of each corner cut, as a fraction (0-0.5) of min(w,h). */
  notch?: number;
}

export interface CardZone {
  shape: CardZoneShape;
  /** Normalized bounding box (0-1) within the card canvas — both where content is placed and, for non-'image' shapes, the mask geometry itself. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ConquistaCardTemplate {
  id: string;
  name: string;
  backgroundUrl: string;
  foto: CardZone;
  logo: CardZone;
  texto: CardZone;
}

export interface ConquistaCardContent {
  photoUrl: string | null;
  logoUrl: string | null;
  tierText: string;
  color: string;
}

/** Reference geometry measured directly from the 4 supplied Hiteck card
 * assets (connected-component analysis of each mask's white region). */
export const BUILT_IN_TEMPLATE: ConquistaCardTemplate = {
  id: 'builtin-hiteck',
  name: 'Hiteck (padrão)',
  backgroundUrl: bgUrl,
  foto: { shape: { kind: 'image', imageUrl: maskFotoUrl }, x: 0.0742, y: 0.0334, w: 0.8509, h: 0.7963 },
  logo: { shape: { kind: 'image', imageUrl: maskLogoUrl }, x: 0.3168, y: 0.0274, w: 0.3663, h: 0.0321 },
  texto: { shape: { kind: 'image', imageUrl: maskTextoUrl }, x: 0.1531, y: 0.8362, w: 0.6939, h: 0.0917 },
};

const CANVAS_W = 750;
const CANVAS_H = Math.round((CANVAS_W * 2302) / 1496);

type Rect = { x: number; y: number; w: number; h: number };

function zoneRect(zone: CardZone, w: number, h: number): Rect {
  return { x: zone.x * w, y: zone.y * h, w: zone.w * w, h: zone.h * h };
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
}

function shapePath(ctx: CanvasRenderingContext2D, shape: CardZoneShape, rect: Rect) {
  const { x, y, w, h } = rect;
  switch (shape.kind) {
    case 'circle': {
      const r = Math.min(w, h) / 2;
      ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
      return;
    }
    case 'pill':
      roundRectPath(ctx, x, y, w, h, Math.min(w, h) / 2);
      return;
    case 'roundedRect':
      roundRectPath(ctx, x, y, w, h, ((shape.radius ?? 0.15) * Math.min(w, h)) / 2);
      return;
    case 'trapezoid': {
      const inset = (shape.topInset ?? 0.15) * w;
      ctx.moveTo(x + inset, y);
      ctx.lineTo(x + w - inset, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      return;
    }
    case 'notched': {
      const cut = (shape.notch ?? 0.12) * Math.min(w, h);
      ctx.moveTo(x + cut, y);
      ctx.lineTo(x + w - cut, y);
      ctx.lineTo(x + w, y + cut);
      ctx.lineTo(x + w, y + h - cut);
      ctx.lineTo(x + w - cut, y + h);
      ctx.lineTo(x + cut, y + h);
      ctx.lineTo(x, y + h - cut);
      ctx.lineTo(x, y + cut);
      return;
    }
    case 'image':
      return;
  }
}

// A raster mask is a plain grayscale JPEG (no alpha channel), but
// `destination-in` only reads the source's alpha — its RGB is irrelevant.
// So each mask is converted once into an alpha stencil (luminance → alpha,
// RGB forced to white) and cached by URL, since the same bundled asset is
// reused across every card rendered on the page.
const maskAlphaCache = new Map<string, Promise<HTMLCanvasElement | null>>();

async function maskToAlphaCanvas(url: string): Promise<HTMLCanvasElement | null> {
  const img = await loadImg(url);
  if (!img) return null;
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const luminance = (d[i] + d[i + 1] + d[i + 2]) / 3;
    d[i] = 255;
    d[i + 1] = 255;
    d[i + 2] = 255;
    d[i + 3] = luminance;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function getMaskAlphaCanvas(url: string): Promise<HTMLCanvasElement | null> {
  let p = maskAlphaCache.get(url);
  if (!p) {
    p = maskToAlphaCanvas(url);
    maskAlphaCache.set(url, p);
  }
  return p;
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, rect: Rect, fallbackColor: string) {
  if (!img) {
    ctx.fillStyle = fallbackColor;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    return;
  }
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.max(rect.w / iw, rect.h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, rect.x + (rect.w - dw) / 2, rect.y + (rect.h - dh) / 2, dw, dh);
}

function drawContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, rect: Rect, bgColor: string) {
  ctx.fillStyle = bgColor;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  if (!img) return;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.min(rect.w / iw, rect.h / ih) * 0.85;
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, rect.x + (rect.w - dw) / 2, rect.y + (rect.h - dh) / 2, dw, dh);
}

async function drawZone(
  ctx: CanvasRenderingContext2D,
  zone: CardZone,
  w: number,
  h: number,
  drawContent: (octx: CanvasRenderingContext2D, rect: Rect) => void,
) {
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d');
  if (!octx) return;
  const rect = zoneRect(zone, w, h);
  drawContent(octx, rect);
  octx.globalCompositeOperation = 'destination-in';
  if (zone.shape.kind === 'image') {
    const mask = zone.shape.imageUrl ? await getMaskAlphaCanvas(zone.shape.imageUrl) : null;
    if (mask) octx.drawImage(mask, 0, 0, w, h);
  } else {
    octx.fillStyle = '#fff';
    octx.beginPath();
    shapePath(octx, zone.shape, rect);
    octx.closePath();
    octx.fill();
  }
  ctx.drawImage(off, 0, 0);
}

/** Renders a full card (background + photo + logo + tier banner, all
 * exactly clipped to the template's mask geometry) onto a freshly created
 * canvas at a fixed resolution matching the reference art's aspect ratio. */
export async function renderConquistaCard(template: ConquistaCardTemplate, content: ConquistaCardContent): Promise<HTMLCanvasElement> {
  const [bg, photo, logo] = await Promise.all([loadImg(template.backgroundUrl), loadImg(content.photoUrl), loadImg(content.logoUrl)]);

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  if (bg) ctx.drawImage(bg, 0, 0, CANVAS_W, CANVAS_H);

  await drawZone(ctx, template.foto, CANVAS_W, CANVAS_H, (octx, rect) => drawCover(octx, photo, rect, '#334155'));
  await drawZone(ctx, template.logo, CANVAS_W, CANVAS_H, (octx, rect) => drawContain(octx, logo, rect, '#ffffff'));
  await drawZone(ctx, template.texto, CANVAS_W, CANVAS_H, (octx, rect) => {
    octx.fillStyle = content.color;
    octx.fillRect(rect.x, rect.y, rect.w, rect.h);
  });

  const tRect = zoneRect(template.texto, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#0b0e1d';
  ctx.font = `800 ${Math.round(CANVAS_H * 0.024)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(content.tierText.toUpperCase(), tRect.x + tRect.w / 2, tRect.y + tRect.h / 2);

  return canvas;
}
