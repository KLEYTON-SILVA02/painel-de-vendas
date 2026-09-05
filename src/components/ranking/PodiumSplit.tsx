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
//
// Both the background and every position below are overridable per store
// (Configurações → Aparência do Ranking → "varinha mágica") — see
// `PodiumRankSpot`/`DEFAULT_PODIUM_SPOTS`. `bgUrl`/`spots` are what an ADM
// calibrated for their own custom artwork; omitted/null falls back to the
// stock artwork and its measured defaults, so stores that never open the
// calibration tool are unaffected.
export const PODIUM_BG_RATIO = 2000 / 1669;

export interface PodiumRankSpot {
  left: number;
  top: number;
  diameter: number;
  valueLeft: number;
  valueTop: number;
  valueSize: number;
  valueMaxWidth: number;
  nomeLeft: number;
  nomeTop: number;
  nomeSize: number;
  nomeMaxWidth: number;
}
export type PodiumSpots = Record<0 | 1 | 2, PodiumRankSpot>;

export const DEFAULT_PODIUM_SPOTS: PodiumSpots = {
  0: {
    left: 49.98,
    top: 45.39,
    diameter: 16.95, // 1º — centro
    valueLeft: 49.98,
    valueTop: 77.95,
    valueSize: 4.2,
    valueMaxWidth: 32,
    nomeLeft: 49.98,
    nomeTop: 87.4,
    nomeSize: 2.7,
    nomeMaxWidth: 20,
  },
  1: {
    left: 18.9,
    top: 48.29,
    diameter: 18.4, // 2º — esquerda
    valueLeft: 16.53,
    valueTop: 73.4,
    valueSize: 3.6,
    valueMaxWidth: 25,
    nomeLeft: 16.53,
    nomeTop: 81.13,
    nomeSize: 2.3,
    nomeMaxWidth: 17,
  },
  2: {
    left: 86.12,
    top: 47.66,
    diameter: 17.75, // 3º — direita
    valueLeft: 83.43,
    valueTop: 73.37,
    valueSize: 3.6,
    valueMaxWidth: 25,
    nomeLeft: 83.43,
    nomeTop: 81.13,
    nomeSize: 2.3,
    nomeMaxWidth: 17,
  },
};

const MAX_LISTED = 15;
const PILL_HEIGHT = 38;

interface PillSlot<T> {
  row: T | null;
  pos: number;
}

export function PodiumSplit<T extends StaircaseRow>({
  ranking,
  getValue,
  formatValue,
  bgUrl,
  spots,
}: {
  ranking: T[];
  getValue: (r: T) => number;
  formatValue: (v: number) => string;
  /** Custom podium background URL calibrated in Configurações; falls back to the stock artwork when absent. */
  bgUrl?: string | null;
  /** Custom circle/text positions calibrated for `bgUrl`; falls back to the measured defaults when absent. */
  spots?: PodiumSpots | null;
}) {
  if (!ranking.length) {
    return <div className="text-sm text-slate-500 py-6 text-center">Sem vendas para este período.</div>;
  }

  const effectiveBg = bgUrl || podiumPremiumBg;
  const effectiveSpots = spots || DEFAULT_PODIUM_SPOTS;
  const top3 = ranking.slice(0, 3);
  const rest = ranking.slice(3, MAX_LISTED);
  // Split into two even columns instead of always filling col1 first — that
  // used to leave col2 several bars short (e.g. 9 left over → 6/3) whenever
  // the total wasn't a multiple of 2. Halving first means the two columns
  // never differ by more than one bar, and the shorter one gets a single
  // data-less placeholder slot (row: null) to match — same structural
  // height, not counted as a position/sale/collaborator, just keeps the
  // two columns' bars aligned row-for-row.
  const col1Count = Math.ceil(rest.length / 2);
  const col1: PillSlot<T>[] = rest.slice(0, col1Count).map((row, i) => ({ row, pos: 4 + i }));
  const col2: PillSlot<T>[] = rest.slice(col1Count).map((row, i) => ({ row, pos: 4 + col1Count + i }));
  while (col1.length < col2.length) col1.push({ row: null, pos: -1 });
  while (col2.length < col1.length) col2.push({ row: null, pos: -1 });

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'stretch' }}>
      <div
        style={{
          position: 'relative',
          flex: '1 1 320px',
          maxWidth: 460,
          aspectRatio: PODIUM_BG_RATIO,
          backgroundImage: `url(${effectiveBg})`,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          borderRadius: 16,
          containerType: 'inline-size',
        }}
      >
        {top3.map((row, rank) => (
          <PodiumPhoto key={row.matricula} rank={rank as 0 | 1 | 2} row={row} spots={effectiveSpots} />
        ))}
        {top3.map((row, rank) => (
          <PodiumText key={row.matricula} rank={rank as 0 | 1 | 2} row={row} getValue={getValue} formatValue={formatValue} spots={effectiveSpots} />
        ))}
      </div>

      {rest.length > 0 && (
        <div style={{ flex: '2 1 380px', display: 'flex', gap: 16, minWidth: 0 }}>
          <PillColumn slots={col1} getValue={getValue} formatValue={formatValue} />
          {col2.length > 0 && <PillColumn slots={col2} getValue={getValue} formatValue={formatValue} />}
        </div>
      )}
    </div>
  );
}

