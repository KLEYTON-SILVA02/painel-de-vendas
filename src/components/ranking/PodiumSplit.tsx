import type { StaircaseRow } from './PodiumStaircase';

// "Ranking Geral de Vendas" — new split layout (top-3 as domed towers on the
// left, positions 4-15 as a two-column pill grid on the right), toggled on
// via store_settings.ranking_moderno alongside the older PodiumStaircase
// design it doesn't replace. Ported from the ADM-supplied UI spec: gold/
// silver/bronze towers with a crown over 1st and a medal-framed avatar at
// each tube's center (no name/value on the towers themselves — those two
// live only in the 4-15 list, matching the reference mockup), then a
// classic pill row (number · avatar · name · value) for the rest.

const TOWER_COLORS: Record<number, { fundo: string; from: string; to: string; ring: string }> = {
  0: { fundo: '#8a6200', from: '#ffd700', to: '#d49b00', ring: '#ffd700' },
  1: { fundo: '#4b5563', from: '#e2e8f0', to: '#94a3b8', ring: '#e2e8f0' },
  2: { fundo: '#7c2d12', from: '#f97316', to: '#c2410c', ring: '#f97316' },
};
const TOWER_HEIGHT: Record<number, number> = { 0: 208, 1: 172, 2: 150 };
const MAX_LISTED = 15;
const COL_SIZE = 6;

export function PodiumSplit<T extends StaircaseRow>({
  ranking,
  getValue,
  formatValue,
}: {
  ranking: T[];
  getValue: (r: T) => number;
  formatValue: (v: number) => string;
}) {
  if (!ranking.length) {
    return <div className="text-sm text-slate-500 py-6 text-center">Sem vendas para este período.</div>;
  }

  const top3 = ranking.slice(0, 3);
  const rest = ranking.slice(3, MAX_LISTED);
  const col1 = rest.slice(0, COL_SIZE);
  const col2 = rest.slice(COL_SIZE, COL_SIZE * 2);
  // Visual order is 2nd/1st/3rd (tallest in the middle) — only meaningful
  // once all three podium spots are filled; fewer than 3 just keeps rank order.
  const towerOrder = top3.length === 3 ? [1, 0, 2] : top3.map((_, i) => i);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'stretch' }}>
      <div style={{ flex: '1 1 260px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', gap: 10, minHeight: 230 }}>
        {towerOrder.map((rank) => (
          <Tower key={top3[rank].matricula} rank={rank} row={top3[rank]} />
        ))}
      </div>

      {rest.length > 0 && (
        <div style={{ flex: '2 1 380px', display: 'flex', gap: 16, minWidth: 0 }}>
          <PillColumn rows={col1} startPos={4} getValue={getValue} formatValue={formatValue} />
          {col2.length > 0 && <PillColumn rows={col2} startPos={4 + COL_SIZE} getValue={getValue} formatValue={formatValue} />}
        </div>
      )}
    </div>
  );
}

function Tower<T extends StaircaseRow>({ rank, row }: { rank: number; row: T }) {
  const colors = TOWER_COLORS[rank];
  const height = TOWER_HEIGHT[rank];
  const gradient = `linear-gradient(180deg,${colors.from} 0%,${colors.to} 100%)`;
  return (
    <div style={{ position: 'relative', flex: '1 1 0', maxWidth: 96, display: 'flex', justifyContent: 'center' }}>
      {rank === 0 && (
        <div style={{ position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)', fontSize: 26, zIndex: 6 }}>👑</div>
      )}
      <div style={{ position: 'relative', width: '100%', height, borderRadius: '9999px 9999px 10px 10px', overflow: 'hidden', background: colors.fundo }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '46%', background: gradient }} />
        <div style={{ position: 'absolute', top: '54%', left: 0, right: 0, bottom: 0, background: gradient }} />
      </div>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 5 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: '#fff',
            border: `3px solid ${colors.ring}`,
            boxShadow: `0 0 10px ${colors.ring}99`,
            overflow: 'hidden',
          }}
        >
          {row.foto && <img src={row.foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </div>
        <div style={{ position: 'absolute', width: 10, height: 24, background: colors.ring, bottom: -16, left: 10, transform: 'rotate(18deg)', borderRadius: 2 }} />
        <div style={{ position: 'absolute', width: 10, height: 24, background: colors.ring, bottom: -16, right: 10, transform: 'rotate(-18deg)', borderRadius: 2 }} />
      </div>
    </div>
  );
}

function PillColumn<T extends StaircaseRow>({
  rows,
  startPos,
  getValue,
  formatValue,
}: {
  rows: T[];
  startPos: number;
  getValue: (r: T) => number;
  formatValue: (v: number) => string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 0', minWidth: 0 }}>
      {rows.map((r, i) => (
        <div
          key={r.matricula}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 38,
            boxSizing: 'border-box',
            padding: '0 12px',
            borderRadius: 9999,
            background: 'linear-gradient(90deg,#1D3557 0%,#2A4D80 100%)',
          }}
        >
          <span style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: 13, color: '#fff', width: 20, textAlign: 'center', flexShrink: 0 }}>
            {startPos + i}
          </span>
          <span style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid #8A2BE2', background: '#0b0e1d', overflow: 'hidden', flexShrink: 0 }}>
            {r.foto && <img src={r.foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </span>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textTransform: 'uppercase',
              fontWeight: 700,
              fontSize: 12,
              color: '#fff',
            }}
          >
            {r.apelido || r.nome}
          </span>
          <span style={{ marginLeft: 'auto', flexShrink: 0, fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: 12, color: '#64B5F6' }}>
            {formatValue(getValue(r))}
          </span>
        </div>
      ))}
    </div>
  );
}
