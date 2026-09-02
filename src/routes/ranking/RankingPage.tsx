import { useMemo, useState } from 'react';
import { MetricsFilterBar, type MfbStatCard } from '../../components/MetricsFilterBar';
import { MultiRankingImageModal } from '../../components/ranking/MultiRankingImageModal';
import { RankingColumnCard } from '../../components/ranking/RankingColumnCard';
import { diasRestantesNoMes, effectiveMetaGeral, getGoal, getSuperMeta } from '../../lib/business/goals';
import { computeColumnRanking } from '../../lib/business/ranking';
import { fmtDateBR, fmtMoney } from '../../lib/format';
import { generateAllCategoryImages, type MultiImageResult } from '../../lib/rankingImage';
import { useCollaborators, useGoals, useSales, useSpecialLists, useStore, useStoreSettings } from '../../lib/queries';
import { useDateRange } from '../DateRangeContext';

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
  const { dashFrom, dashTo, refYear, refMonth } = useDateRange();
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingProgress, setGeneratingProgress] = useState({ done: 0, total: 0 });
  const [multiImages, setMultiImages] = useState<MultiImageResult[] | null>(null);

  const modoDia = dashFrom === dashTo;
  const mode = modoDia ? 'dia' : 'mes';

  // Safe stand-ins so the useMemo below runs unconditionally on every
  // render (same hook order regardless of loading state) — the
  // "Carregando…" guard comes after it, per the Rules of Hooks.
  const salesData = sales ?? [];
  const collaboratorsData = collaborators ?? [];

  // 6 columns × one computeColumnRanking pass each over the full `sales`
  // array — in "Modo Geral" (whole month) that's real work, and it used to
  // run again from scratch (via a duplicate computeSummary call per column,
  // see statCards below) on every render, including ones triggered by
  // unrelated state like the "Gerando imagens…" toggle. Memoizing keeps it
  // tied to the data/date-range actually changing.
  const columnData = useMemo(() => {
    if (!goals) return [];
    return RANKING_COLS.map((c) => {
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
      return { ...c, ranking, isUnit, metaDiaria };
    });
  }, [salesData, collaboratorsData, goals, dashFrom, dashTo, mode, refYear, refMonth, specialLists]);

  if (!collaborators || !sales || !goals || !storeSettings || !specialLists) {
    return <div className="text-sm text-slate-500 p-6">Carregando…</div>;
  }

  const metaGeral = effectiveMetaGeral(goals, mode, sales, collaborators, storeSettings.meta_geral_fallback);
  const metaSuper = getSuperMeta(goals.MER, mode, sales, collaborators);
  const dias = diasRestantesNoMes();

  async function handleGenerateAllImages() {
    setGeneratingAll(true);
    setGeneratingProgress({ done: 0, total: columnData.length });
    try {
      const specs = columnData.map((c) => ({
        key: c.key,
        titulo: c.titulo,
        rows: c.isUnit ? c.ranking.map((r) => ({ ...r, valor: r.itens })) : c.ranking,
        isUnit: c.isUnit,
        metaDiaria: c.metaDiaria,
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
      return { label: `Total ${c.titulo}`, value: c.isUnit ? `${total} un.` : fmtMoney(total), color: c.cor };
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
        <h3 className="text-cyan-400 font-semibold text-sm mb-3">🏆 Ranking Geral</h3>
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
