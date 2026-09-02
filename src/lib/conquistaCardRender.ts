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

export type CardZoneShapeKind = 'image' | 'circle' | 'roundedRect' | 'pill' | 'trapezoid' | 'notched' | 'polygon' | 'none';

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
  /** kind 'polygon' only: a freehand-traced outline (the "pen tool"), as
   * points normalized 0-1 against the full canvas — independent of the
   * zone's own x/y/w/h, which for a polygon just track its bounding box
   * (used for cover-fitting content before the exact clip is applied). */
  points?: { x: number; y: number }[];
}

export interface CardZone {
  shape: CardZoneShape;
  /** Normalized bounding box (0-1) within the card canvas — both where content is placed and, for non-'image'/'polygon' shapes, the mask geometry itself. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export type CardTextKind = 'tier' | 'categoria' | 'custom';

export interface CardTextLayer {
  id: string;
  /** 'tier' and 'categoria' are data-driven per achiever at render time
   * (ConquistaCardContent.valorText / .categoriaText — e.g. "3K" and
   * "DERMOCOSMÉTICOS"); 'custom' uses this layer's own literal `text`,
   * fixed for every card rendered from the template. */
  kind: CardTextKind;
  /** Literal text — only meaningful (and editable) for kind 'custom'. */
  text: string;
  /** Position/scale, same as foto/logo — and, via `zone.shape`, whether a
   * background plate is drawn behind the text at all ('none' = no plate,
   * just the text on the raw background art). */
  zone: CardZone;
  fontFamily: string;
  /** Font size as a fraction of the canvas height (same convention as the
   * previous hardcoded 0.024 ratio). Falls back to 0.024 when unset, for
   * templates saved before this control existed. */
  fontSize?: number;
  /** Used when `useGradient` is false. */
  color: string;
  useGradient: boolean;
  gradientFrom: string;
  gradientTo: string;
  /** Gradient direction in degrees (0 = left→right, 90 = top→bottom,
   * measured clockwise). Falls back to 45 (the previous fixed diagonal)
   * when unset. Only meaningful when `useGradient` is true. */
  gradientAngle?: number;
}

export interface ConquistaCardTemplate {
  id: string;
  name: string;
  backgroundUrl: string;
  /** Per-template logo override — falls back to the store's own logo
   * (ConquistaCardContent.logoUrl) when unset. */
  logoUrl?: string | null;
  /** Contain-fit scale multiplier for the logo within its zone (defaults to
   * 0.85 — the previous hardcoded value — when unset). */
  logoScale?: number;
  /** Up to 3 independent text layers — the multi-text-layer editor's data
   * model. Takes over text rendering entirely when set (even to an empty
   * array); `texto`/`textFontFamily` below are read only when it's unset,
   * for templates saved before this editor existed. */
  textLayers?: CardTextLayer[];
  /** @deprecated legacy single text zone, superseded by `textLayers`. */
  texto?: CardZone;
  /** @deprecated legacy tier-banner font, superseded by each layer's own
   * `fontFamily` in `textLayers`. */
  textFontFamily?: string;
  foto: CardZone;
  logo: CardZone;
}

