import { useState } from 'react';
import { fmtDateBR } from '../../lib/format';
import { useDateRange } from '../../routes/DateRangeContext';

// Collapsible mobile date filter: a chip showing the current period that
// expands into start/end date inputs plus "Buscar Período" (applies the
// typed range) and "Modo Geral" (resets to the whole current month) —
// the mobile equivalent of the desktop SidebarCalendarCard's month grid.
export function MobileDateFilterBar() {
  const { dashFrom, dashTo, modoGeral, setRange, setModoGeral } = useDateRange();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(dashFrom);
  const [to, setTo] = useState(dashTo);

  const periodLabel = modoGeral
    ? 'Mês inteiro'
    : dashFrom === dashTo
      ? fmtDateBR(dashFrom)
      : `${fmtDateBR(dashFrom)} — ${fmtDateBR(dashTo)}`;

  function handleBuscarPeriodo() {
    if (!from || !to) return;
    setRange(from <= to ? from : to, from <= to ? to : from);
    setOpen(false);
  }

  function handleModoGeral() {
    setModoGeral();
    setOpen(false);
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-sm"
      >
        <span className="flex items-center gap-2 text-slate-300">
          <span style={{ color: '#00f0ff' }}>📅</span> {periodLabel}
        </span>
        <span className="text-slate-500" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: '.15s' }}>
          ▾
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 flex flex-col gap-2 border-t border-slate-800 pt-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wide">Início</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input text-sm" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wide">Fim</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input text-sm" />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleBuscarPeriodo}
              className="flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wide"
              style={{ background: '#00f0ff', color: '#02181c' }}
            >
              Buscar Período
            </button>
            <button
              onClick={handleModoGeral}
              className="flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wide border"
              style={{ borderColor: '#00f0ff', color: modoGeral ? '#02181c' : '#00f0ff', background: modoGeral ? '#00f0ff' : 'transparent' }}
            >
              Modo Geral
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
