import { useState } from 'react';
import { MobileDateFilterBar } from '../../components/collaborator/MobileDateFilterBar';
import { MobileRankingBoard } from '../../components/collaborator/MobileRankingBoard';
import { CAT_KEYS, type CategoryKey } from '../../lib/business/classification';
import { getGoal, getSuperMeta } from '../../lib/business/goals';
import { computeSummary } from '../../lib/business/summary';
import { fmtMoney } from '../../lib/format';
import { useCollaborators, useGoals, useSales } from '../../lib/queries';
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

  if (!collaborators || !sales || !goals) {
    return <div className="text-sm text-slate-500 p-6 text-center">Carregando…</div>;
  }

  const modoDia = dashFrom === dashTo;
  const mode = modoDia ? 'dia' : 'mes';
  const ranking = computeSummary(sales, collaborators, dashFrom, dashTo, catKey);
  const rankingList = ranking.filter((r) => r.valor > 0);
  const totalValor = ranking.reduce((a, r) => a + r.valor, 0);
  const totalItens = ranking.reduce((a, r) => a + r.itens, 0);

  const goal = catKey === 'ALL' ? undefined : goals[catKey];
  const metaGeral = catKey === 'ALL' ? 0 : getGoal(goal, mode, sales, collaborators);
  const metaSuper = catKey === 'ALL' ? 0 : getSuperMeta(goal, mode, sales, collaborators);
  const metaAlvo = metaSuper > metaGeral && totalValor >= metaGeral && metaGeral > 0 ? metaSuper : metaGeral;
  const pct = metaAlvo > 0 ? Math.min(999, (totalValor / metaAlvo) * 100) : null;

  return (
    <div className="flex flex-col gap-3">
      <MobileDateFilterBar />

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <CatChip active={catKey === 'ALL'} color="#00f0ff" onClick={() => setCatKey('ALL')}>
          Todas
        </CatChip>
        {CAT_KEYS.map((k) => (
          <CatChip key={k} active={catKey === k} color={CAT_COLOR[k]} onClick={() => setCatKey(k)}>
            {CAT_LABEL[k]}
          </CatChip>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MetricCard label="Total vendido" value={fmtMoney(totalValor)} color="#00f0ff" />
        <MetricCard label="Itens vendidos" value={`${totalItens} un.`} color="#a82bff" />
        <MetricCard label="Atingimento" value={pct !== null ? `${pct.toFixed(0)}%` : '—'} color="#14ff00" />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-cyan-400 font-semibold text-sm mb-3">
          🏆 Ranking {catKey === 'ALL' ? 'Geral' : `— ${CAT_LABEL[catKey]}`}
        </h3>
        <MobileRankingBoard ranking={rankingList} getValue={(r) => r.valor} formatValue={(v) => fmtMoney(v)} />
      </div>
    </div>
  );
}

function CatChip({ active, color, onClick, children }: { active: boolean; color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide border"
      style={{ borderColor: color, color: active ? '#04101c' : color, background: active ? color : 'transparent' }}
    >
      {children}
    </button>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-sm font-mono font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
