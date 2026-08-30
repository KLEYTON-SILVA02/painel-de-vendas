import { podiumHeightPx } from '../../lib/business/ranking';

export interface StaircaseRow {
  matricula: string;
  nome: string;
  apelido: string | null;
  foto: string | null;
}

// Ported 1:1 from legacy/index-original.html (renderStaircase()). Three
// distinct visual variants, matched exactly by CSS pixel/color values:
//  - 'lista'                       → .rank-list / .rank-list-item
//  - 'escadinha' + getSub          → .podium-wrap / .pc-card (BIOSINTÉTICA, Dinâmicas)
//  - 'escadinha' without getSub    → .rank-grid / .rc-card, the 4-layer capsule (§11.2)

const POS_COLORS: Record<'pos1' | 'pos2' | 'pos3' | 'posx', { fundo: string; capaFrom: string; capaTo: string }> = {
  pos1: { fundo: '#a16207', capaFrom: '#ffd700', capaTo: '#d49b00' },
  pos2: { fundo: '#475569', capaFrom: '#e2e8f0', capaTo: '#94a3b8' },
  pos3: { fundo: '#7c2d12', capaFrom: '#f97316', capaTo: '#c2410c' },
  posx: { fundo: '#0f172a', capaFrom: '#3b5bdb', capaTo: '#1e3a8a' },
};

const PC_GRADIENTS: Record<'p1' | 'p2' | 'p3' | 'px', string> = {
  p1: 'linear-gradient(180deg,#ffe066,#c9960b)',
  p2: 'linear-gradient(180deg,#f0f2f6,#8f97a6)',
  p3: 'linear-gradient(180deg,#ff9d4d,#c25a00)',
  px: 'linear-gradient(180deg,#3f6bd6,#12224f)',
};
// Darker base tone (mirrors POS_COLORS' fundo) revealed through the gap
// between the two PC_GRADIENTS cap layers below — the "cut" behind the
// placement badge, same technique as the default capsule variant.
const PC_BASE: Record<'p1' | 'p2' | 'p3' | 'px', string> = {
  p1: '#8a6200',
  p2: '#4b5563',
  p3: '#7c2d12',
  px: '#0f172a',
};

function posClass(i: number): 'pos1' | 'pos2' | 'pos3' | 'posx' {
  return i === 0 ? 'pos1' : i === 1 ? 'pos2' : i === 2 ? 'pos3' : 'posx';
}
function pClass(i: number): 'p1' | 'p2' | 'p3' | 'px' {
  return i === 0 ? 'p1' : i === 1 ? 'p2' : i === 2 ? 'p3' : 'px';
}

