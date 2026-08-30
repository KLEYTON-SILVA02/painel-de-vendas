import { useEffect, useState } from 'react';
import { computeClosingClockState, type Horario } from '../../lib/business/horario';

// Same countdown logic as the desktop ClosingClock, restyled to the mv2
// topbar's .mv2-close-timer pill (green while open, red once closed).
export function MobileClosingTimer({ horario, feriadosDatas }: { horario: Horario; feriadosDatas: string[] }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const state = computeClosingClockState(horario, feriadosDatas, now);

  return <div className={`mv2-close-timer ${state.status === 'closed' ? 'mv2-closed' : ''}`}>🕒 {state.label}</div>;
}
