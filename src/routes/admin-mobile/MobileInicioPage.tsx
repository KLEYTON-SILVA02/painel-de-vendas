import { useMemo, useState } from 'react';
import { PodiumStaircase } from '../../components/ranking/PodiumStaircase';
import { RankingImageModal } from '../../components/ranking/RankingImageModal';
import { CAT_KEYS, type CategoryKey } from '../../lib/business/classification';
import { computeChampionStars, type ChampionStar } from '../../lib/business/champion';
import { effectiveMetaGeral, getGoal, getSuperMeta, goalProration } from '../../lib/business/goals';
import { catTotals, computeSummary } from '../../lib/business/summary';
import type { SummaryRow } from '../../lib/business/types';
import { generateChampionCardBlob } from '../../lib/championImage';
import { monthFirstISO, monthLastISO } from '../../lib/dateRange';
import { fmtMoney, monthName } from '../../lib/format';
import { tryCopyImage } from '../../lib/rankingImage';
import { useCollaborators, useDynamics, useGoals, useSales, useSpecialLists, useStore, useStoreSettings } from '../../lib/queries';
import { useDateRange } from '../DateRangeContext';
import { GoalGauge } from './GoalGauge';
import { MobileDailyEvolutionChart } from './MobileDailyEvolutionChart';
import { MobileDateFilter } from './MobileDateFilter';

const CAT_LABEL: Record<CategoryKey, string> = { DERM: 'Dermocosméticos', GEN: 'Genéricos', MP: 'Marcas Excl.', MER: 'Merc. Geral' };
const CAT_COLOR: Record<CategoryKey, string> = { DERM: '#b84c9c', GEN: '#698b46', MP: '#813c97', MER: '#f26122' };

