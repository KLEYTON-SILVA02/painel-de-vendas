import { CANVAS_H, CANVAS_W } from './conquistaCardRender';

export interface MagicWandResult {
  /** A full-card-canvas-sized black/white PNG data URL (white = selected) —
   * ready to use directly as a `CardZoneShape` of kind 'image': the same
   * raster-mask convention BUILT_IN_TEMPLATE's bundled masks already use. */
  maskDataUrl: string;
  /** Normalized (0-1) bounding box of the selection, for the zone's x/y/w/h. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** "Magic wand" area detection: flood-fills outward from a click point,
 * selecting every 4-connected pixel whose color stays within `tolerance` of
 * the clicked pixel's — the same tool every raster editor calls a magic
 * wand, reimplemented here (no image-processing library in this project)
 * as a plain iterative stack-based flood fill over the source image's pixel
 * data, rendered at the same CANVAS_W×CANVAS_H the card itself renders at
 * so a click position maps 1:1 to both.
 *
 * `img` should be whatever the admin is visually tracing against in the
 * editor preview — the reference guide image when one's loaded, otherwise
 * the template's own background art — drawn stretched to CANVAS_W×CANVAS_H
 * exactly like the preview and the real card render both already do, so
 * the selection lines up with what's on screen. */
export function magicWandSelect(img: HTMLImageElement, clickXNorm: number, clickYNorm: number, tolerance: number): MagicWandResult | null {
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = CANVAS_W;
  srcCanvas.height = CANVAS_H;
  const sctx = srcCanvas.getContext('2d');
  if (!sctx) return null;
  sctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
  const { data } = sctx.getImageData(0, 0, CANVAS_W, CANVAS_H);

  const startX = Math.min(CANVAS_W - 1, Math.max(0, Math.round(clickXNorm * (CANVAS_W - 1))));
  const startY = Math.min(CANVAS_H - 1, Math.max(0, Math.round(clickYNorm * (CANVAS_H - 1))));
  const startIdx = (startY * CANVAS_W + startX) * 4;
  const r0 = data[startIdx];
  const g0 = data[startIdx + 1];
  const b0 = data[startIdx + 2];
  const tol2 = tolerance * tolerance * 3;

  const selected = new Uint8Array(CANVAS_W * CANVAS_H);
  const startP = startY * CANVAS_W + startX;
  selected[startP] = 1;
  const stack: number[] = [startP];
  let minX = startX;
  let maxX = startX;
  let minY = startY;
  let maxY = startY;

  while (stack.length > 0) {
    const p = stack.pop()!;
    const px = p % CANVAS_W;
    const py = (p - px) / CANVAS_W;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;

    const neighbors = [px > 0 ? p - 1 : -1, px < CANVAS_W - 1 ? p + 1 : -1, py > 0 ? p - CANVAS_W : -1, py < CANVAS_H - 1 ? p + CANVAS_W : -1];
    for (const n of neighbors) {
      if (n < 0 || selected[n]) continue;
      const ni = n * 4;
      const dr = data[ni] - r0;
      const dg = data[ni + 1] - g0;
      const db = data[ni + 2] - b0;
      if (dr * dr + dg * dg + db * db <= tol2) {
        selected[n] = 1;
        stack.push(n);
      }
    }
  }

  // A single isolated pixel isn't a usable selection — reads as "nothing
  // detected" to the caller rather than saving a near-invisible sliver.
  if (minX === maxX && minY === maxY) return null;

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = CANVAS_W;
  maskCanvas.height = CANVAS_H;
  const mctx = maskCanvas.getContext('2d');
  if (!mctx) return null;
  const maskData = mctx.createImageData(CANVAS_W, CANVAS_H);
  for (let i = 0; i < selected.length; i++) {
    const v = selected[i] ? 255 : 0;
    const di = i * 4;
    maskData.data[di] = v;
    maskData.data[di + 1] = v;
    maskData.data[di + 2] = v;
    maskData.data[di + 3] = 255;
  }
  mctx.putImageData(maskData, 0, 0);

  return {
    maskDataUrl: maskCanvas.toDataURL('image/png'),
    x: minX / CANVAS_W,
    y: minY / CANVAS_H,
    w: Math.max(1, maxX - minX) / CANVAS_W,
    h: Math.max(1, maxY - minY) / CANVAS_H,
  };
}
