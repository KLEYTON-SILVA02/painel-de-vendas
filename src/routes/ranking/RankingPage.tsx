import { useMemo, useState } from 'react';
import { PageLoading } from '../../components/PageLoading';
import { MetricsFilterBar, type MfbStatCard } from '../../components/MetricsFilterBar';
import { MultiRankingImageModal } from '../../components/ranking/MultiRankingImageModal';
import { RankingColumnCard } from '../../components/ranking/RankingColumnCard';
import { useCategoryLabelMap } from '../../lib/business/categoryLabels';
import { computeDsmSummary } from '../../lib/business/dsm';
import { diasRestantesNoMes, effectiveMetaGeral, getGoal, getSuperMeta, goalProration } from '../../lib/business/goals';
import { computeColumnRanking, type ColumnRankingRow } from '../../lib/business/ranking';
import type { Goal } from '../../lib/business/types';
import { fmtDateBR, fmtMoney } from '../../lib/format';
import { generateAllCategoryImages, type CategoryImageSpec, type MultiImageResult } from '../../lib/rankingImage';
import { useCategoryTypes, useCollaborators, useDsmRecords, useGoals, useSales, useSpecialLists, useStore, useStoreSettings } from '../../lib/queries';
import { useDateRange } from '../DateRangeContext';

interface RankingColumnData {
  key: string;
  titulo: string;
  icon: string;
  cor: string;
  ranking: ColumnRankingRow[];
  isUnit: boolean;
  metaDiaria: number;
  /** Overrides the "un." suffix — DSM shows "conv." to match how it's
   * labeled everywhere else in the app, same reasoning as
   * rankingImage.ts's own unitLabel. */
  unitLabel?: string;
}

// Ported 1:1 from legacy/index-original.html (RANKING_COLS / viewRanking()).
const RANKING_COLS = [
  { key: 'DERM' as const, titulo: 'Dermo', icon: '🩹', cor: '#ff3df0' },
  { key: 'GEN' as const, titulo: 'Gen/Sim', icon: '💊', cor: '#14ff00' },
  { key: 'MP' as const, titulo: 'Marcas Excl.', icon: '🏷️', cor: '#a82bff' },
  { key: 'MER' as const, titulo: 'Merc. Geral', icon: '📦', cor: '#ff6a00' },
  { key: 'LEVMEL' as const, titulo: 'Levmel', icon: '🍯', cor: '#ffb700' },
  { key: 'CHIP' as const, titulo: 'Chip', icon: '🔴', cor: '#00e5ff' },
];