export function MobileInicioPage() {
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: goals } = useGoals();
  const { data: storeSettings } = useStoreSettings();
  const { data: specialLists } = useSpecialLists();
  const { data: dynamics } = useDynamics();
  const { data: store } = useStore();
  const { dashFrom, dashTo, refYear, refMonth, rankFilter, modoGeral } = useDateRange();

  // Safe stand-ins so the useMemo calls below always run in the same order
  // (Rules of Hooks) whether or not every query has resolved yet — the
  // "Carregando…" guard comes after them, not before. Mobile CPUs feel the
  // cost of these full `sales` scans much more than desktop does, so
  // keeping them out of every unrelated render (a toast, a modal) matters
  // more here, not less.
  const salesData = sales ?? [];
  const collaboratorsData = collaborators ?? [];

  const modoDia = dashFrom === dashTo;
  const mode = modoDia ? 'dia' : 'mes';
  const proration = useMemo(() => goalProration(dashFrom, dashTo, modoGeral), [dashFrom, dashTo, modoGeral]);
  const monthFirst = monthFirstISO(refYear, refMonth);
  const monthLast = monthLastISO(refYear, refMonth);
  const campeaoFrom = modoDia ? dashFrom : monthFirst;
  const campeaoTo = modoDia ? dashTo : monthLast;
  // Follows the same shared rankFilter as the desktop dashboard's category
  // filter — 'ALL' and dynamics fall back to the overall best seller.
  const isUnitChampionCat = rankFilter === 'LEVMEL' || rankFilter === 'CHIP';
  const championCatFilter = rankFilter === 'ALL' || rankFilter.startsWith('DIN:') ? undefined : (rankFilter as CategoryKey | 'LEVMEL' | 'CHIP');

  const ranking = useMemo(
    () => computeSummary(salesData, collaboratorsData, dashFrom, dashTo, undefined, specialLists),
    [salesData, collaboratorsData, dashFrom, dashTo, specialLists],
  );
  const totalValor = ranking.reduce((a, r) => a + r.valor, 0);
  const totalItens = ranking.reduce((a, r) => a + r.itens, 0);
  const rankingList = ranking.filter((r) => r.valor > 0).slice(0, 10);

  const gaugeData = useMemo(() => {
    if (!goals) return [];
    return CAT_KEYS.map((k) => {
      const t = k === 'MER' ? { valor: totalValor, qtd: totalItens } : catTotals(salesData, dashFrom, dashTo, k);
      const goal = getGoal(goals[k], mode, salesData, collaboratorsData, proration);
      return { key: k, valor: t.valor, goal };
    });
  }, [salesData, collaboratorsData, goals, dashFrom, dashTo, mode, proration, totalValor, totalItens]);

  const campeaoSource = useMemo(
    () => computeSummary(salesData, collaboratorsData, campeaoFrom, campeaoTo, championCatFilter, specialLists),
    [salesData, collaboratorsData, campeaoFrom, campeaoTo, championCatFilter, specialLists],
  );
  const campeao =
    campeaoSource.length && (isUnitChampionCat ? campeaoSource[0].itens > 0 : campeaoSource[0].valor > 0) ? campeaoSource[0] : null;
  const campeaoMatricula = campeao?.matricula;
  const campeaoStars = useMemo(
    () =>
      campeaoMatricula
        ? computeChampionStars(campeaoMatricula, salesData, collaboratorsData, specialLists, campeaoFrom, campeaoTo)
        : null,
    [campeaoMatricula, salesData, collaboratorsData, specialLists, campeaoFrom, campeaoTo],
  );

  if (!collaborators || !sales || !goals || !storeSettings || !specialLists || !dynamics) {
    return <div style={{ padding: 24, fontSize: 12, color: 'var(--mv2-texto-2)' }}>Carregando…</div>;
  }

  const metaGeral = effectiveMetaGeral(goals, mode, sales, collaborators, storeSettings.meta_geral_fallback, proration);
  const metaSuper = getSuperMeta(goals.MER, mode, sales, collaborators, proration);
  const atingiuMeta = metaGeral > 0 && totalValor >= metaGeral;
  const saldo = totalValor - metaGeral;
  const pct = metaGeral > 0 ? Math.min(999, (totalValor / metaGeral) * 100) : 0;
  let faltaLabel = 'Falta p/ Meta';
  let faltaValor = Math.max(0, metaGeral - totalValor);
  if (atingiuMeta && metaSuper > metaGeral) {
    faltaLabel = 'Falta p/ Super Meta';
    faltaValor = Math.max(0, metaSuper - totalValor);
  }

  const campeaoLabel = modoDia ? `Campeão do dia` : `Campeão — ${monthName(refMonth)}/${refYear}`;

  return (
    <div>
      <div className="mv2-sales-summary">
        <div>
          <div className="mv2-label">Venda total do período</div>
          <div className="mv2-value">{fmtMoney(totalValor)}</div>
        </div>
        <div className="mv2-target">
          <div className="mv2-label">Atingimento</div>
          <div className="mv2-value">{pct.toFixed(0)}%</div>
        </div>
      </div>

      <div className="mv2-metrics-grid">
        <div className="mv2-metric-card mv2-meta">
          <div className="mv2-label">Meta Geral</div>
          <div className="mv2-value">{fmtMoney(metaGeral)}</div>
        </div>
        <div className="mv2-metric-card mv2-falta">
          <div className="mv2-label">{faltaLabel}</div>
          <div className="mv2-value">{fmtMoney(faltaValor)}</div>
        </div>
        <div className="mv2-metric-card mv2-saldo">
          <div className="mv2-label">Saldo</div>
          {/* Sign hidden by design (visual only) — the underlying `saldo`
              stays negative for every calculation elsewhere. */}
          <div className="mv2-value">{fmtMoney(Math.abs(saldo))}</div>
        </div>
        <div className="mv2-metric-card mv2-itens">
          <div className="mv2-label">Itens vendidos</div>
          <div className="mv2-value">{totalItens} un.</div>
        </div>
      </div>

      <MobileDateFilter />

      {campeao && (
        <MobileChampionCard campeao={campeao} campeaoLabel={campeaoLabel} campeaoStars={campeaoStars} storeName={store?.nome_loja} />
      )}

      <div style={{ margin: '0 18px 16px' }}>
        <PodiumStaircase ranking={rankingList} getValue={(r) => r.valor} formatValue={fmtMoney} variant={storeSettings.modelo_ranking as 'escadinha' | 'lista'} />
      </div>

      <MobileDailyEvolutionChart
        salesData={salesData}
        collaboratorsData={collaboratorsData}
        goals={goals}
        specialLists={specialLists}
        monthFirst={monthFirst}
        monthLast={monthLast}
      />

      <div className="mv2-goals-grid">
        {gaugeData.map((g) => {
          const gaugePct = g.goal > 0 ? Math.min(100, (g.valor / g.goal) * 100) : 0;
          return (
            <div key={g.key} className="mv2-goal-item">
              <GoalGauge pct={gaugePct} color={CAT_COLOR[g.key]} />
              <div className="mv2-goal-name">{CAT_LABEL[g.key]}</div>
              <div className="mv2-goal-value">{fmtMoney(g.valor)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MobileChampionCard({
  campeao,
  campeaoLabel,
  campeaoStars,
  storeName,
}: {
  campeao: SummaryRow;
  campeaoLabel: string;
  campeaoStars: ChampionStar[] | null;
  storeName: string | undefined;
}) {
  const [generating, setGenerating] = useState(false);
  const [imageModal, setImageModal] = useState<{ url: string; copied: boolean } | null>(null);

  async function handleGenerateImage() {
    setGenerating(true);
    try {
      const blob = await generateChampionCardBlob({
        nome: campeao.apelido || campeao.nome,
        label: campeaoLabel,
        valorLabel: fmtMoney(campeao.valor),
        itensLabel: `${campeao.itens} it.`,
        foto: campeao.foto,
        stars: campeaoStars ?? [],
        storeName,
      });
      if (!blob) return;
      const wasCopied = await tryCopyImage(blob);
      setImageModal({ url: URL.createObjectURL(blob), copied: wasCopied });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="mv2-champion-card">
      {campeao.foto ? <img src={campeao.foto} alt="" className="mv2-avatar" /> : <div className="mv2-avatar" />}
      <div className="mv2-info">
        <div className="mv2-badge">👑 {campeaoLabel}</div>
        <div className="mv2-name">{campeao.apelido || campeao.nome}</div>
        {campeaoStars && (
          <div className="mv2-stars" title={campeaoStars.map((s) => `${s.achieved ? '✓' : '✗'} ${s.label}`).join(' · ')}>
            {campeaoStars.map((s) => (
              <span key={s.key} style={{ opacity: s.achieved ? 1 : 0.25 }}>
                ★
              </span>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={handleGenerateImage}
        disabled={generating}
        title="Gerar imagem do card de campeão"
        style={{ background: 'var(--mv2-dourado)', color: '#080a08', border: 'none', borderRadius: 8, padding: '6px 8px', fontSize: 11, flexShrink: 0 }}
      >
        {generating ? '…' : '🖼️'}
      </button>

      {imageModal && (
        <RankingImageModal
          url={imageModal.url}
          copied={imageModal.copied}
          onClose={() => setImageModal(null)}
          title={`Card de Campeão — ${campeao.apelido || campeao.nome}`}
          filename="card-campeao.png"
          alt="Card de campeão"
        />
      )}
    </div>
  );
}
