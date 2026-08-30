import { CAT_KEYS, type CategoryKey } from '../../lib/business/classification';
import { effectiveMetaGeral, getGoal, getSuperMeta } from '../../lib/business/goals';
import { catTotals, computeSummary } from '../../lib/business/summary';
import { monthFirstISO, monthLastISO } from '../../lib/dateRange';
import { fmtMoney, monthName } from '../../lib/format';
import { useCollaborators, useDynamics, useGoals, useSales, useSpecialLists, useStoreSettings } from '../../lib/queries';
import { useDateRange } from '../DateRangeContext';
import { GoalGauge } from './GoalGauge';
import { MobileDateFilter } from './MobileDateFilter';

const CAT_LABEL: Record<CategoryKey, string> = { DERM: 'Dermocosméticos', GEN: 'Genéricos', MP: 'Marcas Excl.', MER: 'Merc. Geral' };
const CAT_COLOR: Record<CategoryKey, string> = { DERM: '#b84c9c', GEN: '#698b46', MP: '#813c97', MER: '#f26122' };

export function MobileInicioPage() {
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: goals } = useGoals();
  const { data: storeSettings } = useStoreSettings();
  const { data: specialLists } = useSpecialLists();
  const { data: dynamics } = useDynamics();
  const { dashFrom, dashTo, refYear, refMonth } = useDateRange();

  if (!collaborators || !sales || !goals || !storeSettings || !specialLists || !dynamics) {
    return <div style={{ padding: 24, fontSize: 12, color: 'var(--mv2-texto-2)' }}>Carregando…</div>;
  }

  const modoDia = dashFrom === dashTo;
  const mode = modoDia ? 'dia' : 'mes';

  const ranking = computeSummary(sales, collaborators, dashFrom, dashTo, undefined, specialLists);
  const totalValor = ranking.reduce((a, r) => a + r.valor, 0);
  const totalItens = ranking.reduce((a, r) => a + r.itens, 0);
  const rankingList = ranking.filter((r) => r.valor > 0).slice(0, 10);

  const metaGeral = effectiveMetaGeral(goals, mode, sales, collaborators, storeSettings.meta_geral_fallback);
  const metaSuper = getSuperMeta(goals.MER, mode, sales, collaborators);
  const atingiuMeta = metaGeral > 0 && totalValor >= metaGeral;
  const saldo = totalValor - metaGeral;
  const pct = metaGeral > 0 ? Math.min(999, (totalValor / metaGeral) * 100) : 0;
  let faltaLabel = 'Falta p/ Meta';
  let faltaValor = Math.max(0, metaGeral - totalValor);
  if (atingiuMeta && metaSuper > metaGeral) {
    faltaLabel = 'Falta p/ Super Meta';
    faltaValor = Math.max(0, metaSuper - totalValor);
  }

  const monthFirst = monthFirstISO(refYear, refMonth);
  const monthLast = monthLastISO(refYear, refMonth);
  const monthRanking = computeSummary(sales, collaborators, monthFirst, monthLast);
  const campeaoSource = modoDia ? ranking : monthRanking;
  const campeao = campeaoSource.length && campeaoSource[0].valor > 0 ? campeaoSource[0] : null;
  const campeaoLabel = modoDia ? `Campeão do dia` : `Campeão — ${monthName(refMonth)}/${refYear}`;

  return (
    <div>
      <div className="mv2-sales-summary">
        <div>
          <div className="mv2-label">Venda total do período</div>
          <div className="mv2-value">{fmtMoney(totalValor)}</div>
        </div>
        <div className="mv2-target">
          <div className="mv2-label">Atingimento</div>
          <div className="mv2-value">{pct.toFixed(0)}%</div>
        </div>
      </div>

      <div className="mv2-metrics-grid">
        <div className="mv2-metric-card mv2-meta">
          <div className="mv2-label">Meta Geral</div>
          <div className="mv2-value">{fmtMoney(metaGeral)}</div>
        </div>
        <div className="mv2-metric-card mv2-falta">
          <div className="mv2-label">{faltaLabel}</div>
          <div className="mv2-value">{fmtMoney(faltaValor)}</div>
        </div>
        <div className="mv2-metric-card mv2-saldo">
          <div className="mv2-label">Saldo</div>
          <div className="mv2-value">
            {saldo >= 0 ? '' : '-'}
            {fmtMoney(Math.abs(saldo))}
          </div>
        </div>
        <div className="mv2-metric-card mv2-itens">
          <div className="mv2-label">Itens vendidos</div>
          <div className="mv2-value">{totalItens} un.</div>
        </div>
      </div>

      <MobileDateFilter />

      {campeao && (
        <div className="mv2-champion-card">
          {campeao.foto ? (
            <img src={campeao.foto} alt="" className="mv2-avatar" />
          ) : (
            <div className="mv2-avatar" />
          )}
          <div className="mv2-info">
            <div className="mv2-badge">👑 {campeaoLabel}</div>
            <div className="mv2-name">{campeao.apelido || campeao.nome}</div>
          </div>
          {/* Star count: criteria for how many stars a champion earns isn't
             specified in the reference doc — see FUNÇÕES PENDENTES. */}
          <div className="mv2-stars">★★★★★</div>
        </div>
      )}

      <div className="mv2-ranking-track">
        {rankingList.map((r, i) => (
          <div key={r.matricula} className={`mv2-ranking-col ${i === 0 ? 'mv2-first' : i === 1 ? 'mv2-second' : i === 2 ? 'mv2-third' : ''}`}>
            {r.foto ? <img src={r.foto} alt="" className="mv2-avatar" /> : <div className="mv2-avatar" />}
            <div className="mv2-position">{i + 1}</div>
            <div className="mv2-name">{r.apelido || r.nome}</div>
          </div>
        ))}
      </div>

      <div className="mv2-goals-grid">
        {CAT_KEYS.map((k) => {
          const t = catTotals(sales, dashFrom, dashTo, k);
          const goal = getGoal(goals[k], mode, sales, collaborators);
          const gaugePct = goal > 0 ? Math.min(100, (t.valor / goal) * 100) : 0;
          return (
            <div key={k} className="mv2-goal-item">
              <GoalGauge pct={gaugePct} color={CAT_COLOR[k]} />
              <div className="mv2-goal-name">{CAT_LABEL[k]}</div>
              <div className="mv2-goal-value">{fmtMoney(t.valor)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