function PodiumPhoto<T extends StaircaseRow>({ rank, row, spots }: { rank: 0 | 1 | 2; row: T; spots: PodiumSpots }) {
  const spot = spots[rank];
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
  spots,
}: {
  rank: 0 | 1 | 2;
  row: T;
  getValue: (r: T) => number;
  formatValue: (v: number) => string;
  spots: PodiumSpots;
}) {
  const spot = spots[rank];
  if (!spot) return null;
  const textShadow = '0 1px 4px rgba(0,0,0,.75), 0 0 2px rgba(0,0,0,.6)';
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: `${spot.valueLeft}%`,
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
          left: `${spot.nomeLeft}%`,
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

// Pills keep their traditional fixed height (PILL_HEIGHT) regardless of how
// many rows the column has — they no longer stretch to fill the podium's
// height. The leftover vertical space is instead distributed as spacing
// between pills (justifyContent: 'space-between'), so a short list still
// uses the full column height without inflating each bar. `slots` already
// pads the shorter of the two columns with `row: null` placeholders (see
// the split above) so both columns render the same number of bars — a
// placeholder keeps the same PILL_HEIGHT box but renders no background, no
// text, no data, and isn't a real ranking position.
function PillColumn<T extends StaircaseRow>({
  slots,
  getValue,
  formatValue,
}: {
  slots: PillSlot<T>[];
  getValue: (r: T) => number;
  formatValue: (v: number) => string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: '1 1 0', minWidth: 0 }}>
      {slots.map((slot, i) =>
        slot.row === null ? (
          <div key={`placeholder-${i}`} aria-hidden="true" style={{ height: PILL_HEIGHT, flexShrink: 0 }} />
        ) : (
          <div
            key={slot.row.matricula}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: PILL_HEIGHT,
              flexShrink: 0,
              boxSizing: 'border-box',
              padding: '0 12px',
              borderRadius: 9999,
              background: 'linear-gradient(90deg,#1D3557 0%,#2A4D80 100%)',
            }}
          >
            <span style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: 13, color: '#fff', width: 20, textAlign: 'center', flexShrink: 0 }}>
              {slot.pos}
            </span>
            <span style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid #8A2BE2', background: '#0b0e1d', overflow: 'hidden', flexShrink: 0 }}>
              {slot.row.foto && <img src={slot.row.foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
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
              {slot.row.apelido || slot.row.nome}
            </span>
            <span style={{ marginLeft: 'auto', flexShrink: 0, fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: 12, color: '#64B5F6' }}>
              {formatValue(getValue(slot.row))}
            </span>
          </div>
        ),
      )}
    </div>
  );
}
