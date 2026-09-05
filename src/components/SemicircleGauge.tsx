// Semicircle "velocímetro" gauge, drawn as an SVG stroked arc rather than
// the tempting CSS conic-gradient + overflow:hidden trick. That trick fills
// a FULL circle clockwise from 12 o'clock (0% = 0deg through 100% = 360deg)
// and only shows whatever portion of it lands in the top half — so pct's
// 25%-75% range lands entirely in the clipped-away bottom half and never
// renders at all, while 0-25% and 75-100% each render as one quarter of the
// visible semicircle. The result: the gauge looks "full" by pct≈25%, stays
// visually frozen through the whole 25-75% range, then finishes filling the
// last quarter from 75-100% — badly non-linear, not a rendering glitch. An
// SVG arc with strokeDasharray/strokeDashoffset draws the same length of
// path regardless of where it sits on the circle, so pct maps linearly to
// how much of the visible semicircle is filled, at every value from 0-100%.
const R = 40;
const CX = 50;
const CY = 46;
const PATH = `M ${CX - R},${CY} A ${R},${R} 0 0 1 ${CX + R},${CY}`;
const LENGTH = Math.PI * R;

export function SemicircleGauge({
  pct,
  color,
  trackColor = '#1a1a1a',
  strokeWidth = 8,
}: {
  pct: number;
  color: string;
  trackColor?: string;
  strokeWidth?: number;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <svg viewBox="0 0 100 52" width="100%">
      <path d={PATH} fill="none" stroke={trackColor} strokeWidth={strokeWidth} strokeLinecap="round" />
      <path
        d={PATH}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={LENGTH}
        strokeDashoffset={LENGTH * (1 - clamped / 100)}
      />
    </svg>
  );
}
