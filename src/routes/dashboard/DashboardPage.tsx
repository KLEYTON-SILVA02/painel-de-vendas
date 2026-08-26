import { PodiumStaircase } from '../../components/ranking/PodiumStaircase';
import { DateRangeControls } from '../../components/DateRangeControls';
import { CAT_KEYS, type CategoryKey } from '../../lib/business/classification';
import { effectiveMetaGeral, getGoal, getSuperMeta } from '../../lib/business/goals';
import { catTotals, computeSummary } from '../../lib/business/summary';
import { monthFirstISO, monthLastISO } from '../../lib/dateRange';
import { fmtMoney } from '../../lib/format';
import { useCollaborators, useGoals, useSales, useStore, useStoreSettings } from '../../lib/queries';
import { useDateRange } from '../DateRangeContext';

const CAT_LABEL: Record<CategoryKey, string> = {
  DERM: 'Dermocosméticos',
  GEN: 'Genérico & Similar',
  MP: 'Marcas Exclusivas',
  MER: 'Mercadoria Geral',
};
const CAT_COLOR: Record<CategoryKey, string> = {
  DERM: '#ff3df0',
  GEN: '#14ff00',
  MP: '#a82bff',
  MER: '#ff6a00',
};

export function DashboardPage() {
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: goals } = useGoals();
  const { data: storeSettings } = useStoreSettings();
  const { data: store } = useStore();
  const { dashFrom, dashTo, refYear, refMonth } = useDateRange();

  if (!collaborators || !sales || !goals || !storeSettings) {
    return <div className="text-sm text-slate-500 p-6">Carregando…</div>;
  }

  const modoDia = dashFrom === dashTo;
  const mode = modoDia ? 'dia' : 'mes';

  const ranking = computeSummary(sales, collaborators, dashFrom, dashTo);
  const totalValor = ranking.reduce((a, r) => a + r.valor, 0);
  const totalItens = ranking.reduce((a, r) => a + r.itens, 0);

  const metaGeral = effectiveMetaGeral(goals, mode, sales, collaborators, storeSettings.meta_geral_fallback);
  const metaSuper = getSuperMeta(goals.MER, mode, sales, collaborators);
  const atingiuMeta = metaGeral > 0 && totalValor >= metaGeral;
  const saldo = totalValor - metaGeral;

  let pct: number;
  let marker: number | null = null;
  let metaLabel: string;
  let faltaLabel: string;
  let faltaValor: number;
  let metaExibida: number;
  if (atingiuMeta && metaSuper > metaGeral) {
    pct = Math.min(100, (totalValor / metaSuper) * 100);
    marker = (metaGeral / metaSuper) * 100;
    metaLabel = 'Super Meta';
    metaExibida = metaSuper;
    faltaValor = Math.max(0, metaSuper - totalValor);
    faltaLabel = 'Falta p/ Super Meta';
  } else {
    pct = metaGeral > 0 ? Math.min(100, (totalValor / metaGeral) * 100) : 0;
    metaLabel = modoDia ? 'Meta Diária' : 'Meta Geral';
    metaExibida = metaGeral;
    faltaValor = Math.max(0, metaGeral - totalValor);
    faltaLabel = 'Falta p/ Meta';
  }

  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

  const monthFirst = monthFirstISO(refYear, refMonth);
  const monthLast = monthLastISO(refYear, refMonth);
  const monthRanking = computeSummary(sales, collaborators, monthFirst, monthLast);
  const campeaoSource = modoDia ? ranking : monthRanking;
  const campeao = campeaoSource.length && campeaoSource[0].valor > 0 ? campeaoSource[0] : null;

  const rankingList = ranking.filter((r) => r.valor > 0);
  const modeloRanking = storeSettings.modelo_ranking as 'escadinha' | 'lista';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <div className="flex flex-col gap-6">
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">{saudacao.toUpperCase()},</div>
              <div className="text-xl font-semibold">{store?.nome_equipe || 'Equipe'}</div>
              <div className="text-sm text-slate-500">Painel Geral</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400">Atingim. período</div>
              <div className="text-2xl font-mono font-bold text-cyan-400">{pct.toFixed(0)}%</div>
            </div>
          </div>
          <div className="mb-2">
            <div className="text-xs text-slate-400">⭐ Venda total do período</div>
            <div className="text-3xl font-mono font-bold">{fmtMoney(totalValor)}</div>
          </div>
          <div className="relative h-2.5 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500" style={{ width: `${pct}%` }} />
            {marker !== null && (
              <div className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-amber-400" style={{ left: `${marker}%` }} />
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-cyan-400 font-semibold text-sm">🏆 Ranking Geral de Vendas</h3>
            <DateRangeControls />
          </div>
          <PodiumStaircase
            ranking={rankingList}
            getValue={(r) => r.valor}
            formatValue={fmtMoney}
            variant={modeloRanking}
          />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold mb-3 text-slate-300">Categorias</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {CAT_KEYS.map((k) => {
              const t = catTotals(sales, dashFrom, dashTo, k);
              const goal = getGoal(goals[k], mode, sales, collaborators);
              const gaugePct = goal > 0 ? Math.min(100, (t.valor / goal) * 100) : 0;
              return (
                <div key={k} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="text-xs font-medium mb-1" style={{ color: CAT_COLOR[k] }}>
                    {CAT_LABEL[k]}
                  </div>
                  <div className="text-sm font-mono mb-2">{fmtMoney(t.valor)}</div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${gaugePct}%`, background: CAT_COLOR[k] }} />
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">{gaugePct.toFixed(0)}% da meta</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {campeao && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-center gap-3">
            {campeao.foto ? (
              <img src={campeao.foto} alt="" className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-slate-700" />
            )}
            <div>
              <div className="text-xs text-amber-400">👑 {modoDia ? 'Campeão do dia' : 'Campeão do mês'}</div>
              <div className="font-semibold text-sm">{campeao.apelido || campeao.nome}</div>
              <div className="text-xs text-slate-400">
                {fmtMoney(campeao.valor)} · {campeao.itens} it.
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <StatCard label={metaLabel + (atingiuMeta ? ' ✓' : '')} value={fmtMoney(metaExibida)} color="cyan" />
          <StatCard label={faltaLabel} value={fmtMoney(faltaValor)} color="purple" />
          <StatCard label="Saldo" value={`${saldo >= 0 ? '' : '-'}${fmtMoney(Math.abs(saldo))}`} color={saldo >= 0 ? 'gold' : 'pink'} />
          <StatCard label="Itens Vendidos" value={`${totalItens} un.`} color="green" />
        </div>
      </div>
    </div>
  );
}

const STAT_COLORS: Record<string, string> = {
  cyan: 'text-cyan-400',
  purple: 'text-purple-400',
  gold: 'text-amber-400',
  pink: 'text-pink-400',
  green: 'text-green-400',
};

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="text-[11px] text-slate-400 mb-1">{label}</div>
      <div className={`text-sm font-mono font-semibold ${STAT_COLORS[color] || ''}`}>{value}</div>
    </div>
  );
}
