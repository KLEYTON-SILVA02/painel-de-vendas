import { useMemo, useState } from 'react';
import { PodiumStaircase } from '../../components/ranking/PodiumStaircase';
import { RankingImageModal } from '../../components/ranking/RankingImageModal';
import { useCategoryLabelMap } from '../../lib/business/categoryLabels';
import { CAT_KEYS, type CategoryKey } from '../../lib/business/classification';
import { computeChampionStars, type ChampionStar, type ChampionStarCategory } from '../../lib/business/champion';
import { effectiveMetaGeralFromTotals, getGoalFromTotals, getSuperMetaFromTotals, goalProration } from '../../lib/business/goals';
import { computeSummary, summaryFromCategoryTotals, sumCategoryTotals } from '../../lib/business/summary';
import type { SummaryRow } from '../../lib/business/types';
import { generateChampionCardBlob } from '../../lib/championImage';
import { monthFirstISO, monthLastISO, todayISO } from '../../lib/dateRange';
import { fmtMoney, monthName } from '../../lib/format';
import { tryCopyImage } from '../../lib/rankingImage';
import {
  useCollaborators,
  useDynamics,
  useGenericConquistaConfigs,
  useGoals,
  useMobileCategoryTotals,
  useSalesInRange,
  useSpecialLists,
  useStore,
  useStoreSettings,
} from '../../lib/queries';
import { useDateRange } from '../DateRangeContext';
import { GoalGauge } from './GoalGauge';
import { MobileDateFilter } from './MobileDateFilter';
import { MobileLoadError } from './MobileLoadError';

const CAT_COLOR: Record<CategoryKey, string> = { DERM: '#b84c9c', GEN: '#698b46', MP: '#813c97', MER: '#f26122' };

