import { DateRangeControls } from '../../components/DateRangeControls';
import { RankingColumnCard } from '../../components/ranking/RankingColumnCard';
import { CAT_KEYS, type CategoryKey } from '../../lib/business/classification';
import { effectiveMetaGeral, getSuperMeta } from '../../lib/business/goals';
import { computeColumnRanking } from '../../lib/business/ranking';
import { catTotals } from '../../lib/business/summary';
import { fmtMoney } from '../../lib/format';
import { useCollaborators, useGoals, useSales, useSpecialLists, useStoreSettings } from '../../lib/queries';
import { useDateRange } from '../DateRangeContext';

const MONEY_COL_META: Record<CategoryKey, { titulo: string; cor: string }> = {
  DERM: { titulo: 'Dermo', cor: '#ff3df0' },
  GEN: { titulo: 'Gen/Sim', cor: '#14ff00' },
  MP: { titulo: 'Marcas Excl.', cor: '#a82bff' },
  MER: { titulo: 'Merc. Geral', cor: '#ff6a00' },
};

const RANKING_COLS = [
  { key: 'DERM' as const, titulo: 'Dermo', cor: '#ff3df0' },
  { key: 'GEN' as const, titulo: 'Gen/Sim', cor: '#14ff00' },
  { key: 'MP' as const, titulo: 'Marcas Excl.', cor: '#a82bff' },
  { key: 'MER' as const, titulo: 'Merc. Geral', cor: '#ff6a00' },
  { key: 'LEVMEL' as const, titulo: 'Levmel', cor: '#ffb700' },
  { key: 'CHIP' as const, titulo: 'Chip', cor: '#00e5ff' },
];

export function RankingPage() {
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: goals } = useGoals();
  const { data: storeSettings } = useStoreSettings();
  const { data: specialLists } = useSpecialLists();
  const { dashFrom, dashTo, refYear, refMonth } = useDateRange();

  if (!collaborators || !sales || !goals || !storeSettings || !specialLists) {
    return <div className="text-sm text-slate-500 p-6">Carregando…</div>;
  }

  const modoDia = dashFrom === dashTo;
  const mode = modoDia ? 'dia' : 'mes';
  const metaGeral = effectiveMetaGeral(goals, mode, sales, collaborators, storeSettings.meta_geral_fallback);
  const metaSuper = getSuperMeta(goals.MER, mode, sales, collaborators);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-cyan-400 font-semibold text-sm">🏆 Ranking Geral</h3>
          <DateRangeControls />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {CAT_KEYS.map((k) => {
            const t = catTotals(sales, dashFrom, dashTo, k);
            const meta = MONEY_COL_META[k];
            return <MiniStat key={k} label={`Total ${meta.titulo}`} value={fmtMoney(t.valor)} color={meta.cor} />;
          })}
          <MiniStat label="Meta Geral" value={fmtMoney(metaGeral)} color="#ffd700" />
          <MiniStat label="Super Meta" value={fmtMoney(metaSuper)} color="#ff3df0" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {RANKING_COLS.map((c) => {
          const isUnit = c.key === 'LEVMEL' || c.key === 'CHIP';
          const ranking = computeColumnRanking(
            sales,
            collaborators,
            dashFrom,
            dashTo,
            c.key,
            isUnit,
            mode,
            refYear,
            refMonth,
            specialLists,
          );
          return <RankingColumnCard key={c.key} title={c.titulo} color={c.cor} ranking={ranking} isUnit={isUnit} />;
        })}
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-2.5">
      <div className="text-[10px] text-slate-400 truncate">{label}</div>
      <div className="text-xs font-mono font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
