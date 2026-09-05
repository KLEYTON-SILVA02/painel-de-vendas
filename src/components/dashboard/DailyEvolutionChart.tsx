import { useMemo, useState } from 'react';
import type { CategoryKey, GoalCategoryKey } from '../../lib/business/classification';
import { getGoal, getSuperMeta } from '../../lib/business/goals';
import { matchesSpecialList, type SpecialListItem } from '../../lib/business/summary';
import type { Collaborator, Goal, Sale } from '../../lib/business/types';
import { fmtMoney } from '../../lib/format';

export type ChartCategoryKey = CategoryKey | 'LEVMEL' | 'CHIP';

export const CHART_CATEGORIES: { key: ChartCategoryKey; titulo: string; color: string }[] = [
  { key: 'MER', titulo: 'Mercadoria Geral', color: '#ff6a00' },
  { key: 'DERM', titulo: 'Dermocosméticos', color: '#ff3df0' },
  { key: 'GEN', titulo: 'Genéricos', color: '#14ff00' },
  { key: 'MP', titulo: 'Marcas Exclusivas', color: '#a82bff' },
  { key: 'LEVMEL', titulo: 'Levmel', color: '#ffb700' },
  { key: 'CHIP', titulo: 'Chip', color: '#00e5ff' },
];

export interface DailyPoint {
  day: number;
  dateISO: string;
  valor: number;
  hitMeta: boolean;
  hitSuper: boolean;
}

/** Buckets `salesData` by day for the reference month (monthFirst..monthLast)
 * and one category — MER counts every sale (store total, same convention as
 * everywhere else this category is treated as "all sales"), LEVMEL/CHIP
 * match by product-name keyword (matchesSpecialList, they're not a `grupo`
 * value), the rest by `grupo`. Every calendar day gets a point even with no
 * sales (valor 0), so the x-axis never skips a day. */
function computeDailyPoints(
  salesData: Sale[],
  catKey: ChartCategoryKey,
  monthFirst: string,
  monthLast: string,
  specialLists: { levmel: SpecialListItem[]; chip: SpecialListItem[] } | undefined,
  metaDiaria: number,
  superMetaDiaria: number,
): DailyPoint[] {
  const isUnit = catKey === 'LEVMEL' || catKey === 'CHIP';
  const list = isUnit ? (catKey === 'LEVMEL' ? specialLists?.levmel : specialLists?.chip) : undefined;
  const byDay = new Map<string, number>();
  salesData.forEach((s) => {
    if (!s.dataISO || s.dataISO < monthFirst || s.dataISO > monthLast) return;
    const matches = catKey === 'MER' ? true : isUnit ? matchesSpecialList(s.produto, list) : s.grupo === catKey;
    if (!matches) return;
    byDay.set(s.dataISO, (byDay.get(s.dataISO) ?? 0) + (Number(s.valor) || 0));
  });

  const totalDays = Number(monthLast.slice(8, 10));
  const yearMonthPrefix = monthFirst.slice(0, 8);
  const points: DailyPoint[] = [];
  for (let day = 1; day <= totalDays; day++) {
    const dateISO = `${yearMonthPrefix}${String(day).padStart(2, '0')}`;
    const valor = byDay.get(dateISO) ?? 0;
    points.push({
      day,
      dateISO,
      valor,
      hitMeta: metaDiaria > 0 && valor >= metaDiaria,
      hitSuper: superMetaDiaria > 0 && valor >= superMetaDiaria,
    });
  }
  return points;
}

function niceAxisMax(values: number[]): number {
  const max = Math.max(1, ...values);
  // Headroom above the tallest bar so it doesn't touch the card's top edge,
  // rounded up to a "clean" step (1/2/5 × a power of ten) so the axis labels
  // read as real money marks instead of an arbitrary decimal.
  const raw = max * 1.15;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const steps = [1, 2, 2.5, 5, 10];
  const step = steps.find((s) => s * magnitude >= raw) ?? 10;
  return step * magnitude;
}

interface DailyEvolutionChartProps {
  salesData: Sale[];
  collaboratorsData: Collaborator[];
  goals: Record<GoalCategoryKey, Goal | undefined>;
  specialLists: { levmel: SpecialListItem[]; chip: SpecialListItem[] } | undefined;
  monthFirst: string;
  monthLast: string;
}

