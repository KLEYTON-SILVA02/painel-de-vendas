import { useState } from 'react';
import { todayISO } from '../../lib/dateRange';
import { useDateRange } from '../DateRangeContext';

const MESES_ABREV = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const DOW_ABBR = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

// Shared mv2 date filter (recolhido/expandido) — every mobile v2 screen
// reuses this same widget per the spec ("reaproveitando... o filtro de
// datas já documentado no primeiro Scanner Técnico").
export function MobileDateFilter() {
  const { dashFrom, dashTo, refYear, refMonth, modoGeral, buscaPeriodoOpen, quickMonth, pickDay, toggleBuscaPeriodo, setModoGeral } = useDateRange();
  const [expanded, setExpanded] = useState(false);
  const today = todayISO();
  const daysInMonth = new Date(refYear, refMonth + 1, 0).getDate();

  return (
    <div className="mv2-date-filter">
      <div className="mv2-month-grid">
        {MESES_ABREV.map((lbl, i) => (
          <button key={i} className={i === refMonth ? 'active' : ''} onClick={() => quickMonth(i)}>
            {lbl}
          </button>
        ))}
      </div>
      <div className="mv2-mode-row">
        <button className={`mv2-pill ${buscaPeriodoOpen ? 'active' : ''}`} onClick={toggleBuscaPeriodo}>
          Buscar Período
        </button>
        <button className={`mv2-pill ${modoGeral ? 'active' : ''}`} onClick={setModoGeral}>
          Modo Geral
        </button>
        <button className="mv2-pill" onClick={() => setExpanded((v) => !v)}>
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {expanded && (
        <>
          <div className="mv2-weekday-row">
            {DOW_ABBR.map((d, i) => (
              <div key={d} className={`mv2-weekday ${i === 0 ? 'active' : ''} ${i === 6 ? 'active sat' : ''}`}>
                {d}
              </div>
            ))}
          </div>
          <div className="mv2-calendar-grid">
            {Array.from({ length: new Date(refYear, refMonth, 1).getDay() }, (_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const d = i + 1;
              const iso = `${refYear}-${String(refMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const isSelected = !modoGeral && iso >= dashFrom && iso <= dashTo;
              const isToday = iso === today;
              return (
                <button key={d} className={`mv2-day ${isSelected || isToday ? 'selected' : ''}`} onClick={() => pickDay(iso)}>
                  {d}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
