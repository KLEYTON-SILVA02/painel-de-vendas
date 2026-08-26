import { medalClass, podiumHeightPx } from '../../lib/business/ranking';

export interface StaircaseRow {
  matricula: string;
  nome: string;
  apelido: string | null;
  foto: string | null;
}

const MEDAL_STYLES: Record<string, string> = {
  gold: 'border-amber-400 shadow-amber-400/30',
  silver: 'border-slate-300 shadow-slate-300/20',
  bronze: 'border-amber-700 shadow-amber-700/20',
};

const MEDAL_BADGE: Record<string, string> = {
  gold: 'bg-amber-400 text-slate-950',
  silver: 'bg-slate-300 text-slate-950',
  bronze: 'bg-amber-700 text-slate-950',
};

function Avatar({ foto, size = 56 }: { foto: string | null; size?: number }) {
  return foto ? (
    <img src={foto} alt="" className="rounded-full object-cover border-2 border-slate-900" style={{ width: size, height: size }} />
  ) : (
    <div
      className="rounded-full bg-slate-700 border-2 border-slate-900"
      style={{ width: size, height: size }}
    />
  );
}

export function PodiumStaircase<T extends StaircaseRow>({
  ranking,
  getValue,
  formatValue,
  variant,
}: {
  ranking: T[];
  getValue: (r: T) => number;
  formatValue: (v: number) => string;
  variant: 'escadinha' | 'lista';
}) {
  if (!ranking.length) {
    return <div className="text-sm text-slate-500 py-6 text-center">Sem vendas para este período.</div>;
  }

  if (variant === 'lista') {
    return (
      <div className="flex flex-col gap-2">
        {ranking.map((r, i) => (
          <div key={r.matricula} className="flex items-center gap-3 rounded-lg bg-slate-900/60 border border-slate-800 px-3 py-2">
            <div className="w-6 text-center text-sm text-slate-400 font-medium">{i + 1}</div>
            <Avatar foto={r.foto} size={36} />
            <div className="flex-1 text-sm font-medium">{r.apelido || r.nome}</div>
            <div className="text-sm font-mono text-slate-200">{formatValue(getValue(r))}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-end gap-3 overflow-x-auto pb-2 pt-8" style={{ minHeight: 316 }}>
      {ranking.map((r, i) => {
        const medal = medalClass(i);
        const height = podiumHeightPx(i);
        return (
          <div key={r.matricula} className="flex flex-col items-center shrink-0" style={{ width: 96 }}>
            <div className="text-xs font-mono text-slate-300 mb-7 text-center">{formatValue(getValue(r))}</div>
            <div
              className={`relative w-full rounded-2xl border-2 flex flex-col items-center justify-end pb-2 bg-gradient-to-b from-slate-800 to-slate-900 shadow-lg ${medal ? MEDAL_STYLES[medal] : 'border-slate-700'}`}
              style={{ height }}
            >
              <div className="absolute -top-6">
                <Avatar foto={r.foto} size={48} />
              </div>
              <div
                className={`absolute -top-2 -right-1 w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center ${medal ? MEDAL_BADGE[medal] : 'bg-slate-700 text-slate-200'}`}
              >
                {i + 1}
              </div>
              <div className="text-xs font-medium text-center px-1 truncate w-full mt-6">{r.apelido || r.nome}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