export function PodiumStaircase<T extends StaircaseRow>({
  ranking,
  getValue,
  formatValue,
  variant,
  getSub,
}: {
  ranking: T[];
  getValue: (r: T) => number;
  formatValue: (v: number) => string;
  variant: 'escadinha' | 'lista';
  /** Optional secondary label shown under the name (e.g. BIOSINTÉTICA's unit count).
   * Its presence switches the escadinha variant to the simpler .pc-card design. */
  getSub?: (r: T) => string;
}) {
  if (!ranking.length) {
    return <div className="text-sm text-slate-500 py-6 text-center">Sem vendas para este período.</div>;
  }

  if (variant === 'lista') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ranking.map((r, i) => (
          <div
            key={r.matricula}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: '#0b0e1d',
              border: '1px solid #212948',
              borderRadius: 14,
              padding: '8px 12px',
            }}
          >
            <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 13, color: '#ffb700', width: 22, flexShrink: 0, textAlign: 'center' }}>{i + 1}</div>
            <Avatar foto={r.foto} size={32} border="2px solid #00f0ff" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.apelido || r.nome}</div>
              {getSub && <div style={{ fontSize: 10.5, color: '#8b90bf' }}>{getSub(r)}</div>}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, color: '#ffb700', flexShrink: 0 }}>{formatValue(getValue(r))}</div>
          </div>
        ))}
      </div>
    );
  }

  const isBioVariant = !!getSub;

  if (isBioVariant) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', width: '100%', flexWrap: 'wrap' }}>
        {ranking.map((r, i) => {
          const pc = pClass(i);
          return (
            <div key={r.matricula} style={{ flex: '1 1 0', minWidth: 64, maxWidth: 150, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: '#fff',
                  marginBottom: 6,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                }}
              >
                {formatValue(getValue(r))}
              </div>
              <div
                style={{
                  width: '100%',
                  height: 150,
                  borderRadius: '44px 44px 12px 12px',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  paddingTop: 34,
                  boxShadow: '0 4px 14px rgba(0,0,0,.35)',
                  background: PC_BASE[pc],
                  overflow: 'hidden',
                }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 78, zIndex: 1, background: PC_GRADIENTS[pc] }} />
                <div style={{ position: 'absolute', top: 87, left: 0, right: 0, bottom: 0, zIndex: 1, background: PC_GRADIENTS[pc] }} />
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: '50%',
                    background: '#fff',
                    border: '2px solid rgba(255,255,255,.6)',
                    overflow: 'hidden',
                    position: 'absolute',
                    top: 12,
                    zIndex: 2,
                    flexShrink: 0,
                  }}
                >
                  {r.foto && <img src={r.foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    background: '#5b1a8c',
                    border: '2px solid rgba(255,255,255,.5)',
                    clipPath: 'polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 13,
                    color: '#fff',
                    position: 'absolute',
                    top: 66,
                    zIndex: 3,
                  }}
                >
                  {i + 1}
                </div>
                <div
                  style={{
                    position: 'absolute',
                    top: 104,
                    fontSize: 10.5,
                    fontWeight: 800,
                    color: '#fff',
                    textTransform: 'uppercase',
                    textAlign: 'center',
                    width: '90%',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    zIndex: 2,
                  }}
                >
                  {r.apelido || r.nome}
                </div>
                <div style={{ position: 'absolute', bottom: 8, fontSize: 9.5, color: 'rgba(255,255,255,.9)', fontWeight: 700, zIndex: 2 }}>
                  {getSub(r)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${ranking.length},1fr)`,
        gap: 10,
        alignItems: 'flex-end',
        width: '100%',
        minHeight: 230,
        overflowX: 'auto',
        overflowY: 'visible',
      }}
    >
      {ranking.map((r, i) => {
        const pos = posClass(i);
        const colors = POS_COLORS[pos];
        const height = podiumHeightPx(i);
        return (
          <div key={r.matricula} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 64 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#fff',
                textAlign: 'center',
                marginBottom: 6,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
              }}
            >
              {formatValue(getValue(r))}
            </div>
            <div style={{ position: 'relative', width: '100%', boxSizing: 'border-box', height }}>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 1,
                  background: colors.fundo,
                  borderTopLeftRadius: 9999,
                  borderTopRightRadius: 9999,
                  borderBottomLeftRadius: 6,
                  borderBottomRightRadius: 6,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 70,
                  zIndex: 2,
                  background: `linear-gradient(180deg,${colors.capaFrom} 0%,${colors.capaTo} 100%)`,
                  borderTopLeftRadius: 9999,
                  borderTopRightRadius: 9999,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 83,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 2,
                  background: `linear-gradient(180deg,${colors.capaFrom} 0%,${colors.capaTo} 100%)`,
                  borderBottomLeftRadius: 6,
                  borderBottomRightRadius: 6,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 10,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 3,
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: '#ffffff',
                  border: '3px solid #581c87',
                  overflow: 'hidden',
                }}
              >
                {r.foto && <img src={r.foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div
                style={{
                  position: 'absolute',
                  top: 59,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 4,
                  width: 30,
                  height: 34,
                  clipPath: 'polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)',
                  background: '#581c87',
                  outline: '2px solid #eab308',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                {i + 1}
              </div>
              <div
                style={{
                  position: 'absolute',
                  bottom: 10,
                  left: 0,
                  right: 0,
                  zIndex: 4,
                  textAlign: 'center',
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: '#ffffff',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  padding: '0 4px',
                  boxSizing: 'border-box',
                }}
              >
                {r.apelido || r.nome}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Avatar({ foto, size, border }: { foto: string | null; size: number; border: string }) {
  return foto ? (
    <img src={foto} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border, flexShrink: 0 }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#0b0e1d', border, flexShrink: 0 }} />
  );
}
