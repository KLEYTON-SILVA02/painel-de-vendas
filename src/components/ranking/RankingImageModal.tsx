import { useState } from 'react';
import { tryCopyImage } from '../../lib/rankingImage';
import { useStore } from '../../lib/queries';
import { shareImageToWhatsApp } from '../../lib/whatsapp';

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
  compact = false,
}: {
  url: string;
  copied: boolean;
  onClose: () => void;
  title?: string;
  filename?: string;
  alt?: string;
  /** Portrait "figurinha" cards (single achiever in Galeria de Conquistas,
   * ~750×1150) render at nearly full modal width with no height cap, which
   * on a normal viewport towers well past the screen — nothing else in the
   * modal (buttons, title) fit alongside it. Landscape ranking/dinâmica
   * exports don't have this problem at the default max-w-xl, so this only
   * shrinks the modal for callers that opt in: same small centered card
   * size as ChampionCelebrationModal's own confetti notification (320px),
   * with the image capped to a height that still leaves the buttons
   * visible below it. */
  compact?: boolean;
}) {
  const { data: store } = useStore();
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'failed'>(copied ? 'copied' : 'idle');
  const [whatsappState, setWhatsappState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

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

  async function handleWhatsApp() {
    setWhatsappState('sending');
    try {
      const blob = await fetch(url).then((r) => r.blob());
      const outcome = await shareImageToWhatsApp(blob, filename, title, store?.whatsapp, store?.whatsapp_group_link);
      setWhatsappState(outcome === 'failed' ? 'failed' : 'sent');
      setTimeout(() => setWhatsappState('idle'), 2500);
    } catch {
      setWhatsappState('failed');
      setTimeout(() => setWhatsappState('idle'), 2500);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className={`w-full ${compact ? 'max-w-xs' : 'max-w-xl'} max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-5`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          {whatsappState === 'sent'
            ? 'Enviado — se a imagem não chegou anexada, ela foi copiada: é só colar (Ctrl/Cmd+V) na conversa que abriu.'
            : copyState === 'copied'
              ? 'A imagem já foi copiada para a área de transferência — é só colar no WhatsApp.'
              : 'Baixe a imagem, copie pra área de transferência ou envie direto por WhatsApp.'}
        </p>
        <img
          src={url}
          alt={alt}
          className={`mx-auto rounded-lg border border-slate-800 ${compact ? 'max-h-[45vh] w-auto max-w-full object-contain' : 'w-full'}`}
        />
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
        <button
          onClick={handleWhatsApp}
          disabled={whatsappState === 'sending'}
          className="w-full mt-2 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: '#25D366' }}
        >
          {whatsappState === 'sent' ? '✓ Enviado' : whatsappState === 'sending' ? 'Enviando…' : whatsappState === 'failed' ? 'Falhou — tentar de novo' : '📲 Enviar por WhatsApp'}
        </button>
      </div>
    </div>
  );
}