// Shared by the desktop (vertical bars) and mobile (horizontal bars) chart
// presentations — same category selection, same day-bucketing, same axis.
// The axis's 3 marks are each category's own goals, not an arbitrary "nice"
// max over the observed data: R$0,00 at the bottom, that category's daily
// Meta Geral in the middle, its daily Super Meta at the top — so the same
// bar height always means the same progress toward that day's targets,
// whichever category tab is active. A category with no Super Meta
// configured (LEVMEL/CHIP typically don't use one) falls back to 1.5× its
// daily meta as headroom; with neither goal configured, falls back to the
// old observed-max heuristic so the chart still reads sensibly.
export function useDailyEvolutionChart({ salesData, collaboratorsData, goals, specialLists, monthFirst, monthLast }: DailyEvolutionChartProps) {
  const [catKey, setCatKey] = useState<ChartCategoryKey>('MER');
  const active = CHART_CATEGORIES.find((c) => c.key === catKey)!;

  const metaDiaria = useMemo(
    () => getGoal(goals[catKey], 'dia', salesData, collaboratorsData),
    [goals, catKey, salesData, collaboratorsData],
  );
  const superMetaDiaria = useMemo(
    () => getSuperMeta(goals[catKey], 'dia', salesData, collaboratorsData),
    [goals, catKey, salesData, collaboratorsData],
  );
  const points = useMemo(
    () => computeDailyPoints(salesData, catKey, monthFirst, monthLast, specialLists, metaDiaria, superMetaDiaria),
    [salesData, catKey, monthFirst, monthLast, specialLists, metaDiaria, superMetaDiaria],
  );
  const { axisTop, axisMid } = useMemo(() => {
    if (superMetaDiaria > 0) {
      return { axisTop: superMetaDiaria, axisMid: metaDiaria > 0 ? metaDiaria : superMetaDiaria / 2 };
    }
    if (metaDiaria > 0) {
      return { axisTop: metaDiaria * 1.5, axisMid: metaDiaria };
    }
    const fallback = niceAxisMax(points.map((p) => p.valor));
    return { axisTop: fallback, axisMid: fallback / 2 };
  }, [metaDiaria, superMetaDiaria, points]);

  return { catKey, setCatKey, active, points, axisTop, axisMid };
}

export function DailyEvolutionChart(props: DailyEvolutionChartProps) {
  const { catKey, setCatKey, active, points, axisTop, axisMid } = useDailyEvolutionChart(props);
  const CHART_H = 130;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h3 className="text-cyan-400 font-semibold text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          EVOLUÇÃO DIÁRIA
        </h3>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CHART_CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setCatKey(c.key)}
              style={{
                border: `1px solid ${c.key === catKey ? c.color : '#212948'}`,
                background: c.key === catKey ? c.color : 'transparent',
                color: c.key === catKey ? '#0b0e1d' : '#8b90bf',
                borderRadius: 8,
                padding: '4px 9px',
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '.03em',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              {c.titulo}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
        {/* Y-axis: 3 marks (0, meta diária, super meta diária) against the
            active category's own goals — see useDailyEvolutionChart above. */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: CHART_H, fontSize: 9, color: '#8b90bf', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0, textAlign: 'right', paddingBottom: 18 }}>
          <span>{fmtMoney(axisTop)}</span>
          <span>{fmtMoney(axisMid)}</span>
          <span>R$ 0,00</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, flex: 1, minWidth: points.length * 16 }}>
          {points.map((p) => {
            const pct = Math.min(100, (p.valor / axisTop) * 100);
            // SM (Super Meta) and MG (Meta Geral) are mutually exclusive:
            // Super Meta already implies Meta Geral was cleared too, so once
            // both are hit only the higher badge (SM) shows.
            const showSuper = p.hitSuper;
            const showMeta = p.hitMeta && !p.hitSuper;
            return (
              <div key={p.dateISO} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 14 }}>
                <div
                  title={`Realizado no dia: ${fmtMoney(p.valor)}`}
                  style={{ position: 'relative', width: '100%', height: CHART_H, display: 'flex', alignItems: 'flex-end', cursor: 'default' }}
                >
                  {(showMeta || showSuper) && (
                    <div
                      style={{
                        position: 'absolute',
                        left: '50%',
                        bottom: `calc(${pct}% + 4px)`,
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
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
                  <div style={{ width: '100%', height: '100%', borderRadius: 999, background: '#080818', border: '1px solid #212948', overflow: 'hidden', display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{ width: '100%', height: `${pct}%`, borderRadius: 999, background: 'linear-gradient(0deg, #ff3df0, #ff8bf5)' }} />
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 4,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    border: `1px solid ${active.color}`,
                    color: active.color,
                    fontSize: 8,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {p.day}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
