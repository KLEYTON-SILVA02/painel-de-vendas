import { useEffect, useRef, useState } from 'react';

// Self-contained square-crop tool (no external cropping library) — drag to
// pan, slider to zoom, then rasterize the visible region to a fixed-size
// output via canvas. Reused for both a collaborator's regular avatar and
// their separate Galeria de Conquistas photo.
const VIEWPORT = 280;
const OUTPUT = 480;

export function PhotoCropModal({
  file,
  title,
  onCancel,
  onCropped,
}: {
  file: File;
  title: string;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handleImgLoad() {
    const img = imgRef.current;
    if (!img) return;
    setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
  }

  // Base scale so the image always covers the square viewport at scale=1.
  function baseScale(): number {
    if (!imgSize) return 1;
    return Math.max(VIEWPORT / imgSize.w, VIEWPORT / imgSize.h);
  }

  function clampOffset(x: number, y: number, s: number) {
    if (!imgSize) return { x, y };
    const drawW = imgSize.w * baseScale() * s;
    const drawH = imgSize.h * baseScale() * s;
    const maxX = Math.max(0, (drawW - VIEWPORT) / 2);
    const maxY = Math.max(0, (drawH - VIEWPORT) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  }

  function handlePointerDown(e: React.PointerEvent) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: offset.x, origY: offset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clampOffset(dragRef.current.origX + dx, dragRef.current.origY + dy, scale));
  }
  function handlePointerUp() {
    dragRef.current = null;
  }

  function handleScaleChange(next: number) {
    setScale(next);
    setOffset((prev) => clampOffset(prev.x, prev.y, next));
  }

  function handleConfirm() {
    if (!imgRef.current || !imgSize) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const s = baseScale() * scale;
    const drawW = imgSize.w * s;
    const drawH = imgSize.h * s;
    // Map the VIEWPORT-space drawing (image centered + offset) to OUTPUT-space.
    const factor = OUTPUT / VIEWPORT;
    const dx = (VIEWPORT / 2 - drawW / 2 + offset.x) * factor;
    const dy = (VIEWPORT / 2 - drawH / 2 + offset.y) * factor;
    ctx.drawImage(imgRef.current, dx, dy, drawW * factor, drawH * factor);
    canvas.toBlob((blob) => {
      if (blob) onCropped(blob);
    }, 'image/jpeg', 0.92);
  }

  const s = baseScale() * scale;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[60]" onClick={onCancel}>
      <div className="w-full max-w-xs rounded-2xl border border-slate-800 bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-3 text-sm">{title}</h3>
        <div
          className="relative mx-auto overflow-hidden rounded-xl border border-slate-700 bg-slate-950 touch-none select-none"
          style={{ width: VIEWPORT, height: VIEWPORT, cursor: 'grab' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {imgUrl && (
            <img
              ref={imgRef}
              src={imgUrl}
              alt=""
              draggable={false}
              onLoad={handleImgLoad}
              style={
                imgSize
                  ? {
                      position: 'absolute',
                      left: VIEWPORT / 2 - (imgSize.w * s) / 2 + offset.x,
                      top: VIEWPORT / 2 - (imgSize.h * s) / 2 + offset.y,
                      width: imgSize.w * s,
                      height: imgSize.h * s,
                      maxWidth: 'none',
                      maxHeight: 'none',
                      pointerEvents: 'none',
                    }
                  : { visibility: 'hidden', maxWidth: 'none', maxHeight: 'none' }
              }
            />
          )}
        </div>
        <div className="mt-3">
          <label className="block text-[10px] text-slate-500 uppercase tracking-wide mb-1">Zoom</label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={scale}
            onChange={(e) => handleScaleChange(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <p className="text-[11px] text-slate-500 mt-2">Arraste para posicionar e use o zoom para ajustar o enquadramento.</p>
        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300">
            Cancelar
          </button>
          <button onClick={handleConfirm} className="flex-1 rounded-lg bg-cyan-500 text-slate-950 font-medium px-3 py-2 text-sm">
            Usar foto
          </button>
        </div>
      </div>
    </div>
  );
}
