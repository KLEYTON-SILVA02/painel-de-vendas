import { useMemo, useState } from 'react';
import { diasRestantesNoMes, getGoal, getSuperMeta, goalProration } from '../../lib/business/goals';
import { computeSummary } from '../../lib/business/summary';
import type { Collaborator } from '../../lib/business/types';
import { fmtMoney } from '../../lib/format';
import { useCollaborators, useGoals, useSales } from '../../lib/queries';
import { useDateRange } from '../DateRangeContext';
import { MobileDateFilter } from './MobileDateFilter';
import { MobileSalesListLockedNotice, MobileSalesTable, MobileSellerAccordion } from './MobileSellerDetail';

const ACCENT = '#f26122'; // laranja — mesma cor de mv2-cat-mercgeral

// Dedicated mv2 screen for Mercadoria Geral — previously this route fell
// back to the desktop CategoryPage (the only category that never got its
// own mobile screen), which is why its title bar, date filter and card
// grid all looked different from every other mobile category screen. This
// mirrors MobileCategoryScreen's structure, with the card layout the spec
// calls for here specifically: Total Vendido/Itens Vendidos, Falta p/
// Meta/Dias Restantes, Meta Geral/Super Meta — each of the last pair
// showing its own % opposite the value instead of separate "Atingimento"
// cards. Mercadoria Geral has no commission_rates support (DB check
// constraint limits that table to DERM/GEN/MP), so no commission bar here.
export function MobileMercadoriaGeralPage() {
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: goals } = useGoals();
  const { dashFrom, dashTo, modoGeral, salesListEnabled, toggleSalesListEnabled } = useDateRange();
  const [selectedSeller, setSelectedSeller] = useState<string | null>(null);
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

  // Mercadoria Geral is the store's grand total, not its own exclusive
  // bucket — this screen reflects every sale regardless of category, same
  // as the desktop CategoryPage and "Meta Geral" elsewhere in the app
  // (effectiveMetaGeral always pulls its target from goals.MER).
  const ranking = useMemo(
    () => computeSummary(salesData, collaboratorsData, dashFrom, dashTo, 'ALL'),
    [salesData, collaboratorsData, dashFrom, dashTo],
  );

  // A specific vendedor selected shows their full list — no cap. With
  // "Todos" selected (whole month), a flat slice(0, 150) used to silently
  // drop everything past the 150th row instead of paginating.
  const categorySalesAll = useMemo(
    () =>
      salesListEnabled
        ? salesData
            .filter((s) => {
              if (s.dataISO && (s.dataISO < dashFrom || s.dataISO > dashTo)) return false;
              if (selectedSeller && s.matricula !== selectedSeller) return false;
              return true;
            })
            .sort((a, b) => (b.dataISO || '').localeCompare(a.dataISO || ''))
        : [],
    [salesListEnabled, salesData, dashFrom, dashTo, selectedSeller],
  );

  if (!collaborators || !sales || !goals) {
    return <div style={{ padding: 24, fontSize: 12, color: 'var(--mv2-texto-2)' }}>Carregando…</div>;
  }

  const mode = dashFrom === dashTo ? 'dia' : 'mes';
  const proration = goalProration(dashFrom, dashTo, modoGeral);
  const rankingList = ranking.filter((r) => r.valor > 0).sort((a, b) => b.valor - a.valor);
  const totalValor = ranking.reduce((a, r) => a + r.valor, 0);
  const totalItens = ranking.reduce((a, r) => a + r.itens, 0);
  const dias = diasRestantesNoMes();

  const metaGeral = getGoal(goals.MER, mode, sales, collaborators, proration);
  const metaSuper = getSuperMeta(goals.MER, mode, sales, collaborators, proration);
  const faltaMeta = Math.max(0, metaGeral - totalValor);
  const pctMeta = metaGeral > 0 ? Math.min(999, (totalValor / metaGeral) * 100) : 0;
  const pctSuper = metaSuper > 0 ? Math.min(999, (totalValor / metaSuper) * 100) : 0;

  const VENDAS_PAGE_SIZE = 150;
  const vendasTotalPages = Math.max(1, Math.ceil(categorySalesAll.length / VENDAS_PAGE_SIZE));
  const vendasPageClamped = Math.min(vendasPage, vendasTotalPages - 1);
  const categorySales = selectedSeller
    ? categorySalesAll
    : categorySalesAll.slice(vendasPageClamped * VENDAS_PAGE_SIZE, (vendasPageClamped + 1) * VENDAS_PAGE_SIZE);

  return (
    <div>
      <div className="mv2-screen-title mv2-mercgeral">MERCADORIA GERAL</div>

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

      <div className="mv2-metrics-grid">
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: ACCENT }}>
          <div className="mv2-label">Falta p/ Meta</div>
          <div className="mv2-value">{fmtMoney(faltaMeta)}</div>
        </div>
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: '#698b46' }}>
          <div className="mv2-label">Dias Restantes</div>
          <div className="mv2-value">{dias} dia(s)</div>
        </div>
      </div>

      <div className="mv2-dual-goal-grid">
        <div className="mv2-goal-remaining-card" style={{ ['--mv2-card-color' as string]: '#fed400' }}>
          <div>
            <div className="mv2-label" style={{ fontSize: 8, color: 'var(--mv2-texto-2)', textTransform: 'uppercase' }}>
              Meta Geral
            </div>
            <div className="mv2-value">{fmtMoney(metaGeral)}</div>
          </div>
          <div className="mv2-pct">{pctMeta.toFixed(0)}%</div>
        </div>
        <div className="mv2-goal-remaining-card" style={{ ['--mv2-card-color' as string]: '#ff3df0' }}>
          <div>
            <div className="mv2-label" style={{ fontSize: 8, color: 'var(--mv2-texto-2)', textTransform: 'uppercase' }}>
              Super Meta
            </div>
            <div className="mv2-value">{fmtMoney(metaSuper)}</div>
          </div>
          <div className="mv2-pct">{pctSuper.toFixed(0)}%</div>
        </div>
      </div>

      <div className="mv2-ranking-list-card">
        <div style={{ fontSize: 10, fontWeight: 700, color: ACCENT, marginBottom: 4 }}>RANKING — MERCADORIA GERAL</div>
        {rankingList.length === 0 ? (
          <div style={{ fontSize: 10, color: 'var(--mv2-texto-2)', padding: '8px 0', textAlign: 'center' }}>Sem vendas no período.</div>
        ) : (
          rankingList.slice(0, 10).map((r, i) => (
            <div key={r.matricula} className="mv2-row">
              <span className="mv2-pos" style={{ color: ACCENT }}>
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

          <MobileSalesTable
            title="Lista de vendas — Mercadoria Geral"
            sales={categorySales}
            byMatricula={byMatricula}
            showValor
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
