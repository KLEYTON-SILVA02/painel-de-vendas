import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { ReclassifyBar } from '../../components/admin/ReclassifyBar';
import type { CategoryKey } from '../../lib/business/classification';
import type { Collaborator, Sale } from '../../lib/business/types';
import { fmtDateBR, fmtMoney } from '../../lib/format';
import { useReclassifyProdutos } from '../../lib/mutations';
import { useCatalog, useSales } from '../../lib/queries';

export const TIPO_LABEL: Record<CategoryKey, string> = {
  DERM: 'Dermocosméticos',
  GEN: 'Genérico',
  MP: 'Marcas Exclusivas',
  MER: 'Mercadoria Geral',
};

/** Same resolution the ADM > Lista de Vendas screen uses: the sale's own
 * `vendedor` field can be garbage (a matrícula-derived string, depending on
 * which spreadsheet column it was imported from) — the collaborator's own
 * registered apelido/nome, joined by matrícula, is the reliable source. */
export function resolveVendorName(s: Sale, byMatricula: Map<string, Collaborator>): string {
  const c = byMatricula.get(s.matricula);
  if (c) return c.apelido || c.nome;
  return s.vendedor || s.matricula;
}

/** Collapsed-by-default accordion for picking a specific seller to filter
 * the sales detail table by — replaces the always-expanded avatar grid so
 * the screen stays compact until someone actually wants to drill in. */
