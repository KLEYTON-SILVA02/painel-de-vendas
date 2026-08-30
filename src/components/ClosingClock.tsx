import { useEffect, useState } from 'react';
import { computeClosingClockState, type Horario } from '../lib/business/horario';

// Ported 1:1 from legacy/index-original.html (#closingClock / updateClosingClock(),
// setInterval(updateClosingClock, 1000)) — the header bar's live countdown to
// closing time, red/"FECHADO" once past hours.
export function ClosingClock({ horario, feriadosDatas }: { horario: Horario; feriadosDatas: string[] }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const state = computeClosingClockState(horario, feriadosDatas, now);
  const isOpen = state.status === 'open';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: '#04120c',
        border: `1px solid ${isOpen ? '#14ff00' : '#ff3df0'}`,
        borderRadius: 10,
        padding: '5px 10px',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
        color: isOpen ? '#14ff00' : '#ff3df0',
        textShadow: isOpen ? '0 0 6px rgba(20,255,0,.6)' : '0 0 6px rgba(255,61,240,.6)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: 13 }}>🕒</span> {state.label}
    </div>
  );
}
