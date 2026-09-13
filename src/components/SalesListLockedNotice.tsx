/** Shown in place of a category screen's raw sales-list table when the
 * global "Lista de vendas detalhada" toggle (DateRangeContext.salesListEnabled,
 * flipped from SidebarCalendarCard below the date filter) is off — the same
 * opt-in gate ADM > Lista de Vendas already uses, extended here so every
 * category/Biosintética screen skips downloading and rendering every
 * individual sale by default too, keeping tab switches fast. The ranking and
 * category/collaborator totals above this notice are unaffected — those come
 * from the already-fetched `sales` this screen needs anyway, this only hides
 * the line-item table under them. */
export function SalesListLockedNotice({ onEnable }: { onEnable: () => void }) {
  return (
    <button
      onClick={onEnable}
      className="my-2 rounded-lg border border-cyan-500/50 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-400 transition-colors hover:bg-cyan-500/20 hover:text-cyan-300"
    >
      Lista de vendas detalhada
    </button>
  );
}
