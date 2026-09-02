import { useMemo, useState } from 'react';
import { MobileRankingBoard } from '../../components/collaborator/MobileRankingBoard';
import { CAT_KEYS, type CategoryKey } from '../../lib/business/classification';
import { getGoal, getSuperMeta } from '../../lib/business/goals';
import { computeSummary } from '../../lib/business/summary';
import { fmtMoney } from '../../lib/format';
import { useCollaborators, useGoals, useSales } from '../../lib/queries';
import { MobileDateFilter } from '../admin-mobile/MobileDateFilter';
import { useDateRange } from '../DateRangeContext';

const CAT_LABEL: Record<CategoryKey, string> = {
  DERM: 'Dermocosméticos',
  GEN: 'Genérico',
  MP: 'Marcas Exclusivas',
  MER: 'Mercadoria Geral',
};
const CAT_COLOR: Record<CategoryKey, string> = {
  DERM: '#ff3df0',
  GEN: '#14ff00',
  MP: '#a82bff',
  MER: '#ff6a00',
};

export function CollaboratorRankingPage() {
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: goals } = useGoals();
  const { dashFrom, dashTo } = useDateRange();
  const [catKey, setCatKey] = useState<CategoryKey | 'ALL'>('ALL');

  // Safe stand-ins so the useMemo below always runs in the same order
  // (Rules of Hooks) whether or not every query has resolved yet — the
  // "Carregando…" guard comes after it, not before.
  const salesData = sales ?? [];
  const collaboratorsData = collaborators ?? [];
  // Mercadoria Geral is the store's grand total, not its own exclusive
  // bucket — filtering by it shows the same ranking as "Todas".
  const ranking = useMemo(
    () => computeSummary(salesData, collaboratorsData, dashFrom, dashTo, catKey === 'MER' ? 'ALL' : catKey),
    [salesData, collaboratorsData, dashFrom, dashTo, catKey],
  );

  if (!collaborators || !sales || !goals) {
    return <div style={{ padding: 24, fontSize: 12, color: 'var(--mv2-texto-2)' }}>Carregando…</div>;
  }

  const modoDia = dashFrom === dashTo;
  const mode = modoDia ? 'dia' : 'mes';
  const rankingList = ranking.filter((r) => r.valor > 0);
  const totalValor = ranking.reduce((a, r) => a + r.valor, 0);
  const totalItens = ranking.reduce((a, r) => a + r.itens, 0);

  const goal = catKey === 'ALL' ? undefined : goals[catKey];
  const metaGeral = catKey === 'ALL' ? 0 : getGoal(goal, mode, sales, collaborators);
  const metaSuper = catKey === 'ALL' ? 0 : getSuperMeta(goal, mode, sales, collaborators);
  const metaAlvo = metaSuper > metaGeral && totalValor >= metaGeral && metaGeral > 0 ? metaSuper : metaGeral;
  const pct = metaAlvo > 0 ? Math.min(999, (totalValor / metaAlvo) * 100) : null;

  return (
    <div>
      <div className="mv2-screen-title mv2-ranking">RANKING</div>

      <div className="mv2-chip-row">
        <button
          className={`mv2-chip ${catKey === 'ALL' ? 'active' : ''}`}
          style={{ ['--mv2-chip-color' as string]: '#00f0ff' }}
          onClick={() => setCatKey('ALL')}
        >
          Todas
        </button>
        {CAT_KEYS.map((k) => (
          <button
            key={k}
            className={`mv2-chip ${catKey === k ? 'active' : ''}`}
            style={{ ['--mv2-chip-color' as string]: CAT_COLOR[k] }}
            onClick={() => setCatKey(k)}
          >
            {CAT_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="mv2-metrics-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: '#00f0ff' }}>
          <div className="mv2-label">Total vendido</div>
          <div className="mv2-value">{fmtMoney(totalValor)}</div>
        </div>
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: '#a82bff' }}>
          <div className="mv2-label">Itens vendidos</div>
          <div className="mv2-value">{totalItens} un.</div>
        </div>
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: '#14ff00' }}>
          <div className="mv2-label">Atingimento</div>
          <div className="mv2-value">{pct !== null ? `${pct.toFixed(0)}%` : '—'}</div>
        </div>
      </div>

      <MobileDateFilter />

      <div className="mv2-card">
        <div className="mv2-card-title" style={{ color: '#00f0ff' }}>
          🏆 Ranking {catKey === 'ALL' ? 'Geral' : `— ${CAT_LABEL[catKey]}`}
        </div>
        <MobileRankingBoard ranking={rankingList} getValue={(r) => r.valor} formatValue={(v) => fmtMoney(v)} />
      </div>
    </div>
  );
}
