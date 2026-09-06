import type { ReactNode } from 'react';
import type { DinamicaRankingRow } from '../../lib/business/dynamics';
import { fmtMoney } from '../../lib/format';

// Dedicated ranking display for Dinâmicas (desktop DinamicasPage + mobile
// MobileDinamicasPage): a list, one row per participating collaborator —
// not just the ones who already sold something, since the point is to show
// who's IN the campaign, not only who's currently ahead — with a progress
// bar showing how much of the dynamic's shared goal (metaValor) that
// person's own realizado represents. This is independent of the store-wide
// modelo_ranking setting (escadinha/lista, used for Dashboard/Category/Bio
// rankings): Dinâmicas always renders this bar-list, per explicit request.
export function DinamicaProgressList({
  ranking,
  metaValor,
  isUnidade,
  renderAction,
}: {
  ranking: DinamicaRankingRow[];
  metaValor: number;
  isUnidade: boolean;
  /** Optional per-row action (e.g. mobile's "Cartão" image-export button). */
  renderAction?: (r: DinamicaRankingRow) => ReactNode;
}) {
  if (!ranking.length) {
    return <div className="text-sm text-slate-500 py-4 text-center">Nenhum colaborador participante.</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: 8 }}>
      {ranking.map((r, i) => {
        const realizado = isUnidade ? r.itens : r.valor;
        const rawPct = metaValor > 0 ? (realizado / metaValor) * 100 : 0;
        const barPct = Math.min(100, rawPct);
        const batida = metaValor > 0 && realizado >= metaValor;
        return (
          <div
            key={r.matricula}
            style={{ background: '#0b0e1d', border: '1px solid #212948', borderRadius: 14, padding: '10px 12px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 12, color: '#ffb700', width: 18, flexShrink: 0, textAlign: 'center' }}>
                {i + 1}
              </div>
              {r.foto ? (
                <img src={r.foto} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '2px solid #00f0ff', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1c2340', border: '2px solid #00f0ff', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.apelido || r.nome}
              </div>
              {batida && <span style={{ fontSize: 13, flexShrink: 0 }}>⭐</span>}
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: 12, color: batida ? '#14ff00' : '#ffb700', flexShrink: 0, whiteSpace: 'nowrap' }}>
                {isUnidade ? `${realizado} un.` : fmtMoney(realizado)}
                {metaValor > 0 && ` · ${rawPct.toFixed(0)}%`}
              </div>
              {renderAction && <div style={{ flexShrink: 0 }}>{renderAction(r)}</div>}
            </div>
            {metaValor > 0 && (
              <div style={{ height: 6, borderRadius: 999, background: '#1c2340', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    borderRadius: 999,
                    width: `${barPct}%`,
                    background: batida ? 'linear-gradient(90deg,#14ff00,#00c2ff)' : 'linear-gradient(90deg,#00f0ff,#a82bff)',
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