export interface ConquistaCardContent {
  photoUrl: string | null;
  logoUrl: string | null;
  /** Legacy combined tier+category text (e.g. "3K DERMOCOSMÉTICOS") — read
   * only by templates without `textLayers` (see above). */
  tierText: string;
  /** Just the value part (e.g. "3K", "5un") — feeds a `kind: 'tier'` layer. */
  valorText: string;
  /** Just the category-name part (e.g. "DERMOCOSMÉTICOS") — feeds a
   * `kind: 'categoria'` layer. */
  categoriaText: string;
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

export const CANVAS_W = 750;
export const CANVAS_H = Math.round((CANVAS_W * 2302) / 1496);

/** Quotes a (possibly multi-word) family name and appends a generic
 * fallback, for use directly in a canvas `ctx.font` string. */
function fontStack(family: string): string {
  return `"${family}", Arial, sans-serif`;
}

type Rect = { x: number; y: number; w: number; h: number };

function zoneRect(zone: CardZone, w: number, h: number): Rect {
  return { x: zone.x * w, y: zone.y * h, w: zone.w * w, h: zone.h * h };
}

/** Endpoints of a gradient line through the rect's center, long enough
 * (half the rect's diagonal in each direction) to span the full rect at
 * any angle. `angleDeg` is clockwise from the positive x-axis (0 = left→
 * right, 90 = top→bottom), matching a standard CSS-like orientation. */
function gradientEndpoints(rect: Rect, angleDeg: number): { x0: number; y0: number; x1: number; y1: number } {
  const angleRad = (angleDeg * Math.PI) / 180;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const halfLen = Math.sqrt(rect.w * rect.w + rect.h * rect.h) / 2;
  const dx = Math.cos(angleRad) * halfLen;
  const dy = Math.sin(angleRad) * halfLen;
  return { x0: cx - dx, y0: cy - dy, x1: cx + dx, y1: cy + dy };
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
}

function shapePath(ctx: CanvasRenderingContext2D, shape: CardZoneShape, rect: Rect, canvasW: number, canvasH: number) {
  const { x, y, w, h } = rect;
  switch (shape.kind) {
    case 'polygon': {
      const pts = shape.points ?? [];
      if (pts.length < 3) {
        // Not enough points to form a shape yet (still being drawn, or
        // saved incomplete) — fall back to the plain rect rather than
        // producing a fully-transparent (invisible) clip.
        ctx.rect(x, y, w, h);
        return;
      }
      ctx.moveTo(pts[0].x * canvasW, pts[0].y * canvasH);
      pts.slice(1).forEach((p) => ctx.lineTo(p.x * canvasW, p.y * canvasH));
      return;
    }
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
    case 'none':
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

function drawContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, rect: Rect, bgColor: string, fitScale = 0.85) {
  ctx.fillStyle = bgColor;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  if (!img) return;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.min(rect.w / iw, rect.h / ih) * fitScale;
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
  if (zone.shape.kind !== 'none') {
    octx.globalCompositeOperation = 'destination-in';
    if (zone.shape.kind === 'image') {
      const mask = zone.shape.imageUrl ? await getMaskAlphaCanvas(zone.shape.imageUrl) : null;
      if (mask) octx.drawImage(mask, 0, 0, w, h);
    } else {
      octx.fillStyle = '#fff';
      octx.beginPath();
      shapePath(octx, zone.shape, rect, w, h);
      octx.closePath();
      octx.fill();
    }
  }
  ctx.drawImage(off, 0, 0);
}

/** Draws one text layer: an optional background plate (the zone's shape,
 * filled with `plateColor` — skipped entirely when `zone.shape.kind` is
 * 'none', same "shape-optional" convention every other zone already uses)
 * followed by the layer's own text, filled with either a solid color or a
 * left-to-right 2-color gradient across the zone's own rect. */
async function drawTextLayer(ctx: CanvasRenderingContext2D, layer: CardTextLayer, w: number, h: number, text: string, plateColor: string) {
  if (layer.zone.shape.kind !== 'none') {
    await drawZone(ctx, layer.zone, w, h, (octx, rect) => {
      octx.fillStyle = plateColor;
      octx.fillRect(rect.x, rect.y, rect.w, rect.h);
    });
  }
  if (!text) return;
  const rect = zoneRect(layer.zone, w, h);
  ctx.font = `800 ${Math.round(h * (layer.fontSize ?? 0.024))}px ${fontStack(layer.fontFamily || 'Arial')}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (layer.useGradient) {
    const { x0, y0, x1, y1 } = gradientEndpoints(rect, layer.gradientAngle ?? 45);
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, layer.gradientFrom);
    grad.addColorStop(1, layer.gradientTo);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = layer.color;
  }
  ctx.fillText(text.toUpperCase(), rect.x + rect.w / 2, rect.y + rect.h / 2);
}

/** Renders a full card (background + photo + logo + text layers, all
 * exactly clipped to the template's mask geometry) onto a freshly created
 * canvas at a fixed resolution matching the reference art's aspect ratio. */
export async function renderConquistaCard(template: ConquistaCardTemplate, content: ConquistaCardContent): Promise<HTMLCanvasElement> {
  // Google-Fonts families (see index.html) load asynchronously — without
  // this, a card rendered right after page load could draw its text in the
  // browser's fallback font for one frame (or, for a static PNG export like
  // "Baixar imagem", permanently) before the real font finished loading.
  // Resolves immediately once every requested webfont is already loaded, so
  // this is a no-op wait on every render after the first.
  if (typeof document !== 'undefined' && document.fonts) await document.fonts.ready;

  const effectiveLogoUrl = template.logoUrl ?? content.logoUrl;
  const [bg, photo, logo] = await Promise.all([loadImg(template.backgroundUrl), loadImg(content.photoUrl), loadImg(effectiveLogoUrl)]);

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  if (bg) ctx.drawImage(bg, 0, 0, CANVAS_W, CANVAS_H);

  await drawZone(ctx, template.foto, CANVAS_W, CANVAS_H, (octx, rect) => drawCover(octx, photo, rect, '#334155'));
  await drawZone(ctx, template.logo, CANVAS_W, CANVAS_H, (octx, rect) => drawContain(octx, logo, rect, '#ffffff', template.logoScale ?? 0.85));

  if (template.textLayers) {
    for (const layer of template.textLayers) {
      const text = layer.kind === 'tier' ? content.valorText : layer.kind === 'categoria' ? content.categoriaText : layer.text;
      // eslint-disable-next-line no-await-in-loop
      await drawTextLayer(ctx, layer, CANVAS_W, CANVAS_H, text, content.color);
    }
  } else if (template.texto) {
    // Legacy single hardcoded tier banner, for templates saved before the
    // multi-text-layer editor existed (and BUILT_IN_TEMPLATE).
    if (template.texto.shape.kind !== 'none') {
      await drawZone(ctx, template.texto, CANVAS_W, CANVAS_H, (octx, rect) => {
        octx.fillStyle = content.color;
        octx.fillRect(rect.x, rect.y, rect.w, rect.h);
      });
    }
    const tRect = zoneRect(template.texto, CANVAS_W, CANVAS_H);
    ctx.fillStyle = template.texto.shape.kind === 'none' ? content.color : '#0b0e1d';
    ctx.font = `800 ${Math.round(CANVAS_H * 0.024)}px ${fontStack(template.textFontFamily ?? 'Arial')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(content.tierText.toUpperCase(), tRect.x + tRect.w / 2, tRect.y + tRect.h / 2);
  }

  return canvas;
}