export function MobileInicioPage() {
  const CAT_LABEL = useCategoryLabelMap();
  const { data: collaborators, isError: collaboratorsError } = useCollaborators();
  const { data: goals, isError: goalsError } = useGoals();
  const { data: storeSettings, isError: storeSettingsError } = useStoreSettings();
  const { data: specialLists, isError: specialListsError } = useSpecialLists();
  const { data: dynamics, isError: dynamicsError } = useDynamics();
  const { data: store } = useStore();
  const { data: genericConquistas } = useGenericConquistaConfigs();
  const { dashFrom, dashTo, refYear, refMonth, rankFilter, modoGeral } = useDateRange();
  const extraStarCategories: ChampionStarCategory[] = useMemo(
    () => (genericConquistas ?? []).map((g) => ({ key: g.chave, label: g.nome, generic: g })),
    [genericConquistas],
  );

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

  // Plano de Ação Tartaruga: this used to be a single unconditional
  // useSales() — the store's ENTIRE sales history, downloaded on every cold
  // app open since Início is the default landing route. Replaced with two
  // much smaller fetches: aggregated per-collaborator/per-categoria totals
  // for the selected range (ranking, gauges — mobile_category_totals RPC,
  // server-side aggregation), and item-level sales only for the champion
  // card's own [campeaoFrom, campeaoTo] window (a single day or the
  // reference month, never the full history) — that window still needs raw
  // sales because computeChampionStars scores each day individually
  // (best single day within range), which an already-summed total can't do.
  const { data: categoryTotals, isError: categoryTotalsError } = useMobileCategoryTotals(dashFrom, dashTo);
  const { data: campeaoSales, isError: campeaoSalesError } = useSalesInRange(campeaoFrom, campeaoTo);
  // getGoalFromTotals/getSuperMetaFromTotals/effectiveMetaGeralFromTotals
  // only need month-to-date totals for the auto-redistribute daily-goal
  // path — fetched only when at least one of the goals shown here actually
  // uses it, same conditional pattern as MobileRankingPage.
  const needsMonthToDate = mode === 'dia' && (CAT_KEYS.some((k) => goals?.[k]?.autoRedistribuir) || !!goals?.MER?.superMetaAuto);
  const now = new Date();
  const { data: monthToDateTotals, isError: monthToDateTotalsError } = useMobileCategoryTotals(
    monthFirstISO(now.getFullYear(), now.getMonth()),
    todayISO(),
    needsMonthToDate,
  );

  // Safe stand-ins so the useMemo calls below always run in the same order
  // (Rules of Hooks) whether or not every query has resolved yet — the
  // "Carregando…" guard comes after them, not before.
  const collaboratorsData = collaborators ?? [];
  const campeaoSalesData = campeaoSales ?? [];

  const ranking = useMemo(
    () => summaryFromCategoryTotals(categoryTotals ?? [], collaboratorsData, 'ALL'),
    [categoryTotals, collaboratorsData],
  );
  const totalValor = ranking.reduce((a, r) => a + r.valor, 0);
  const totalItens = ranking.reduce((a, r) => a + r.itens, 0);
  const rankingList = ranking.filter((r) => r.valor > 0).slice(0, 10);

  const gaugeData = useMemo(() => {
    if (!goals) return [];
    return CAT_KEYS.map((k) => {
      const t = k === 'MER' ? { valor: totalValor, qtd: totalItens } : sumCategoryTotals(categoryTotals ?? [], k);
      const goal = getGoalFromTotals(goals[k], mode, monthToDateTotals ?? [], collaboratorsData, proration);
      return { key: k, valor: t.valor, goal };
    });
  }, [categoryTotals, collaboratorsData, goals, mode, proration, totalValor, totalItens, monthToDateTotals]);

  const campeaoSource = useMemo(
    () => computeSummary(campeaoSalesData, collaboratorsData, campeaoFrom, campeaoTo, championCatFilter, specialLists),
    [campeaoSalesData, collaboratorsData, campeaoFrom, campeaoTo, championCatFilter, specialLists],
  );
  const campeao =
    campeaoSource.length && (isUnitChampionCat ? campeaoSource[0].itens > 0 : campeaoSource[0].valor > 0) ? campeaoSource[0] : null;
  const campeaoMatricula = campeao?.matricula;
  const campeaoStars = useMemo(
    () =>
      campeaoMatricula
        ? computeChampionStars(campeaoMatricula, campeaoSalesData, collaboratorsData, specialLists, campeaoFrom, campeaoTo, extraStarCategories)
        : null,
    [campeaoMatricula, campeaoSalesData, collaboratorsData, specialLists, campeaoFrom, campeaoTo, extraStarCategories],
  );

  // Checked BEFORE the "still missing" guard below — see MobileLoadError's
  // own comment for why: a query that already gave up leaves `data`
  // undefined forever too, which used to be indistinguishable from "still
  // loading".
  if (
    collaboratorsError ||
    goalsError ||
    storeSettingsError ||
    specialListsError ||
    dynamicsError ||
    categoryTotalsError ||
    campeaoSalesError ||
    (needsMonthToDate && monthToDateTotalsError)
  ) {
    return <MobileLoadError />;
  }

  if (
    !collaborators ||
    !categoryTotals ||
    !campeaoSales ||
    !goals ||
    !storeSettings ||
    !specialLists ||
    !dynamics ||
    (needsMonthToDate && !monthToDateTotals)
  ) {
    return <div style={{ padding: 24, fontSize: 12, color: 'var(--mv2-texto-2)' }}>Carregando…</div>;
  }

  const metaGeral = effectiveMetaGeralFromTotals(goals, mode, monthToDateTotals ?? [], collaborators, storeSettings.meta_geral_fallback, proration);
  const metaSuper = getSuperMetaFromTotals(goals.MER, mode, monthToDateTotals ?? [], collaborators, proration);
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
  const categoryLabels = useCategoryLabelMap();

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
          <div className="mv2-stars" title={campeaoStars.map((s) => `${s.achieved ? '✓' : '✗'} ${categoryLabels[s.key as keyof typeof categoryLabels] ?? s.label}`).join(' · ')}>
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
