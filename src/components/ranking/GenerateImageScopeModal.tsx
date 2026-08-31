// Small confirmation step in front of any "Gerar imagem" ranking button:
// lets the user pick between imaging just the category they're looking at
// or generating one image per category in one go (see MultiRankingImageModal
// for what happens after "Todas as categorias").
export function GenerateImageScopeModal({
  categoryLabel,
  onChooseSelected,
  onChooseAll,
  onClose,
}: {
  categoryLabel: string;
  onChooseSelected: () => void;
  onChooseAll: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-1 text-sm">Gerar imagem do ranking</h3>
        <p className="text-xs text-slate-500 mb-4">
          Gerar a imagem da categoria selecionada (<b>{categoryLabel}</b>) ou de todas as categorias de uma vez?
        </p>
        <div className="flex flex-col gap-2">
          <button onClick={onChooseSelected} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">
            🖼️ Categoria selecionada
          </button>
          <button
            onClick={onChooseAll}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-950"
            style={{ background: '#ffb700' }}
          >
            🗂️ Todas as categorias
          </button>
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-slate-200">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
