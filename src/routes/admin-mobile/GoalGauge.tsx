import { SemicircleGauge } from '../../components/SemicircleGauge';

// Semicircle "velocímetro" gauge for the mobile v2 metas-por-categoria grid
// — arc drawing lives in SemicircleGauge (shared with the desktop
// Dashboard's CategoryGauge), this just adds the % label centered below it.
export function GoalGauge({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ width: 90, margin: '0 auto' }}>
      <SemicircleGauge pct={pct} color={color} />
      <div style={{ textAlign: 'center', marginTop: -8, fontSize: 13, fontWeight: 700, color }}>{pct.toFixed(0)}%</div>
    </div>
  );
}
