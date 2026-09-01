import { useEffect, useMemo, useState } from 'react';
import type { MultiImageResult } from '../../lib/rankingImage';
import { tryCopyImage } from '../../lib/rankingImage';
import { useStore } from '../../lib/queries';
import { openWhatsAppTarget } from '../../lib/whatsapp';

type CopyState = 'idle' | 'copying' | 'copied' | 'failed';

// Shown after "Todas as categorias" is chosen in GenerateImageScopeModal.
// WhatsApp has no way to pre-attach several images to a specific chat via a
// link (see lib/whatsapp.ts), and the clipboard can only hold one image at
// a time — a website also can't reach into another site's tab to paste or
// press Enter for the admin (that's a browser security boundary, not
// something this app can route around). So the best available flow is: open
// the chat once, then walk the admin through one clipboard copy per image in
// a fixed order — "Copiar" here, "Ctrl+V" + "Enter" there — with the "next"
// image always pre-selected so there's nothing to hunt for between copies.
export function MultiRankingImageModal({ images, text, onClose }: { images: MultiImageResult[]; text: string; onClose: () => void }) {
  const { data: store } = useStore();
  const [copyState, setCopyState] = useState<Record<string, CopyState>>({});
  const [opened, setOpened] = useState(false);

  const currentIndex = useMemo(() => images.findIndex((img) => copyState[img.key] !== 'copied'), [images, copyState]);
  const current = currentIndex >= 0 ? images[currentIndex] : null;
  const doneCount = images.filter((img) => copyState[img.key] === 'copied').length;

  async function handleCopy(key: string, url: string) {
    setCopyState((s) => ({ ...s, [key]: 'copying' }));
    try {
      const blob = await fetch(url).then((r) => r.blob());
      const ok = await tryCopyImage(blob);
      setCopyState((s) => ({ ...s, [key]: ok ? 'copied' : 'failed' }));
    } catch {
      setCopyState((s) => ({ ...s, [key]: 'failed' }));
    }
  }

  // Opening the chat is one direct click from the admin — the only moment a
  // browser reliably allows both a popup (window.open) and a clipboard write
  // without a permission prompt — so it does both at once: open the group
  // chat AND copy the first image, in the same gesture. Every image after
  // that is a single "Copiar próxima" click (or the C shortcut below).
  function handleOpenWhatsApp() {
    openWhatsAppTarget(store?.whatsapp, store?.whatsapp_group_link, text);
    setOpened(true);
    if (current) handleCopy(current.key, current.url);
  }

  // Lets the admin keep one hand on the keyboard for the copy→alt-tab→paste
  // →enter→alt-tab rhythm instead of having to aim the mouse at a button
  // every time — press C (or the same shortcut a browser exposes for
  // "assistive" quick actions) to copy whichever image is currently next.
  useEffect(() => {
    if (!opened || !current) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== 'c') return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (!current || copyState[current.key] === 'copying') return;
      handleCopy(current.key, current.url);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, current?.key]);

  const allDone = doneCount === images.length;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">Imagens de todas as categorias ({images.length})</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>

        {!opened ? (
          <>
            <p className="text-xs text-slate-500 mb-3">
              {store?.whatsapp_group_link
                ? 'Abra o grupo do WhatsApp: a primeira imagem já é copiada automaticamente junto, pronta para colar.'
                : 'Abra o WhatsApp: a primeira imagem já é copiada automaticamente junto, pronta para colar.'}
            </p>
            <button onClick={handleOpenWhatsApp} className="w-full mb-3 rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: '#25D366' }}>
              📲 Abrir WhatsApp e copiar a 1ª imagem
            </button>
          </>
        ) : allDone ? (
          <div className="mb-3 rounded-lg border border-green-700/50 bg-green-900/20 px-3 py-2.5 text-xs text-green-300">
            ✅ Todas as {images.length} imagens foram copiadas. Confira no WhatsApp se todas foram coladas e envie as que faltarem.
          </div>
        ) : (
          <div className="mb-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">
                {doneCount}/{images.length} copiadas — próxima:
              </span>
              <span className="text-xs font-medium text-cyan-400">{current!.title}</span>
            </div>
            <img src={current!.url} alt={current!.title} className="w-full rounded-lg border border-slate-800 mb-2" />
            <button
              onClick={() => handleCopy(current!.key, current!.url)}
              disabled={copyState[current!.key] === 'copying'}
              className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
              style={{ background: '#ffb700' }}
            >
              {copyState[current!.key] === 'copying'
                ? 'Copiando…'
                : copyState[current!.key] === 'failed'
                  ? 'Falhou — tentar de novo'
                  : `📋 Copiar próxima imagem (ou tecla C)`}
            </button>
            <p className="text-[11px] text-slate-500 mt-2">Depois de copiar: alterne para o WhatsApp, Ctrl+V, Enter, e volte aqui.</p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((img, i) => {
            const state = copyState[img.key] ?? 'idle';
            const isCurrent = i === currentIndex;
            return (
              <div
                key={img.key}
                className={`rounded-lg border overflow-hidden ${isCurrent ? 'border-amber-500' : 'border-slate-800'}`}
              >
                <img src={img.url} alt={img.title} className="w-full" />
                <div className="p-2 flex flex-col gap-1.5">
                  <div className="text-xs font-medium text-slate-300 truncate">{img.title}</div>
                  <button
                    onClick={() => handleCopy(img.key, img.url)}
                    disabled={state === 'copying'}
                    className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                  >
                    {state === 'copied' ? '✓ Copiado' : state === 'copying' ? 'Copiando…' : state === 'failed' ? 'Falhou' : '📋 Copiar'}
                  </button>
                  <a
                    href={img.url}
                    download={img.filename}
                    className="rounded-md px-2 py-1 text-[11px] font-semibold text-center text-slate-950"
                    style={{ background: '#ffb700' }}
                  >
                    ⬇ Baixar
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
