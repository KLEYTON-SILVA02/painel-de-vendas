// Semicircle "velocímetro" gauge for the mobile v2 metas-por-categoria grid.
// Renders as SVG rather than the spec's conic-gradient+radial-mask CSS trick
// — that trick doesn't render a correct arc for non-square aspect-ratio
// boxes (verified: small percentages rendered as an empty gauge) — this
// keeps the same visual result (colored semicircle arc, % centered below)
// without the broken geometry.
const R = 40;
const CX = 50;
const CY = 46;
const PATH = `M ${CX - R},${CY} A ${R},${R} 0 0 1 ${CX + R},${CY}`;
const LENGTH = Math.PI * R;

export function GoalGauge({ pct, color }: { pct: number; color: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ width: 90, margin: '0 auto' }}>
      <svg viewBox="0 0 100 52" width="100%">
        <path d={PATH} fill="none" stroke="#1a1a1a" strokeWidth="8" strokeLinecap="round" />
        <path
          d={PATH}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={LENGTH}
          strokeDashoffset={LENGTH * (1 - clamped / 100)}
        />
      </svg>
      <div style={{ textAlign: 'center', marginTop: -8, fontSize: 13, fontWeight: 700, color }}>{pct.toFixed(0)}%</div>
    </div>
  );
}
