import { todayISO } from '../lib/dateRange';
import { useDateRange } from '../routes/DateRangeContext';

// Ported 1:1 from legacy/index-original.html — .metrics-filter-bar and
// renderMetricsFilterBar(). Every color/px value below is taken verbatim
// from the legacy CSS, not approximated.

export interface MfbStat {
  label: string;
  value: string;
  color: string;
  labelColor?: string;
}
export type MfbStatCard = MfbStat | { stack: MfbStat[] };

const MESES_ABREV = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const DOW_ABBR = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

const NEON_CYAN = '#00f0ff';
const BAR_BORDER_CYAN = '#00e5ff';
const NEON_GOLD = '#ffb700';
const BORDER = '#212948';

function ToggleButton({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: on ? 'rgba(0,229,255,.12)' : 'transparent',
        border: `1.5px solid ${NEON_CYAN}`,
        color: NEON_CYAN,
        borderRadius: 20,
        padding: '6px 10px',
        fontSize: 9.5,
        fontWeight: 700,
        textTransform: 'uppercase',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        width: '100%',
      }}
    >
      {label}
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: on ? NEON_CYAN : BORDER,
          boxShadow: on ? `0 0 6px ${NEON_CYAN}` : 'none',
          flexShrink: 0,
        }}
      />
    </button>
  );
}

function StatCard({ c, compact, hasStack }: { c: MfbStat; compact: boolean; hasStack: boolean }) {
  return (
    <div
      style={{
        flex: '1 1 140px',
        height: compact ? (hasStack ? 114 : 56) : undefined,
        minHeight: compact ? 0 : 95,
        padding: compact ? '5px 8px' : '8px 12px',
        borderRadius: 10,
        border: `1.5px solid ${c.color}`,
        background: 'rgba(255,255,255,.02)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          fontSize: compact ? 8 : 11,
          textTransform: 'uppercase',
          letterSpacing: compact ? '.01em' : '.03em',
          lineHeight: compact ? 1.15 : undefined,
          fontWeight: 700,
          textAlign: 'left',
          color: c.labelColor || NEON_CYAN,
        }}
      >
        {c.label}
      </div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: compact ? 13 : 26,
          fontWeight: 800,
          marginTop: compact ? 4 : 10,
          whiteSpace: compact ? 'nowrap' : undefined,
          overflow: compact ? 'hidden' : undefined,
          textOverflow: compact ? 'ellipsis' : undefined,
          color: c.color,
        }}
      >
        {c.value}
      </div>
    </div>
  );
}

function StatStack({ stack }: { stack: MfbStat[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 120px' }}>
      {stack.map((s, i) => (
        <div
          key={i}
          style={{
            height: 36,
            boxSizing: 'border-box',
            borderRadius: 8,
            border: `1.5px solid ${s.color}`,
            background: 'rgba(255,255,255,.02)',
            padding: '3px 8px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div style={{ fontSize: 7.5, textTransform: 'uppercase', letterSpacing: '.02em', fontWeight: 700, color: s.labelColor || NEON_CYAN }}>
            {s.label}
          </div>
          <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, marginTop: 1, color: s.color }}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

export function MetricsFilterBar({ statCards }: { statCards: MfbStatCard[] }) {
  const { refYear, refMonth, dashFrom, dashTo, modoGeral, buscaPeriodoOpen, quickMonth, pickDay, toggleBuscaPeriodo, setModoGeral } = useDateRange();

  const compact = statCards.length > 4;
  const hasStack = statCards.some((c) => 'stack' in c);
  const daysInMonth = new Date(refYear, refMonth + 1, 0).getDate();
  const today = todayISO();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        background: '#070b15',
        border: `2px solid ${BAR_BORDER_CYAN}`,
        borderRadius: 12,
        padding: '12px 16px',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: compact ? 6 : 12, flexWrap: 'wrap' }}>
        {statCards.map((c, i) =>
          'stack' in c ? <StatStack key={i} stack={c.stack} /> : <StatCard key={i} c={c} compact={compact} hasStack={hasStack} />,
        )}

        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 6, width: 340, flexShrink: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 3 }}>
            {MESES_ABREV.map((lbl, i) => (
              <button
                key={i}
                onClick={() => quickMonth(i)}
                style={{
                  minWidth: 0,
                  background: i === refMonth ? NEON_CYAN : 'transparent',
                  color: i === refMonth ? '#02181c' : '#8b90bf',
                  border: `1px solid ${NEON_CYAN}`,
                  borderRadius: 5,
                  padding: '4px 2px',
                  fontSize: 9,
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                {lbl}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <ToggleButton on={buscaPeriodoOpen} onClick={toggleBuscaPeriodo} label="Busca período" />
            <ToggleButton on={modoGeral} onClick={setModoGeral} label="Modo Geral" />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${daysInMonth},1fr)`, gap: 4, width: '100%', minWidth: 'min-content' }}>
          {Array.from({ length: daysInMonth }, (_, idx) => {
            const dow = new Date(refYear, refMonth, idx + 1).getDay();
            const isDom = dow === 0;
            const isSab = dow === 6;
            const color = isDom ? '#ff0033' : isSab ? '#7928ca' : NEON_CYAN;
            return (
              <div
                key={idx}
                style={{
                  height: 20,
                  borderRadius: 5,
                  fontSize: 9,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `1px solid ${color}`,
                  color: '#fff',
                  minWidth: 24,
                  background: isDom || isSab ? color : 'transparent',
                }}
              >
                {DOW_ABBR[dow]}
              </div>
            );
          })}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${daysInMonth},1fr)`,
            gap: 4,
            width: '100%',
            alignItems: 'center',
            justifyItems: 'center',
            minWidth: 'min-content',
          }}
        >
          {Array.from({ length: daysInMonth }, (_, idx) => {
            const d = idx + 1;
            const iso = `${refYear}-${String(refMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isToday = iso === today;
            const isSelected = !modoGeral && iso >= dashFrom && iso <= dashTo;
            let border = NEON_CYAN;
            let color = '#fff';
            let background = 'transparent';
            let boxShadow = 'none';
            if (isSelected) {
              border = NEON_GOLD;
              color = NEON_GOLD;
              background = 'rgba(255,183,0,.15)';
            }
            if (isToday) {
              border = NEON_GOLD;
              color = NEON_GOLD;
              background = 'rgba(255,183,0,.25)';
              boxShadow = `0 0 10px ${NEON_GOLD}`;
            }
            return (
              <button
                key={d}
                onClick={() => pickDay(iso)}
                style={{
                  aspectRatio: '1/1',
                  width: '100%',
                  maxWidth: 32,
                  minWidth: 24,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `2px solid ${border}`,
                  color,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background,
                  boxShadow,
                }}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
