// Ported 1:1 from legacy/index-original.html (#imgModalBackdrop in viewRanking()).
// Generic enough to be reused by Galeria de Conquistas' "Copiar galeria
// (imagem)" — only the title/filename/alt differ per caller.
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
          {copied
            ? 'A imagem já foi copiada para a área de transferência — é só colar no WhatsApp.'
            : 'Não consegui copiar automaticamente. Baixe a imagem ou mantenha o dedo pressionado sobre ela para salvar/compartilhar.'}
        </p>
        <img src={url} alt={alt} className="w-full rounded-lg border border-slate-800" />
        <div className="flex gap-2 mt-3">
          <button onClick={onClose} className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">
            Fechar
          </button>
          <a
            href={url}
            download={filename}
            className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold text-center text-slate-950"
            style={{ background: '#ffb700' }}
          >
            ⬇ Baixar imagem
          </a>
        </div>
      </div>
    </div>
  );
}
