import { useMemo, useState } from 'react';
import type { CategoryKey } from '../../lib/business/classification';
import { getGoal, getSuperMeta, goalProration } from '../../lib/business/goals';
import { computeSummary } from '../../lib/business/summary';
import type { Collaborator } from '../../lib/business/types';
import { fmtMoney } from '../../lib/format';
import { useCollaborators, useCommissionRates, useGoals, useSales } from '../../lib/queries';
import { useDateRange } from '../DateRangeContext';
import { MobileDateFilter } from './MobileDateFilter';
import { MobileSalesListLockedNotice, MobileSalesTable, MobileSellerAccordion } from './MobileSellerDetail';

// Shared mobile v2 screen for Dermo / Marcas Exclusivas / Genéricos — the
// spec says all three reuse this exact structure, only the accent color
// differs. Commission % comes from ADM > Funções > Metas > Comissões
// (commission_rates table) — same source as the desktop CategoryPage.
export function MobileCategoryScreen({
  catKey,
  title,
  titleClass,
  accent,
}: {
  catKey: CategoryKey;
  title: string;
  titleClass: string;
  accent: string;
}) {
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: goals } = useGoals();
  const { data: commissionRates } = useCommissionRates();
  const { dashFrom, dashTo, modoGeral, salesListEnabled, toggleSalesListEnabled } = useDateRange();
  const [selectedSeller, setSelectedSeller] = useState<string | null>(null);
  const [activeCommissionSlot, setActiveCommissionSlot] = useState<number | null>(null);
  const [vendasPage, setVendasPage] = useState(0);

  const byMatricula = useMemo(() => {
    const map = new Map<string, Collaborator>();
    (collaborators ?? []).forEach((c) => map.set(c.matricula, c));
    return map;
  }, [collaborators]);

  // Safe stand-ins so the useMemo calls below always run in the same order
  // (Rules of Hooks) whether or not every query has resolved yet — the
  // "Carregando…" guard comes after them, not before.
  const salesData = sales ?? [];
  const collaboratorsData = collaborators ?? [];

  const ranking = useMemo(
    () => computeSummary(salesData, collaboratorsData, dashFrom, dashTo, catKey),
    [salesData, collaboratorsData, dashFrom, dashTo, catKey],
  );

  // A specific vendedor selected shows their full list — no cap, it's
  // naturally bounded to one person's sales. With "Todos" selected (whole
  // month, potentially hundreds of rows across every vendedor), a flat
  // slice(0, 150) used to silently drop everything past the 150th row
  // instead of paginating — this now pages through the full set instead.
  const categorySalesAll = useMemo(
    () =>
      salesListEnabled
        ? salesData
            .filter((s) => {
              if (s.grupo !== catKey) return false;
              if (s.dataISO && (s.dataISO < dashFrom || s.dataISO > dashTo)) return false;
              if (selectedSeller && s.matricula !== selectedSeller) return false;
              return true;
            })
            .sort((a, b) => (b.dataISO || '').localeCompare(a.dataISO || ''))
        : [],
    [salesListEnabled, salesData, catKey, dashFrom, dashTo, selectedSeller],
  );

  if (!collaborators || !sales || !goals || !commissionRates) {
    return <div style={{ padding: 24, fontSize: 12, color: 'var(--mv2-texto-2)' }}>Carregando…</div>;
  }

  const mode = dashFrom === dashTo ? 'dia' : 'mes';
  const proration = goalProration(dashFrom, dashTo, modoGeral);
  const rankingList = ranking.filter((r) => r.valor > 0).sort((a, b) => b.valor - a.valor);
  const totalValor = ranking.reduce((a, r) => a + r.valor, 0);
  const totalItens = ranking.reduce((a, r) => a + r.itens, 0);

  const metaGeral = getGoal(goals[catKey], mode, sales, collaborators, proration);
  const metaSuper = getSuperMeta(goals[catKey], mode, sales, collaborators, proration);
  const faltaMeta = Math.max(0, metaGeral - totalValor);
  const faltaSuper = Math.max(0, metaSuper - totalValor);
  const pctMeta = metaGeral > 0 ? Math.min(999, (totalValor / metaGeral) * 100) : 0;
  const pctSuper = metaSuper > 0 ? Math.min(999, (totalValor / metaSuper) * 100) : 0;

  // Commission only ever applies to DERM/GEN/MP (see commission_rates'
  // check constraint) and only shows once a specific seller is selected —
  // with "Todos" selected, sales keep showing their original valor. Each
  // admin-enabled rate gets its own liga/desliga button. Only one can be
  // active at a time — the buttons behave as a single-select group,
  // clicking the active one turns it back off. Marcas Exclusivas always
  // shows its 3 slots fixed (even one never configured, at 0%) instead of
  // only the ones marked "ativo" in Metas > Comissões — same as desktop.
  const availableRates =
    catKey === 'MP'
      ? [1, 2, 3].map((slot) => commissionRates.MP.find((r) => r.slot === slot) ?? { categoria: 'MP' as const, slot, percentual: 0, ativo: false })
      : catKey === 'DERM' || catKey === 'GEN'
        ? commissionRates[catKey].filter((r) => r.ativo)
        : [];
  const activeRate = activeCommissionSlot !== null ? availableRates.find((r) => r.slot === activeCommissionSlot) : undefined;
  const showCommission = selectedSeller !== null && !!activeRate;

  const VENDAS_PAGE_SIZE = 150;
  const vendasTotalPages = Math.max(1, Math.ceil(categorySalesAll.length / VENDAS_PAGE_SIZE));
  const vendasPageClamped = Math.min(vendasPage, vendasTotalPages - 1);
  const categorySales = selectedSeller
    ? categorySalesAll
    : categorySalesAll.slice(vendasPageClamped * VENDAS_PAGE_SIZE, (vendasPageClamped + 1) * VENDAS_PAGE_SIZE);

  return (
    <div>
      <div className={`mv2-screen-title ${titleClass}`}>{title.toUpperCase()}</div>

      <MobileDateFilter />

      <div className="mv2-metrics-grid">
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: '#00b6da' }}>
          <div className="mv2-label">Total Vendido</div>
          <div className="mv2-value">{fmtMoney(totalValor)}</div>
        </div>
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: '#5c3795' }}>
          <div className="mv2-label">Itens Vendidos</div>
          <div className="mv2-value">{totalItens} un.</div>
        </div>
      </div>

      <div className="mv2-dual-goal-grid">
        <div className="mv2-goal-remaining-card" style={{ ['--mv2-card-color' as string]: accent }}>
          <div>
            <div className="mv2-label" style={{ fontSize: 8, color: 'var(--mv2-texto-2)', textTransform: 'uppercase' }}>
              Falta p/ Meta
            </div>
            <div className="mv2-value">{fmtMoney(faltaMeta)}</div>
          </div>
          <div className="mv2-pct">{pctMeta.toFixed(0)}%</div>
        </div>
        <div className="mv2-goal-remaining-card" style={{ ['--mv2-card-color' as string]: '#fed400' }}>
          <div>
            <div className="mv2-label" style={{ fontSize: 8, color: 'var(--mv2-texto-2)', textTransform: 'uppercase' }}>
              Falta p/ Super Meta
            </div>
            <div className="mv2-value">{fmtMoney(faltaSuper)}</div>
          </div>
          <div className="mv2-pct">{pctSuper.toFixed(0)}%</div>
        </div>
      </div>

      <div className="mv2-ranking-list-card">
        <div style={{ fontSize: 10, fontWeight: 700, color: accent, marginBottom: 4 }}>RANKING — {title.toUpperCase()}</div>
        {rankingList.length === 0 ? (
          <div style={{ fontSize: 10, color: 'var(--mv2-texto-2)', padding: '8px 0', textAlign: 'center' }}>Sem vendas no período.</div>
        ) : (
          rankingList.slice(0, 10).map((r, i) => (
            <div key={r.matricula} className="mv2-row">
              <span className="mv2-pos" style={{ color: accent }}>
                {i + 1}
              </span>
              {r.foto ? <img src={r.foto} alt="" className="mv2-avatar" /> : <div className="mv2-avatar" />}
              <span className="mv2-name">{r.apelido || r.nome}</span>
              <span className="mv2-qty">{fmtMoney(r.valor)}</span>
            </div>
          ))
        )}
      </div>

      {!salesListEnabled ? (
        <MobileSalesListLockedNotice onEnable={toggleSalesListEnabled} />
      ) : (
        <>
          <MobileSellerAccordion
            collaborators={collaborators}
            selected={selectedSeller}
            onSelect={(m) => {
              setSelectedSeller(m);
              setVendasPage(0);
            }}
          />

          {availableRates.length > 0 && (
            <div className="mv2-commission-toggle" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {availableRates.map((r) => (
                  <button
                    key={r.slot}
                    onClick={() => setActiveCommissionSlot((cur) => (cur === r.slot ? null : r.slot))}
                    style={{
                      border: `1px solid ${accent}`,
                      background: activeCommissionSlot === r.slot ? accent : 'transparent',
                      color: activeCommissionSlot === r.slot ? '#080a08' : accent,
                      borderRadius: 999,
                      padding: '4px 10px',
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {availableRates.length > 1 ? `Comissão ${r.slot} (${r.percentual}%)` : `Comissão (${r.percentual}%)`}
                  </button>
                ))}
              </div>
              {activeRate && (
                <span style={{ fontSize: 8, color: 'var(--mv2-texto-2)' }}>
                  {selectedSeller ? 'Exibindo comissão do vendedor selecionado' : 'Selecione um vendedor pra ver a comissão'}
                </span>
              )}
            </div>
          )}

          <MobileSalesTable
            title={`Lista de vendas — ${title}`}
            sales={categorySales}
            byMatricula={byMatricula}
            showValor
            showComissao={showCommission}
            comissaoPercentual={activeRate?.percentual}
            subtotalMode={selectedSeller ? 'valor' : 'none'}
          />
          {!selectedSeller && vendasTotalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, margin: '0 18px 16px' }}>
              <button
                disabled={vendasPageClamped === 0}
                onClick={() => setVendasPage(Math.max(0, vendasPageClamped - 1))}
                className="mv2-btn-outline"
                style={{ opacity: vendasPageClamped === 0 ? 0.4 : 1 }}
              >
                ← Anterior
              </button>
              <span style={{ fontSize: 10, color: 'var(--mv2-texto-2)' }}>
                Página {vendasPageClamped + 1} de {vendasTotalPages}
              </span>
              <button
                disabled={vendasPageClamped >= vendasTotalPages - 1}
                onClick={() => setVendasPage(Math.min(vendasTotalPages - 1, vendasPageClamped + 1))}
                className="mv2-btn-outline"
                style={{ opacity: vendasPageClamped >= vendasTotalPages - 1 ? 0.4 : 1 }}
              >
                Próxima →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
