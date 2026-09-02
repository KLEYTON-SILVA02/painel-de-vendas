import type { CSSProperties } from 'react';
import { todayISO } from '../lib/dateRange';
import { monthName } from '../lib/format';
import { useDateRange } from '../routes/DateRangeContext';

// Ported 1:1 from legacy/index-original.html — renderCalendarCard(). Distinct
// from MetricsFilterBar: this is the Início sidebar's own "Período rápido"
// widget (month-nav arrows + a conventional 7-column month grid), not the
// unified metrics-filter-bar used on Ranking/Category screens.

const MESES_ABREV = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const DOW_ABBR = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const NEON_CYAN = '#00f0ff';

export function SidebarCalendarCard() {
  const { refYear, refMonth, dashFrom, dashTo, modoGeral, quickMonth, navigateMonth, pickDay, toggleBuscaPeriodo, setModoGeral, buscaPeriodoOpen } =
    useDateRange();

  const firstDow = new Date(refYear, refMonth, 1).getDay();
  const daysInMonth = new Date(refYear, refMonth + 1, 0).getDate();
  const today = todayISO();

  const cells: { day: number | null; iso: string | null }[] = [];
  for (let i = 0; i < firstDow; i++) cells.push({ day: null, iso: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, iso: `${refYear}-${String(refMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  }

  return (
    <div className="h-full rounded-2xl border border-slate-800 bg-slate-900/60 p-4 box-border">
      <div style={{ fontSize: 10, color: '#8b90bf', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, marginBottom: 6 }}>
        📅 Período rápido {refYear}
      </div>
      <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 2, paddingBottom: 6, marginBottom: 8, borderBottom: '1px solid #212948' }}>
        {MESES_ABREV.map((lbl, i) => (
          <button
            key={i}
            onClick={() => quickMonth(i)}
            style={{
              flex: '1 1 0',
              minWidth: 0,
              background: i === refMonth ? NEON_CYAN : 'transparent',
              color: i === refMonth ? '#02181c' : '#8b90bf',
              border: `1px solid ${NEON_CYAN}`,
              borderRadius: 5,
              padding: '3px 1px',
              fontSize: 7,
              fontWeight: 700,
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            {lbl}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 10, color: '#a82bff', fontSize: 13, fontWeight: 700, letterSpacing: '.04em' }}>
        <button
          onClick={() => navigateMonth(-1)}
          style={{ background: 'transparent', border: '1px solid #212948', color: '#8b90bf', width: 24, height: 24, borderRadius: 8, cursor: 'pointer' }}
        >
          ‹
        </button>
        <span>
          {monthName(refMonth)} / {refYear}
        </span>
        <button
          onClick={() => navigateMonth(1)}
          style={{ background: 'transparent', border: '1px solid #212948', color: '#8b90bf', width: 24, height: 24, borderRadius: 8, cursor: 'pointer' }}
        >
          ›
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button
          onClick={toggleBuscaPeriodo}
          style={{
            flex: 1,
            background: buscaPeriodoOpen ? NEON_CYAN : '#0b0e1d',
            color: buscaPeriodoOpen ? '#02181c' : NEON_CYAN,
            border: `1px solid ${NEON_CYAN}`,
            borderRadius: 999,
            padding: 6,
            fontSize: 9.5,
            fontWeight: 700,
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Busca período
        </button>
        <button
          onClick={setModoGeral}
          style={{
            flex: 1,
            background: modoGeral ? NEON_CYAN : '#0b0e1d',
            color: modoGeral ? '#02181c' : NEON_CYAN,
            border: `1px solid ${NEON_CYAN}`,
            borderRadius: 999,
            padding: 6,
            fontSize: 9.5,
            fontWeight: 700,
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Modo Geral
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, textAlign: 'center' }}>
        {DOW_ABBR.map((lbl, i) => {
          const isDom = i === 0;
          const isSab = i === 6;
          return (
            <div
              key={lbl}
              style={{
                fontSize: 9,
                color: isDom || isSab ? '#fff' : '#8b90bf',
                fontWeight: 700,
                textAlign: 'center',
                borderRadius: 5,
                border: `1px solid ${isDom ? '#ff0033' : isSab ? '#7928ca' : 'transparent'}`,
                background: isDom ? '#ff0033' : isSab ? '#7928ca' : 'transparent',
                padding: '2px 0',
              }}
            >
              {lbl}
            </div>
          );
        })}
        {cells.map((c, i) => {
          if (c.day === null) return <div key={i} style={{ visibility: 'hidden', height: 0 }} />;
          const isToday = c.iso === today;
          const isSelected = !modoGeral && c.iso! >= dashFrom && c.iso! <= dashTo;
          let style: CSSProperties = {
            aspectRatio: '1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            fontSize: 11,
            cursor: 'pointer',
            border: `1.5px solid ${NEON_CYAN}`,
            color: '#f8fafc',
            background: 'transparent',
          };
          if (isSelected) {
            style = { ...style, borderColor: '#ffb700', color: '#ffb700', background: 'rgba(255,183,0,.15)' };
          }
          if (isToday) {
            style = {
              ...style,
              background: 'linear-gradient(180deg,#ffb700,#8a5c00)',
              color: '#231a02',
              fontWeight: 800,
              boxShadow: '0 0 10px #ffb700',
              borderColor: '#ffb700',
            };
          }
          return (
            <button key={i} onClick={() => pickDay(c.iso!)} style={style}>
              {c.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
