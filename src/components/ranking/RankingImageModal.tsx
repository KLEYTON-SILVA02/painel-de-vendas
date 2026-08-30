import { useState } from 'react';
import { tryCopyImage } from '../../lib/rankingImage';

// Ported 1:1 from legacy/index-original.html (#imgModalBackdrop in viewRanking()).
// Generic enough to be reused by any "gerar imagem" flow in the app (ranking,
// Bio, dinâmicas, campeão) — only title/filename/alt differ per caller.
// Standard pair of actions: Baixar PNG (always available, direct download
// link) and Copiar Imagem (retries the clipboard write — the caller already
// attempts this once automatically before opening the modal; this lets the
// user retry if that first attempt silently failed, e.g. focus/permission
// issues, without needing to regenerate the image).
export function RankingImageModal({
  url,
  copied,
  onClose,
  title = 'Imagem do ranking',
  filename = 'ranking-vendas.png',
  alt = 'Ranking',
}: {
  url: string;
  copied: boolean;
  onClose: () => void;
  title?: string;
  filename?: string;
  alt?: string;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'failed'>(copied ? 'copied' : 'idle');

  async function handleCopy() {
    setCopyState('copying');
    try {
      const blob = await fetch(url).then((r) => r.blob());
      const ok = await tryCopyImage(blob);
      setCopyState(ok ? 'copied' : 'failed');
      if (!ok) setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('failed');
      setTimeout(() => setCopyState('idle'), 2000);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          {copyState === 'copied'
            ? 'A imagem já foi copiada para a área de transferência — é só colar no WhatsApp.'
            : 'Baixe a imagem ou copie pra área de transferência e cole diretamente no WhatsApp.'}
        </p>
        <img src={url} alt={alt} className="w-full rounded-lg border border-slate-800" />
        <div className="flex gap-2 mt-3">
          <button onClick={onClose} className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">
            Fechar
          </button>
          <button
            onClick={handleCopy}
            disabled={copyState === 'copying'}
            className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            {copyState === 'copied' ? '✓ Copiado' : copyState === 'copying' ? 'Copiando…' : copyState === 'failed' ? 'Falhou — tentar de novo' : '📋 Copiar imagem'}
          </button>
          <a
            href={url}
            download={filename}
            className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold text-center text-slate-950"
            style={{ background: '#ffb700' }}
          >
            ⬇ Baixar PNG
          </a>
        </div>
      </div>
    </div>
  );
}
