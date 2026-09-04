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
    <p className="text-xs text-slate-500 py-2">
      Mostrando só o ranking e os totais, sem exibir cada venda individualmente — mais rápido para abrir e trocar de categoria. Ligue{' '}
      <button onClick={onEnable} className="text-cyan-400 underline underline-offset-2 hover:text-cyan-300">
        "Lista de vendas detalhada"
      </button>{' '}
      no calendário da tela Início para ver os itens vendidos.
    </p>
  );
}
