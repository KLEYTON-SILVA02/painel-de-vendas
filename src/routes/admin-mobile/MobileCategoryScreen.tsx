import { useState } from 'react';
import type { CategoryKey } from '../../lib/business/classification';
import { getGoal, getSuperMeta } from '../../lib/business/goals';
import { computeSummary } from '../../lib/business/summary';
import { fmtDateBR, fmtMoney } from '../../lib/format';
import { useCollaborators, useGoals, useSales } from '../../lib/queries';
import { useDateRange } from '../DateRangeContext';
import { MobileDateFilter } from './MobileDateFilter';

export interface CommissionRule {
  /** Flat percentage, or 'escalonado' when the rate depends on a sales
   * bracket the reference doc names but never defines the thresholds for
   * (Marcas Exclusivas: "2,5%/5%/7% escalonado") — see FUNÇÕES PENDENTES. */
  kind: 'flat' | 'escalonado';
  flatPct?: number;
}

// Shared mobile v2 screen for Dermo / Marcas Exclusivas / Genéricos — the
// spec says all three reuse this exact structure, only the accent color and
// commission rule differ.
export function MobileCategoryScreen({
  catKey,
  title,
  titleClass,
  accent,
  commission,
}: {
  catKey: CategoryKey;
  title: string;
  titleClass: string;
  accent: string;
  commission: CommissionRule;
}) {
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: goals } = useGoals();
  const { dashFrom, dashTo } = useDateRange();
  const [selectedSeller, setSelectedSeller] = useState<string | null>(null);
  const [showCommission, setShowCommission] = useState(false);

  if (!collaborators || !sales || !goals) {
    return <div style={{ padding: 24, fontSize: 12, color: 'var(--mv2-texto-2)' }}>Carregando…</div>;
  }

  const mode = dashFrom === dashTo ? 'dia' : 'mes';
  const ranking = computeSummary(sales, collaborators, dashFrom, dashTo, catKey);
  const rankingList = ranking.filter((r) => r.valor > 0).sort((a, b) => b.valor - a.valor);
  const totalValor = ranking.reduce((a, r) => a + r.valor, 0);
  const totalItens = ranking.reduce((a, r) => a + r.itens, 0);

  const metaGeral = getGoal(goals[catKey], mode, sales, collaborators);
  const metaSuper = getSuperMeta(goals[catKey], mode, sales, collaborators);
  const faltaMeta = Math.max(0, metaGeral - totalValor);
  const faltaSuper = Math.max(0, metaSuper - totalValor);
  const pctMeta = metaGeral > 0 ? Math.min(999, (totalValor / metaGeral) * 100) : 0;
  const pctSuper = metaSuper > 0 ? Math.min(999, (totalValor / metaSuper) * 100) : 0;

  function commissionPct(): number {
    // "Escalonado" tiers aren't defined in the reference doc (which bracket
    // uses 2.5/5/7%) — using the middle tier as a visual placeholder.
    if (commission.kind === 'escalonado') return 5;
    return commission.flatPct ?? 1;
  }

  const categorySales = sales
    .filter((s) => {
      if (s.grupo !== catKey) return false;
      if (s.dataISO && (s.dataISO < dashFrom || s.dataISO > dashTo)) return false;
      if (selectedSeller && s.matricula !== selectedSeller) return false;
      return true;
    })
    .sort((a, b) => (b.dataISO || '').localeCompare(a.dataISO || ''))
    .slice(0, 150);

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

      <div className="mv2-seller-grid">
        <button className={`mv2-seller mv2-all ${selectedSeller === null ? 'active' : ''}`} onClick={() => setSelectedSeller(null)}>
          <div className="mv2-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
            ✕
          </div>
          <span className="mv2-name">Todos</span>
        </button>
        {collaborators.map((c) => (
          <button key={c.id} className={`mv2-seller ${selectedSeller === c.matricula ? 'active' : ''}`} onClick={() => setSelectedSeller(c.matricula)}>
            {c.foto ? <img src={c.foto} alt="" className="mv2-avatar" /> : <div className="mv2-avatar" />}
            <span className="mv2-name">{c.apelido || c.nome}</span>
          </button>
        ))}
      </div>

      <div className="mv2-commission-toggle">
        <span>
          <span className="mv2-rate">Comissão vigente: {commissionPct()}%</span>
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          Ver Comissões
          <input type="checkbox" checked={showCommission} onChange={(e) => setShowCommission(e.target.checked)} />
        </label>
      </div>

      <div style={{ margin: '0 18px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>Detalhamento por Vendedor</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="mv2-data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Matrícula</th>
                <th>Nome</th>
                <th>Produto</th>
                <th>Qtd</th>
                <th>Valor</th>
                {showCommission && <th>Comissão</th>}
              </tr>
            </thead>
            <tbody>
              {categorySales.length === 0 ? (
                <tr>
                  <td colSpan={showCommission ? 7 : 6} style={{ textAlign: 'center', color: 'var(--mv2-texto-2)', padding: 8 }}>
                    Nenhuma venda no período.
                  </td>
                </tr>
              ) : (
                categorySales.map((s) => (
                  <tr key={s.id}>
                    <td>{fmtDateBR(s.dataISO)}</td>
                    <td>{s.matricula}</td>
                    <td>{s.vendedor}</td>
                    <td>{s.produto}</td>
                    <td>{s.qtd}</td>
                    <td className="mv2-valor">{fmtMoney(s.valor)}</td>
                    {showCommission && <td className="mv2-valor">{fmtMoney((s.valor * commissionPct()) / 100)}</td>}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
