import { useMemo, useState } from 'react';
import { MobileRankingBoard } from '../../components/collaborator/MobileRankingBoard';
import type { CategoryKey } from '../../lib/business/classification';
import { getGoal, getSuperMeta, goalProration } from '../../lib/business/goals';
import { computeSummary } from '../../lib/business/summary';
import { fmtMoney } from '../../lib/format';
import { useCollaborators, useGoals, useSales, useSpecialLists } from '../../lib/queries';
import { MobileDateFilter } from '../admin-mobile/MobileDateFilter';
import { useDateRange } from '../DateRangeContext';

type RankCatKey = CategoryKey | 'ALL' | 'LEVMEL' | 'CHIP';

// Abreviado para caber numa linha só sem scroll lateral (ver .mv2-chip-row).
const CAT_LABEL: Record<RankCatKey, string> = {
  ALL: 'Todas',
  DERM: 'Dermo',
  GEN: 'Gen',
  MP: 'MP',
  MER: 'Merc',
  LEVMEL: 'Mel',
  CHIP: 'Chip',
};
const CAT_COLOR: Record<RankCatKey, string> = {
  ALL: '#00f0ff',
  DERM: '#ff3df0',
  GEN: '#14ff00',
  MP: '#a82bff',
  MER: '#ff6a00',
  LEVMEL: '#ffb700',
  CHIP: '#00e5ff',
};
const RANK_CHIPS: RankCatKey[] = ['ALL', 'DERM', 'GEN', 'MP', 'MER', 'LEVMEL', 'CHIP'];

export function CollaboratorRankingPage() {
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: goals } = useGoals();
  const { data: specialLists } = useSpecialLists();
  const { dashFrom, dashTo, modoGeral } = useDateRange();
  const [catKey, setCatKey] = useState<RankCatKey>('ALL');

  // Safe stand-ins so the useMemo below always runs in the same order
  // (Rules of Hooks) whether or not every query has resolved yet — the
  // "Carregando…" guard comes after it, not before.
  const salesData = sales ?? [];
  const collaboratorsData = collaborators ?? [];
  const isUnit = catKey === 'LEVMEL' || catKey === 'CHIP';
  // Mercadoria Geral is the store's grand total, not its own exclusive
  // bucket — filtering by it shows the same ranking as "Todas".
  const ranking = useMemo(
    () => computeSummary(salesData, collaboratorsData, dashFrom, dashTo, catKey === 'MER' ? 'ALL' : catKey, specialLists),
    [salesData, collaboratorsData, dashFrom, dashTo, catKey, specialLists],
  );

  if (!collaborators || !sales || !goals || !specialLists) {
    return <div style={{ padding: 24, fontSize: 12, color: 'var(--mv2-texto-2)' }}>Carregando…</div>;
  }

  const modoDia = dashFrom === dashTo;
  const mode = modoDia ? 'dia' : 'mes';
  const proration = goalProration(dashFrom, dashTo, modoGeral);
  const rankingList = ranking.filter((r) => (isUnit ? r.itens > 0 : r.valor > 0));
  const totalValor = ranking.reduce((a, r) => a + r.valor, 0);
  const totalItens = ranking.reduce((a, r) => a + r.itens, 0);
  const totalAlvo = isUnit ? totalItens : totalValor;

  const goal = catKey === 'ALL' ? undefined : goals[catKey];
  const metaGeral = catKey === 'ALL' ? 0 : getGoal(goal, mode, sales, collaborators, proration);
  const metaSuper = catKey === 'ALL' ? 0 : getSuperMeta(goal, mode, sales, collaborators, proration);
  const metaAlvo = metaSuper > metaGeral && totalAlvo >= metaGeral && metaGeral > 0 ? metaSuper : metaGeral;
  const pct = metaAlvo > 0 ? Math.min(999, (totalAlvo / metaAlvo) * 100) : null;

  return (
    <div>
      <div className="mv2-screen-title mv2-ranking">RANKING</div>

      <div className="mv2-chip-row">
        {RANK_CHIPS.map((k) => (
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
        {isUnit ? (
          <MobileRankingBoard ranking={rankingList} getValue={(r) => r.itens} formatValue={(v) => `${v} un.`} />
        ) : (
          <MobileRankingBoard ranking={rankingList} getValue={(r) => r.valor} formatValue={(v) => fmtMoney(v)} />
        )}
      </div>
    </div>
  );
}
