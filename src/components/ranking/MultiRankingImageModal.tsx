import { useState } from 'react';
import type { MultiImageResult } from '../../lib/rankingImage';
import { tryCopyImage } from '../../lib/rankingImage';
import { useStore } from '../../lib/queries';
import { openWhatsAppTarget } from '../../lib/whatsapp';

// Shown after "Todas as categorias" is chosen in GenerateImageScopeModal.
// WhatsApp has no way to pre-attach several images to a specific chat via a
// link (see lib/whatsapp.ts), and the clipboard can only hold one image at
// a time — so instead of reopening the WhatsApp chat once per image, this
// opens it a single time and lets the admin copy-and-paste each image in
// turn while that chat stays open, landing every image in the same
// registered group (or number) with minimal back-and-forth.
export function MultiRankingImageModal({ images, text, onClose }: { images: MultiImageResult[]; text: string; onClose: () => void }) {
  const { data: store } = useStore();
  const [copyState, setCopyState] = useState<Record<string, 'idle' | 'copying' | 'copied' | 'failed'>>({});
  const [opened, setOpened] = useState(false);

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

  function handleOpenWhatsApp() {
    openWhatsAppTarget(store?.whatsapp, store?.whatsapp_group_link, text);
    setOpened(true);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">Imagens de todas as categorias ({images.length})</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          {store?.whatsapp_group_link
            ? 'Abra o grupo do WhatsApp uma vez e depois copie e cole cada imagem abaixo, uma de cada vez.'
            : 'Abra o WhatsApp e depois copie e cole cada imagem abaixo, uma de cada vez.'}
        </p>
        <button onClick={handleOpenWhatsApp} className="w-full mb-3 rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: '#25D366' }}>
          {opened ? '✓ WhatsApp aberto — cole as imagens copiadas abaixo' : '📲 Abrir WhatsApp'}
        </button>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((img) => {
            const state = copyState[img.key] ?? 'idle';
            return (
              <div key={img.key} className="rounded-lg border border-slate-800 overflow-hidden">
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
