import podiumPremiumBg from '../../assets/ranking/podium-premium-bg.jpg';
import type { StaircaseRow } from './PodiumStaircase';

// "Ranking Geral de Vendas" — new split layout (top-3 over the ADM-supplied
// podium artwork on the left, positions 4-15 as a two-column pill grid on
// the right), toggled on via store_settings.ranking_moderno alongside the
// older PodiumStaircase design it doesn't replace. The podium image is a
// fixed background (silver/gold/bronze pedestals, crown baked in) — the
// system only overlays each collaborator's photo into that image's own
// blank white circle, at the exact position/size measured on the source
// artwork (percentages of the image's own width/height, so they stay
// correct at any render size as long as the container keeps the image's
// aspect ratio — see `aspectRatio` below).
const PODIUM_BG_RATIO = 2000 / 1669;
const CIRCLE_SPOTS: Record<number, { left: number; top: number; diameter: number }> = {
  0: { left: 49.98, top: 45.88, diameter: 16.86 }, // 1º — centro
  1: { left: 16.72, top: 48.28, diameter: 16.78 }, // 2º — esquerda
  2: { left: 83.83, top: 47.95, diameter: 16.4 }, // 3º — direita
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
        }}
      >
        {top3.map((row, rank) => (
          <PodiumPhoto key={row.matricula} rank={rank} row={row} />
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
