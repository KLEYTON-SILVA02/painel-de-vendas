// Full-circle "anel de progresso" gauge — same SVG stroked-arc technique as
// SemicircleGauge (see its own comment for why a CSS conic-gradient trick
// doesn't work here either), just over the whole 360° instead of half, with
// an optional centered label (percentage text) since this one is meant to
// stand alone (e.g. import progress) rather than always pairing with a
// separate text element below it like SemicircleGauge's callers do.
const R = 42;
const CX = 50;
const CY = 50;
const CIRCUMFERENCE = 2 * Math.PI * R;

export function CircularGauge({
  pct,
  color,
  trackColor = '#1a1a1a',
  strokeWidth = 8,
  label,
}: {
  pct: number;
  color: string;
  trackColor?: string;
  strokeWidth?: number;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <circle cx={CX} cy={CY} r={R} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
      <circle
        cx={CX}
        cy={CY}
        r={R}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - clamped / 100)}
        // Starts at 12 o'clock and fills clockwise, instead of SVG's default
        // 3-o'clock start — reads as a conventional "loading ring".
        transform={`rotate(-90 ${CX} ${CY})`}
      />
      {label && (
        <text x={CX} y={CY} textAnchor="middle" dominantBaseline="central" fill={color} fontSize={22} fontWeight={700} fontFamily="'JetBrains Mono', monospace">
          {label}
        </text>
      )}
    </svg>
  );
}
