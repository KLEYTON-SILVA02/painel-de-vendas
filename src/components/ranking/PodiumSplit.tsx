import podiumPremiumBg from '../../assets/ranking/podium-premium-bg.jpg';
import type { StaircaseRow } from './PodiumStaircase';

// "Ranking Geral de Vendas" — new split layout (top-3 over the ADM-supplied
// podium artwork on the left, positions 4-15 as a two-column pill grid on
// the right), toggled on via store_settings.ranking_moderno alongside the
// older PodiumStaircase design it doesn't replace. The podium image is a
// fixed background (silver/gold/bronze pedestals, crown baked in, no
// baked-in text placeholders) — the system overlays each collaborator's
// photo into the image's own blank white circle, plus the value/name as
// white text in the blank area below the ribbon, all at the exact
// position/size measured on the source artwork (percentages of the
// image's own width/height, so they stay correct at any render size as
// long as the container keeps the image's aspect ratio — see
// `aspectRatio` below).
const PODIUM_BG_RATIO = 2000 / 1669;
const CIRCLE_SPOTS: Record<number, { left: number; top: number; diameter: number }> = {
  0: { left: 49.98, top: 45.39, diameter: 16.95 }, // 1º — centro
  1: { left: 18.9, top: 48.29, diameter: 18.4 }, // 2º — esquerda
  2: { left: 86.12, top: 47.66, diameter: 17.75 }, // 3º — direita
};
// Value/name text positioned in the blank pedestal area below the ribbon
// — measured the same way as CIRCLE_SPOTS. Rendered in white with a drop
// shadow (no capsule backdrop in this artwork) so it reads against any of
// the three pedestal colors. Font sizes are in cqw so they scale with the
// podium container's rendered width via CSS container queries; value
// width/size are generous enough that a full "R$ 1.234,56" never
// truncates.
const TEXT_SPOTS: Record<
  number,
  { centerLeft: number; valueTop: number; nomeTop: number; valueSize: number; nomeSize: number; valueMaxWidth: number; nomeMaxWidth: number }
> = {
  0: { centerLeft: 49.98, valueTop: 77.95, nomeTop: 87.4, valueSize: 4.2, nomeSize: 2.7, valueMaxWidth: 32, nomeMaxWidth: 20 }, // 1º — centro
  1: { centerLeft: 16.53, valueTop: 73.4, nomeTop: 81.13, valueSize: 3.6, nomeSize: 2.3, valueMaxWidth: 25, nomeMaxWidth: 17 }, // 2º — esquerda
  2: { centerLeft: 83.43, valueTop: 73.37, nomeTop: 81.13, valueSize: 3.6, nomeSize: 2.3, valueMaxWidth: 25, nomeMaxWidth: 17 }, // 3º — direita
};
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

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'stretch' }}>
      <div
        style={{
          position: 'relative',
          flex: '1 1 320px',
          maxWidth: 460,
          aspectRatio: PODIUM_BG_RATIO,
          backgroundImage: `url(${podiumPremiumBg})`,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          borderRadius: 16,
          containerType: 'inline-size',
        }}
      >
        {top3.map((row, rank) => (
          <PodiumPhoto key={row.matricula} rank={rank} row={row} />
        ))}
        {top3.map((row, rank) => (
          <PodiumText key={row.matricula} rank={rank} row={row} getValue={getValue} formatValue={formatValue} />
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

function PodiumPhoto<T extends StaircaseRow>({ rank, row }: { rank: number; row: T }) {
  const spot = CIRCLE_SPOTS[rank];
  if (!spot) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: `${spot.left}%`,
        top: `${spot.top}%`,
        width: `${spot.diameter}%`,
        aspectRatio: '1/1',
        transform: 'translate(-50%,-50%)',
        borderRadius: '50%',
        overflow: 'hidden',
        background: '#e5e7eb',
      }}
    >
      {row.foto && <img src={row.foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
    </div>
  );
}

function PodiumText<T extends StaircaseRow>({
  rank,
  row,
  getValue,
  formatValue,
}: {
  rank: number;
  row: T;
  getValue: (r: T) => number;
  formatValue: (v: number) => string;
}) {
  const spot = TEXT_SPOTS[rank];
  if (!spot) return null;
  const textShadow = '0 1px 4px rgba(0,0,0,.75), 0 0 2px rgba(0,0,0,.6)';
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: `${spot.centerLeft}%`,
          top: `${spot.valueTop}%`,
          width: `${spot.valueMaxWidth}%`,
          transform: 'translate(-50%,-50%)',
          textAlign: 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 800,
          fontSize: `${spot.valueSize}cqw`,
          color: '#fff',
          textShadow,
        }}
      >
        {formatValue(getValue(row))}
      </div>
      <div
        style={{
          position: 'absolute',
          left: `${spot.centerLeft}%`,
          top: `${spot.nomeTop}%`,
          width: `${spot.nomeMaxWidth}%`,
          transform: 'translate(-50%,-50%)',
          textAlign: 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          textTransform: 'uppercase',
          fontWeight: 700,
          fontSize: `${spot.nomeSize}cqw`,
          color: '#fff',
          textShadow,
        }}
      >
        {row.apelido || row.nome}
      </div>
    </>
  );
}

// Pills stretch to fill whatever vertical space the column has (matching the
// podium's height) instead of stacking at a fixed size and leaving blank
// space below when few collaborators are listed: each row is `flex:1` with a
// generous max-height, and its own internal sizes scale with its rendered
// height (`containerType:'size'` + `cqh` units, clamped so a very short list
// doesn't blow up into oversized pills) — a short list gets fewer, taller
// pills; a full list looks the same as before.
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
            gap: 'clamp(6px, 14cqh, 12px)',
            flex: '1 1 0',
            minHeight: 38,
            maxHeight: 96,
            boxSizing: 'border-box',
            padding: '0 clamp(10px, 18cqh, 16px)',
            borderRadius: 9999,
            background: 'linear-gradient(90deg,#1D3557 0%,#2A4D80 100%)',
            containerType: 'size',
          }}
        >
          <span
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontWeight: 800,
              fontSize: 'clamp(12px, 34cqh, 20px)',
              color: '#fff',
              width: 'clamp(18px, 40cqh, 26px)',
              textAlign: 'center',
              flexShrink: 0,
            }}
          >
            {startPos + i}
          </span>
          <span
            style={{
              width: 'clamp(22px, 60cqh, 36px)',
              aspectRatio: '1/1',
              borderRadius: '50%',
              border: '2px solid #8A2BE2',
              background: '#0b0e1d',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
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
              fontSize: 'clamp(11px, 28cqh, 15px)',
              color: '#fff',
            }}
          >
            {r.apelido || r.nome}
          </span>
          <span
            style={{
              marginLeft: 'auto',
              flexShrink: 0,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 800,
              fontSize: 'clamp(11px, 28cqh, 15px)',
              color: '#64B5F6',
            }}
          >
            {formatValue(getValue(r))}
          </span>
        </div>
      ))}
    </div>
  );
}
