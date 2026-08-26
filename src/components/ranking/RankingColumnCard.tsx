import type { ColumnRankingRow } from '../../lib/business/ranking';
import { medalClass } from '../../lib/business/ranking';

const MEDAL_RING: Record<string, string> = {
  gold: 'ring-2 ring-amber-400',
  silver: 'ring-2 ring-slate-300',
  bronze: 'ring-2 ring-amber-700',
};

export function RankingColumnCard({
  title,
  color,
  ranking,
  isUnit,
}: {
  title: string;
  color: string;
  ranking: ColumnRankingRow[];
  isUnit: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 flex flex-col min-w-[220px]">
      <div className="text-sm font-semibold mb-2 pb-2 border-b" style={{ color, borderColor: color }}>
        {title}
      </div>
      <div className="flex flex-col gap-2 flex-1">
        {ranking.length === 0 ? (
          <div className="text-xs text-slate-500 py-4 text-center">Sem vendas.</div>
        ) : (
          ranking.map((r, i) => {
            const medal = medalClass(i);
            return (
              <div key={r.matricula} className="flex items-center gap-2">
                <div className={`w-5 h-5 shrink-0 rounded-full text-[10px] font-bold flex items-center justify-center bg-slate-800 text-slate-300 ${medal ? MEDAL_RING[medal] : ''}`}>
                  {i + 1}
                </div>
                {r.foto ? (
                  <img src={r.foto} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-slate-700 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{r.apelido || r.nome}</div>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(100, r.pct ?? 0)}%`, background: color }}
                      />
                    </div>
                    <div className="text-[10px] text-slate-400 tabular-nums w-8 text-right">
                      {r.pct !== null ? `${r.pct.toFixed(0)}%` : '—'}
                    </div>
                  </div>
                </div>
                <div className="text-[11px] font-mono text-slate-200 shrink-0">
                  {isUnit ? `${r.itens} un.` : r.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