export function RankingPage() {
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: goals } = useGoals();
  const { data: storeSettings } = useStoreSettings();
  const { data: specialLists } = useSpecialLists();
  const { data: store } = useStore();
  const { data: dsmRecords } = useDsmRecords();
  const { data: categoryTypes } = useCategoryTypes();
  const dsmCategory = categoryTypes?.find((c) => c.chave === 'dsm');
  const { dashFrom, dashTo, refYear, refMonth, modoGeral } = useDateRange();
  const categoryLabels = useCategoryLabelMap();
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingProgress, setGeneratingProgress] = useState({ done: 0, total: 0 });
  const [multiImages, setMultiImages] = useState<MultiImageResult[] | null>(null);

  const modoDia = dashFrom === dashTo;
  const mode = modoDia ? 'dia' : 'mes';
  const proration = goalProration(dashFrom, dashTo, modoGeral);
  const hiddenCategories = storeSettings?.hidden_categories ?? [];

  // Safe stand-ins so the useMemo below runs unconditionally on every
  // render (same hook order regardless of loading state) — the
  // "Carregando…" guard comes after it, per the Rules of Hooks.
  const salesData = sales ?? [];
  const collaboratorsData = collaborators ?? [];

  // Up to 6 columns × one computeColumnRanking pass each over the full
  // `sales` array — in "Modo Geral" (whole month) that's real work, and it
  // used to run again from scratch (via a duplicate computeSummary call per
  // column, see statCards below) on every render, including ones triggered
  // by unrelated state like the "Gerando imagens…" toggle. Memoizing keeps
  // it tied to the data/date-range actually changing.
  const columnData = useMemo(() => {
    if (!goals) return [];
    const cols: RankingColumnData[] = RANKING_COLS.filter((c) => !hiddenCategories.includes(c.key)).map((c) => {
      const isUnit = c.key === 'LEVMEL' || c.key === 'CHIP';
      // Mercadoria Geral is the store's grand total, not its own exclusive
      // bucket — its column/stat card reflect every sale regardless of
      // category, same as the Meta Geral it's already compared against
      // (effectiveMetaGeral always pulls from goals.MER).
      const columnFilter = c.key === 'MER' ? 'ALL' : c.key;
      const ranking = computeColumnRanking(
        salesData,
        collaboratorsData,
        dashFrom,
        dashTo,
        columnFilter,
        isUnit,
        mode,
        refYear,
        refMonth,
        specialLists,
      );
      // Always the registered daily goal, regardless of the page's own
      // dia/mês date-range mode — the generated image's "Atingimento" box is
      // fixed to "Meta Diária" per column (MER's own goal already represents
      // the whole store, matching its now-total column above).
      const metaDiaria = getGoal(goals[c.key], 'dia', salesData, collaboratorsData);
      return { ...c, titulo: categoryLabels[c.key] ?? c.titulo, ranking, isUnit, metaDiaria };
    });
    // DSM não vem de `sales`/computeColumnRanking (ver dsm.ts) — entra à
    // parte, só quando a própria loja não a ocultou (mesmo "ativo" que
    // Sidebar/RankFilterBar já respeitam), na mesma posição em que Chip
    // costumava ficar quando visível.
    if (dsmCategory?.ativo) {
      const dsmSummary = computeDsmSummary(dsmRecords ?? [], collaboratorsData, dashFrom, dashTo);
      const dsmRanking: ColumnRankingRow[] = dsmSummary.map((r) => ({
        matricula: r.matricula,
        nome: r.nome,
        apelido: r.apelido,
        foto: r.foto,
        metaIndividual: 0,
        qtd: { DERM: 0, GEN: 0, MP: 0, MER: 0, SEM: 0 },
        valor: r.conversoes,
        itens: r.conversoes,
        pct: null,
      }));
      const dsmGoal = (goals as unknown as Partial<Record<'DSM', Goal>>).DSM;
      cols.push({
        key: 'DSM',
        titulo: dsmCategory.nome,
        icon: '🎟️',
        cor: '#00e0c0',
        ranking: dsmRanking,
        isUnit: true,
        metaDiaria: getGoal(dsmGoal, 'dia', salesData, collaboratorsData),
        unitLabel: 'conv.',
      });
    }
    return cols;
  }, [salesData, collaboratorsData, goals, dashFrom, dashTo, mode, refYear, refMonth, specialLists, categoryLabels, hiddenCategories, dsmCategory, dsmRecords]);

  if (!collaborators || !sales || !goals || !storeSettings || !specialLists) {
    return <PageLoading />;
  }

  const metaGeral = effectiveMetaGeral(goals, mode, sales, collaborators, storeSettings.meta_geral_fallback, proration);
  const metaSuper = getSuperMeta(goals.MER, mode, sales, collaborators, proration);
  const dias = diasRestantesNoMes();

  async function handleGenerateAllImages() {
    setGeneratingAll(true);
    setGeneratingProgress({ done: 0, total: columnData.length });
    try {
      const specs: CategoryImageSpec[] = columnData.map((c) => ({
        key: c.key,
        titulo: c.titulo,
        rows: c.isUnit ? c.ranking.map((r) => ({ ...r, valor: r.itens })) : c.ranking,
        isUnit: c.isUnit,
        metaDiaria: c.metaDiaria,
        unitLabel: c.unitLabel,
      }));
      const results = await generateAllCategoryImages(specs, dashFrom, dashTo, store?.nome_loja, (done, total) =>
        setGeneratingProgress({ done, total }),
      );
      setMultiImages(results);
    } finally {
      setGeneratingAll(false);
    }
  }

  const statCards: MfbStatCard[] = [
    // Reuses columnData's already-computed ranking instead of a second
    // computeSummary pass per category — computeColumnRanking's `list`
    // only drops zero rows, so the sum is identical either way.
    ...columnData.map((c) => {
      const total = c.isUnit ? c.ranking.reduce((a, r) => a + r.itens, 0) : c.ranking.reduce((a, r) => a + r.valor, 0);
      return { label: `Total ${c.titulo}`, value: c.isUnit ? `${total} ${c.unitLabel ?? 'un.'}` : fmtMoney(total), color: c.cor };
    }),
    {
      stack: [
        { label: 'Meta Geral', value: fmtMoney(metaGeral), color: '#ffb700' },
        { label: 'Super Meta', value: fmtMoney(metaSuper), color: '#ff3df0' },
        { label: 'Dias restantes', value: `${dias} dia(s)`, color: '#14ff00' },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <MetricsFilterBar statCards={statCards} />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10 }}>
          {columnData.map((c) => (
            <RankingColumnCard
              key={c.key}
              title={c.titulo}
              icon={c.icon}
              color={c.cor}
              ranking={c.ranking}
              isUnit={c.isUnit}
              unitLabel={c.unitLabel}
              metaDiaria={c.metaDiaria}
              dashFrom={dashFrom}
              dashTo={dashTo}
              storeName={store?.nome_loja}
              onGenerateAll={handleGenerateAllImages}
            />
          ))}
        </div>
        {generatingAll && (
          <div className="mt-3 text-xs text-slate-500 text-center">
            Gerando imagens de todas as categorias… ({generatingProgress.done}/{generatingProgress.total})
          </div>
        )}
      </div>

      {multiImages && (
        <MultiRankingImageModal
          images={multiImages}
          text={`🏆 Ranking Geral · ${fmtDateBR(dashFrom)} a ${fmtDateBR(dashTo)}`}
          onClose={() => setMultiImages(null)}
        />
      )}
    </div>
  );
}
