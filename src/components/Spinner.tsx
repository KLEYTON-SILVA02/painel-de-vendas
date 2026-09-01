import type { CSSProperties } from 'react';

// Circular "page loading" spinner — a solid circle notched at 8 points via
// clip-path (rather than the usual border-with-a-gap trick), so the
// rotation reads clearly as spinning instead of just a fading ring. The
// notch depth scales with size so it still reads right at any size the
// caller picks. Keyframes live in index.css (`app-spinner-spin`) so
// multiple spinners on the same page share one animation definition.
export function Spinner({ size = 20, color = '#00f0ff', className }: { size?: number; color?: string; className?: string }) {
  const notch = Math.max(2, Math.round(size * 0.16));
  const style: CSSProperties = {
    width: size,
    height: size,
    background: color,
    borderRadius: '50%',
    display: 'inline-block',
    verticalAlign: 'middle',
    animation: 'app-spinner-spin 1s infinite linear',
    clipPath: `polygon(0 0,calc(50% - ${notch}px) 0,50% ${notch}px,calc(50% + ${notch}px) 0,100% 0,100% calc(50% - ${notch}px),calc(100% - ${notch}px) 50%,100% calc(50% + ${notch}px),100% 100%,calc(50% + ${notch}px) 100%, 50% calc(100% - ${notch}px),calc(50% - ${notch}px) 100%,0 100%,0 calc(50% + ${notch}px), ${notch}px 50%, 0 calc(50% - ${notch}px))`,
  };
  return <span className={className} style={style} aria-hidden="true" />;
}
