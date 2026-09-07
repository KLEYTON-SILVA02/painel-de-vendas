import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { computeDinamicaColaboradorProdutos, dinamicaUnidadeLabel, type DinamicaRankingRow } from '../../lib/business/dynamics';
import type { Dynamic, Sale } from '../../lib/business/types';
import { fmtMoney } from '../../lib/format';

// Dedicated ranking display for Dinâmicas (desktop DinamicasPage + mobile
// MobileDinamicasPage): a list, one row per participating collaborator —
// not just the ones who already sold something, since the point is to show
// who's IN the campaign, not only who's currently ahead — with a progress
// bar showing how much of that row's own goal (r.metaIndividual — either
// the dynamic's single shared metaValor, or that participant's own target
// in metaModo 'individual'; see computeDinamicaRanking) their realizado
// represents. This is independent of the store-wide modelo_ranking setting
// (escadinha/lista, used for Dashboard/Category/Bio rankings): Dinâmicas
// always renders this bar-list, per explicit request. Clicking a row opens
// a small popup listing the products that collaborator sold in this
// dynamic (computeDinamicaColaboradorProdutos), so din/sales are required.
export function DinamicaProgressList({
  ranking,
  isUnidade,
  din,
  sales,
  renderAction,
}: {
  ranking: DinamicaRankingRow[];
  isUnidade: boolean;
  din: Dynamic;
  sales: Sale[];
  /** Optional per-row action (e.g. mobile's "Cartão" image-export button). */
  renderAction?: (r: DinamicaRankingRow) => ReactNode;
}) {
  const [produtosMatricula, setProdutosMatricula] = useState<string | null>(null);
  const unidadeLabel = dinamicaUnidadeLabel(din);

  if (!ranking.length) {
    return <div className="text-sm text-slate-500 py-4 text-center">Nenhum colaborador participante.</div>;
  }

  const produtosRow = produtosMatricula ? ranking.find((r) => r.matricula === produtosMatricula) : null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: 8 }}>
      {ranking.map((r, i) => {
        const realizado = isUnidade ? r.itens : r.valor;
        const metaValor = r.metaIndividual;
        const rawPct = metaValor > 0 ? (realizado / metaValor) * 100 : 0;
        const barPct = Math.min(100, rawPct);
        const batida = metaValor > 0 && realizado >= metaValor;
        return (
          <div
            key={r.matricula}
            onClick={() => setProdutosMatricula(r.matricula)}
            role="button"
            tabIndex={0}
            style={{ background: '#0b0e1d', border: '1px solid #212948', borderRadius: 14, padding: '10px 12px', cursor: 'pointer' }}
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
                {isUnidade ? `${realizado} ${unidadeLabel}` : fmtMoney(realizado)}
                {metaValor > 0 && ` · ${rawPct.toFixed(0)}%`}
              </div>
              {renderAction && (
                <div style={{ flexShrink: 0 }} onClick={(e: MouseEvent) => e.stopPropagation()}>
                  {renderAction(r)}
                </div>
              )}
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

      {produtosRow && (
        <DinamicaColaboradorProdutosModal
          row={produtosRow}
          din={din}
          sales={sales}
          isUnidade={isUnidade}
          unidadeLabel={unidadeLabel}
          onClose={() => setProdutosMatricula(null)}
        />
      )}
    </div>
  );
}

function DinamicaColaboradorProdutosModal({
  row,
  din,
  sales,
  isUnidade,
  unidadeLabel,
  onClose,
}: {
  row: DinamicaRankingRow;
  din: Dynamic;
  sales: Sale[];
  isUnidade: boolean;
  unidadeLabel: string;
  onClose: () => void;
}) {
  const linhas = useMemo(() => computeDinamicaColaboradorProdutos(din, sales, row.matricula), [din, sales, row.matricula]);

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            {row.foto ? (
              <img src={row.foto} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1c2340' }} />
            )}
            <div className="font-semibold text-sm truncate">{row.apelido || row.nome}</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-rose-400 text-sm">
            ✕
          </button>
        </div>
        <div className="text-xs text-slate-400 mb-2">Produtos vendidos nesta dinâmica</div>
        {linhas.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">Nenhuma venda registrada.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {linhas.map((l) => (
              <div key={l.produto} className="flex items-center justify-between gap-3 text-xs bg-slate-800/60 rounded-lg px-2.5 py-1.5">
                <span className="truncate">{l.produto}</span>
                <span className="font-mono font-semibold flex-shrink-0" style={{ color: '#ffb700' }}>
                  {isUnidade ? `${l.qtd} ${unidadeLabel}` : fmtMoney(l.valor)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
