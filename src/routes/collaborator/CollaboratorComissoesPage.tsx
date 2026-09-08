import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useCategoryLabelMap } from '../../lib/business/categoryLabels';
import type { CategoryKey } from '../../lib/business/classification';
import { catTotals } from '../../lib/business/summary';
import type { Sale } from '../../lib/business/types';
import { fmtDateShortBR, fmtMoney } from '../../lib/format';
import { useCollaborators, useCommissionRates, useSales } from '../../lib/queries';
import { MobileDateFilter } from '../admin-mobile/MobileDateFilter';
import { MobileSalesListLockedNotice } from '../admin-mobile/MobileSellerDetail';
import { useDateRange } from '../DateRangeContext';

const CATEGORIES: { key: CategoryKey; color: string }[] = [
  { key: 'MER', color: '#ff6a00' },
  { key: 'DERM', color: '#ff3df0' },
  { key: 'GEN', color: '#14ff00' },
  { key: 'MP', color: '#a82bff' },
];

// Mobile-only screen for the collaborator: per-category (Mercadoria Geral/
// Dermo/Genéricos/Marcas Exclusivas) valor vendido + itens vendidos +
// comissão do mês, each with its own collapsed-by-default sales-list bar —
// this is now where a collaborator sees their own detailed sales, replacing
// the "Minhas vendas" table that used to live on the Metas/Vendas screen.
// Same salesListEnabled lock as every other sales-detail screen in the app.
export function CollaboratorComissoesPage() {
  const categoryLabels = useCategoryLabelMap();
  const { profile } = useAuth();
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: commissionRates } = useCommissionRates();
  const { dashFrom, dashTo, salesListEnabled, toggleSalesListEnabled } = useDateRange();
  const [openCat, setOpenCat] = useState<Record<CategoryKey, boolean>>({ MER: false, DERM: false, GEN: false, MP: false });

  const me = collaborators?.find((c) => c.id === profile?.collaborator_id);
  const salesData = sales ?? [];
  const meMatricula = me?.matricula;
  const mySales = useMemo(() => salesData.filter((s) => !meMatricula || s.matricula === meMatricula), [salesData, meMatricula]);

  if (!collaborators || !sales || !commissionRates) {
    return <div style={{ padding: 24, fontSize: 12, color: 'var(--mv2-texto-2)' }}>Carregando…</div>;
  }

  function toggleCat(k: CategoryKey) {
    setOpenCat((prev) => ({ ...prev, [k]: !prev[k] }));
  }

  return (
    <div>
      <div className="mv2-screen-title" style={{ ['--mv2-accent' as string]: '#a855f7' }}>
        COMISSÕES
      </div>

      <MobileDateFilter />

      {CATEGORIES.map(({ key, color }) => {
        const label = categoryLabels[key];
        // Mercadoria Geral is my grand total (every sale), not its own
        // exclusive grupo — same convention as everywhere else it appears.
        const t =
          key === 'MER'
            ? mySales
                .filter((s) => !s.dataISO || (s.dataISO >= dashFrom && s.dataISO <= dashTo))
                .reduce((acc, s) => ({ valor: acc.valor + (Number(s.valor) || 0), qtd: acc.qtd + (Number(s.qtd) || 0) }), { valor: 0, qtd: 0 })
            : catTotals(mySales, dashFrom, dashTo, key);
        // Marcas Exclusivas tem 3 comissões independentes (slots 1-3) —
        // cada uma vira seu próprio card, em vez de somadas num só valor.
        const rates = (commissionRates[key] ?? []).filter((r) => r.ativo).sort((a, b) => a.slot - b.slot);
        const catSales = mySales
          .filter((s) => !s.dataISO || (s.dataISO >= dashFrom && s.dataISO <= dashTo))
          .filter((s) => key === 'MER' || s.grupo === key)
          .sort((a, b) => (b.dataISO || '').localeCompare(a.dataISO || ''));

        return (
          <div key={key} className="mv2-card" style={{ marginBottom: 10 }}>
            <div className="mv2-card-title" style={{ color }}>
              {label}
            </div>
            <div className="mv2-metrics-grid" style={{ margin: '0 0 8px' }}>
              <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: color }}>
                <div className="mv2-label">Total vendido</div>
                <div className="mv2-value">{fmtMoney(t.valor)}</div>
              </div>
              <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: color }}>
                <div className="mv2-label">Itens vendidos</div>
                <div className="mv2-value">{t.qtd} un.</div>
              </div>
            </div>
            {key === 'MP' ? (
              <div className="mv2-metrics-grid" style={{ margin: '0 0 8px', gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {[1, 2, 3].map((slot) => {
                  const rate = rates.find((r) => r.slot === slot);
                  const valor = rate ? (t.valor * rate.percentual) / 100 : 0;
                  return (
                    <div key={slot} className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: '#ffd700' }}>
                      <div className="mv2-label">Comissão {slot}</div>
                      <div className="mv2-value">{fmtMoney(valor)}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: '#ffd700', marginBottom: 8 }}>
                <div className="mv2-label">Comissão do mês</div>
                <div className="mv2-value">{fmtMoney(rates.reduce((a, r) => a + (t.valor * r.percentual) / 100, 0))}</div>
              </div>
            )}

            {!salesListEnabled ? (
              <MobileSalesListLockedNotice onEnable={toggleSalesListEnabled} />
            ) : (
              <>
                <button onClick={() => toggleCat(key)} className="mv2-btn-outline" style={{ width: '100%', fontSize: 11 }}>
                  {openCat[key] ? '▲ Recolher lista de vendas' : `▼ Ver lista de vendas (${catSales.length})`}
                </button>
                {openCat[key] && <CategorySalesTable sales={catSales} />}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CategorySalesTable({ sales }: { sales: Sale[] }) {
  if (sales.length === 0) {
    return <div style={{ fontSize: 10, color: 'var(--mv2-texto-2)', padding: '8px 0', textAlign: 'center' }}>Nenhuma venda no período.</div>;
  }
  return (
    <div style={{ overflowX: 'auto', marginTop: 8 }}>
      <table className="mv2-data-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Produto</th>
            <th>Qtd</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((s) => (
            <tr key={s.id}>
              <td>{fmtDateShortBR(s.dataISO)}</td>
              <td>{s.produto}</td>
              <td>{s.qtd}</td>
              <td className="mv2-valor">{fmtMoney(s.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