export function MobileSellerAccordion({
  collaborators,
  selected,
  onSelect,
}: {
  collaborators: Collaborator[];
  selected: string | null;
  onSelect: (matricula: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedCollaborator = selected ? collaborators.find((c) => c.matricula === selected) : null;

  return (
    <div style={{ margin: '0 18px 8px' }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          fontSize: 10,
          fontWeight: 700,
        }}
      >
        <span>
          Detalhamento por Vendedor
          {selectedCollaborator && (
            <span style={{ fontWeight: 400, color: 'var(--mv2-texto-2)' }}> — {selectedCollaborator.apelido || selectedCollaborator.nome}</span>
          )}
        </span>
        <span style={{ fontSize: 9, color: 'var(--mv2-texto-2)' }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div className="mv2-seller-grid" style={{ marginTop: 8 }}>
          <button className={`mv2-seller mv2-all ${selected === null ? 'active' : ''}`} onClick={() => onSelect(null)}>
            <div className="mv2-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
              ✕
            </div>
            <span className="mv2-name">Todos</span>
          </button>
          {collaborators.map((c) => (
            <button key={c.id} className={`mv2-seller ${selected === c.matricula ? 'active' : ''}`} onClick={() => onSelect(c.matricula)}>
              {c.foto ? <img src={c.foto} alt="" className="mv2-avatar" /> : <div className="mv2-avatar" />}
              <span className="mv2-name">{c.apelido || c.nome}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Mobile counterpart to SalesListLockedNotice (src/components) — shown by
 * each category screen instead of <MobileSalesTable> + seller
 * accordion/pagination when the global "Lista de vendas detalhada" toggle is
 * off, so tab switches on mobile (where DOM cost is felt hardest) skip
 * mounting every individual sale row by default. */
export function MobileSalesListLockedNotice({ onEnable }: { onEnable: () => void }) {
  return (
    <p style={{ margin: '0 18px 16px', fontSize: 10, color: 'var(--mv2-texto-2)' }}>
      Mostrando só o ranking e os totais — mais rápido para abrir e trocar de aba. Ligue{' '}
      <button onClick={onEnable} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--mv2-ciano-claro)', textDecoration: 'underline', fontSize: 10 }}>
        "Lista de vendas detalhada"
      </button>{' '}
      no calendário da tela Início pra ver os itens vendidos.
    </p>
  );
}

/** Sales detail table shared by Dermo/Genéricos/Marcas Exclusivas/Mercadoria
 * Geral/Levmel/Chip — resolved vendor name (never a matrícula), no matrícula
 * column, and a subtotal row once a specific seller narrows the list. */
export function MobileSalesTable({
  title,
  sales,
  byMatricula,
  showValor,
  showComissao,
  comissaoPercentual,
  subtotalMode,
}: {
  title: string;
  sales: Sale[];
  byMatricula: Map<string, Collaborator>;
  showValor: boolean;
  showComissao?: boolean;
  comissaoPercentual?: number;
  /** Whether — and by which figure — to show a subtotal row: only meaningful
   * once a single seller is selected (the caller decides that upstream by
   * only passing 'valor'/'quantidade' in that case). */
  subtotalMode: 'valor' | 'quantidade' | 'none';
}) {
  const { profile } = useAuth();
  const { data: catalog } = useCatalog();
  const { data: allSales } = useSales();
  const reclassify = useReclassifyProdutos(profile?.store_id);
  const [reclassifyMode, setReclassifyMode] = useState(false);
  const [selectedProdutos, setSelectedProdutos] = useState<Set<string>>(new Set());
  const [bulkCat, setBulkCat] = useState<CategoryKey>('DERM');
  const [reclassifyFrom, setReclassifyFrom] = useState('');
  const [reclassifyTo, setReclassifyTo] = useState('');

  const totalValor = sales.reduce((a, s) => a + s.valor, 0);
  const totalQtd = sales.reduce((a, s) => a + s.qtd, 0);
  const totalComissao = comissaoPercentual ? (totalValor * comissaoPercentual) / 100 : 0;
  const colCount = 5 + (showValor ? 1 : 0) + (showComissao ? 1 : 0) + (reclassifyMode ? 1 : 0);

  function toggleProduto(produto: string) {
    setSelectedProdutos((prev) => {
      const next = new Set(prev);
      if (next.has(produto)) next.delete(produto);
      else next.add(produto);
      return next;
    });
  }
  async function applyReclassify() {
    if (!catalog || !allSales) return;
    await reclassify.mutateAsync({
      produtos: Array.from(selectedProdutos),
      categoria: bulkCat,
      catalog,
      sales: allSales,
      dateRange: { from: reclassifyFrom || undefined, to: reclassifyTo || undefined },
    });
    setSelectedProdutos(new Set());
    setReclassifyMode(false);
  }

  return (
    <div style={{ margin: '0 18px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700 }}>{title}</div>
        <ReclassifyBar
          active={reclassifyMode}
          onToggle={() => {
            setReclassifyMode((v) => !v);
            setSelectedProdutos(new Set());
          }}
          selectedCount={selectedProdutos.size}
          categoria={bulkCat}
          onCategoriaChange={setBulkCat}
          onApply={applyReclassify}
          applying={reclassify.isPending}
          dateFrom={reclassifyFrom}
          dateTo={reclassifyTo}
          onDateFromChange={setReclassifyFrom}
          onDateToChange={setReclassifyTo}
        />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="mv2-data-table">
          <thead>
            <tr>
              {reclassifyMode && <th></th>}
              <th>Data</th>
              <th>Nome do Colaborador</th>
              <th>Produto</th>
              <th>Qtd</th>
              {showValor && <th>Valor</th>}
              <th>Tipo</th>
              {showComissao && <th>Comissão</th>}
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 ? (
              <tr>
                <td colSpan={colCount} style={{ textAlign: 'center', color: 'var(--mv2-texto-2)', padding: 8 }}>
                  Nenhuma venda no período.
                </td>
              </tr>
            ) : (
              sales.map((s) => (
                <tr key={s.id}>
                  {reclassifyMode && (
                    <td>
                      <input type="checkbox" checked={selectedProdutos.has(s.produto)} onChange={() => toggleProduto(s.produto)} />
                    </td>
                  )}
                  <td>{fmtDateBR(s.dataISO)}</td>
                  <td>{resolveVendorName(s, byMatricula)}</td>
                  <td>{s.produto}</td>
                  <td>{s.qtd}</td>
                  {showValor && <td className="mv2-valor">{fmtMoney(s.valor)}</td>}
                  <td>{s.grupo ? TIPO_LABEL[s.grupo] : 'Não classificado'}</td>
                  {showComissao && <td className="mv2-valor">{fmtMoney((s.valor * (comissaoPercentual ?? 0)) / 100)}</td>}
                </tr>
              ))
            )}
            {subtotalMode !== 'none' && sales.length > 0 && (
              <tr style={{ fontWeight: 700, borderTop: '1px solid var(--mv2-ciano-claro)' }}>
                <td colSpan={reclassifyMode ? 4 : 3}>Subtotal</td>
                <td>{totalQtd}</td>
                {showValor && <td className="mv2-valor">{subtotalMode === 'valor' ? fmtMoney(totalValor) : ''}</td>}
                <td></td>
                {showComissao && <td className="mv2-valor">{subtotalMode === 'valor' ? fmtMoney(totalComissao) : ''}</td>}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
