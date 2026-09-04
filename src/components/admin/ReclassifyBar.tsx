import { CAT_KEYS, type CategoryKey } from '../../lib/business/classification';

const CAT_LABEL: Record<CategoryKey, string> = {
  DERM: 'Dermocosméticos',
  GEN: 'Genérico',
  MP: 'Marcas Exclusivas',
  MER: 'Mercadoria Geral',
};

/** Toggle + toolbar shared by every "lista de vendas" screen that lets an
 * admin select one or more distinct products (by name, across the whole
 * table) and reclassify all of them — plus every already-imported sale
 * that matches — into a new category in one action. Selection state and
 * the checkbox column live in the caller, since each screen's table shape
 * differs; this component only renders the on/off toggle and, once
 * enabled, the category picker and apply button. */
export function ReclassifyBar({
  active,
  onToggle,
  selectedCount,
  categoria,
  onCategoriaChange,
  onApply,
  applying,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
}: {
  active: boolean;
  onToggle: () => void;
  selectedCount: number;
  categoria: CategoryKey;
  onCategoriaChange: (c: CategoryKey) => void;
  onApply: () => void;
  applying: boolean;
  /** Optional — when the caller wires these, the bar shows a "De/Até"
   * pair to scope the retroactive sales update to a date range instead
   * of the product's entire history. Left blank (the default), the
   * update still applies store-wide, same as before this existed. */
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange?: (v: string) => void;
  onDateToChange?: (v: string) => void;
}) {
  const hasDateRange = onDateFromChange !== undefined && onDateToChange !== undefined;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={onToggle}
        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
          active ? 'bg-amber-500 text-slate-950' : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
        }`}
      >
        🏷️ Reclassificar produtos{active ? ' (ativo)' : ''}
      </button>
      {active && (
        <>
          <span className="text-xs text-slate-500">{selectedCount} produto(s) selecionado(s)</span>
          <select value={categoria} onChange={(e) => onCategoriaChange(e.target.value as CategoryKey)} className="input !w-auto">
            {CAT_KEYS.map((k) => (
              <option key={k} value={k}>
                {CAT_LABEL[k]}
              </option>
            ))}
          </select>
          {hasDateRange && (
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              retroativo em:
              <input type="date" value={dateFrom ?? ''} onChange={(e) => onDateFromChange!(e.target.value)} className="input !w-auto !py-1" />
              até
              <input type="date" value={dateTo ?? ''} onChange={(e) => onDateToChange!(e.target.value)} className="input !w-auto !py-1" />
              <span title="Deixe em branco pra aplicar em todo o histórico do produto.">(vazio = tudo)</span>
            </span>
          )}
          <button
            type="button"
            onClick={onApply}
            disabled={selectedCount === 0 || applying}
            className="rounded-md bg-cyan-500 text-slate-950 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {applying ? 'Aplicando…' : 'Aplicar aos selecionados'}
          </button>
        </>
      )}
    </div>
  );
}
