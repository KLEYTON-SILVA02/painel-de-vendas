import { CHART_CATEGORIES, formatChartValue, useDailyEvolutionChart } from '../../components/dashboard/DailyEvolutionChart';
import type { GoalCategoryKey } from '../../lib/business/classification';
import type { SpecialListItem } from '../../lib/business/summary';
import type { Collaborator, Goal, Sale } from '../../lib/business/types';

// Mobile take on the desktop DailyEvolutionChart: same data/axis (see
// useDailyEvolutionChart), but bars run horizontally, one per row, in a
// vertically stacked list instead of side-by-side vertical bars — matches
// the phone screen's tall/narrow aspect ratio better than a horizontally
// scrolling row of thin columns would.
export function MobileDailyEvolutionChart({
  salesData,
  collaboratorsData,
  goals,
  specialLists,
  monthFirst,
  monthLast,
}: {
  salesData: Sale[];
  collaboratorsData: Collaborator[];
  goals: Record<GoalCategoryKey, Goal | undefined>;
  specialLists: { levmel: SpecialListItem[]; chip: SpecialListItem[] } | undefined;
  monthFirst: string;
  monthLast: string;
}) {
  const { catKey, setCatKey, active, isUnit, points, axisTop, axisMid } = useDailyEvolutionChart({
    salesData,
    collaboratorsData,
    goals,
    specialLists,
    monthFirst,
    monthLast,
  });

  return (
    <div
      style={{
        margin: '0 18px 16px',
        background: 'var(--mv2-bg-cards)',
        border: '1px solid var(--mv2-roxo-marca)',
        borderRadius: 'var(--mv2-radius-md)',
        padding: 12,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mv2-ciano)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
        Evolução Diária
      </div>

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 8 }}>
        {CHART_CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCatKey(c.key)}
            style={{
              border: `1px solid ${c.key === catKey ? c.color : 'var(--mv2-roxo-marca)'}`,
              background: c.key === catKey ? c.color : 'transparent',
              color: c.key === catKey ? '#0b0e1d' : 'var(--mv2-texto-2)',
              borderRadius: 8,
              padding: '5px 10px',
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '.03em',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {c.titulo}
          </button>
        ))}
      </div>

      {/* Ruler: R$0,00 / meta diária / super meta diária for the active
          category — see useDailyEvolutionChart's axis calc. paddingLeft
          lines the marks up over the bars below (past the day-circle gutter). */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 9,
          color: 'var(--mv2-texto-2)',
          fontFamily: "'JetBrains Mono', monospace",
          marginBottom: 6,
          paddingLeft: 30,
        }}
      >
        <span>{formatChartValue(0, isUnit)}</span>
        <span>{formatChartValue(axisMid, isUnit)}</span>
        <span>{formatChartValue(axisTop, isUnit)}</span>
      </div>

      <div>
        {points.map((p) => {
          const pct = Math.min(100, (p.valor / axisTop) * 100);
          // Mutually exclusive, same rule as desktop: Super Meta implies
          // Meta Geral was cleared too, so only the higher badge shows.
          const showSuper = p.hitSuper;
          const showMeta = p.hitMeta && !p.hitSuper;
          return (
            <div key={p.dateISO} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  border: `1px solid ${active.color}`,
                  color: active.color,
                  fontSize: 9,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {p.day}
              </div>
              <div title={`Realizado no dia: ${formatChartValue(p.valor, isUnit)}`} style={{ position: 'relative', flex: 1, height: 16 }}>
                <div style={{ width: '100%', height: '100%', borderRadius: 999, background: '#080818', border: '1px solid #212948', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: 'linear-gradient(90deg, #ff3df0, #ff8bf5)' }} />
                </div>
                {(showMeta || showSuper) && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: `calc(${pct}% + 4px)`,
                      transform: 'translateY(-50%)',
                      display: 'flex',
                      gap: 2,
                      pointerEvents: 'none',
                    }}
                  >
                    {showSuper && (
                      <span
                        style={{
                          width: 20,
                          height: 20,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 9,
                          fontWeight: 800,
                          lineHeight: 1,
                          color: '#0b0e1d',
                          background: '#14ff00',
                          borderRadius: '50%',
                        }}
                      >
                        SM
                      </span>
                    )}
                    {showMeta && (
                      <span
                        style={{
                          width: 20,
                          height: 20,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 9,
                          fontWeight: 800,
                          lineHeight: 1,
                          color: '#0b0e1d',
                          background: '#ffb700',
                          borderRadius: '50%',
                        }}
                      >
                        MG
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
