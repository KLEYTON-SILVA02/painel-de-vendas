import { useState } from 'react';
import { MetricsFilterBar, type MfbStatCard } from '../../components/MetricsFilterBar';
import { MultiRankingImageModal } from '../../components/ranking/MultiRankingImageModal';
import { RankingColumnCard } from '../../components/ranking/RankingColumnCard';
import { diasRestantesNoMes, effectiveMetaGeral, getGoal, getSuperMeta } from '../../lib/business/goals';
import { computeColumnRanking } from '../../lib/business/ranking';
import { computeSummary } from '../../lib/business/summary';
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
  const [multiImages, setMultiImages] = useState<MultiImageResult[] | null>(null);

  if (!collaborators || !sales || !goals || !storeSettings || !specialLists) {
    return <div className="text-sm text-slate-500 p-6">Carregando…</div>;
  }

  const modoDia = dashFrom === dashTo;
  const mode = modoDia ? 'dia' : 'mes';
  const metaGeral = effectiveMetaGeral(goals, mode, sales, collaborators, storeSettings.meta_geral_fallback);
  const metaSuper = getSuperMeta(goals.MER, mode, sales, collaborators);
  const dias = diasRestantesNoMes();

  const columnData = RANKING_COLS.map((c) => {
    const isUnit = c.key === 'LEVMEL' || c.key === 'CHIP';
    // Mercadoria Geral is the store's grand total, not its own exclusive
    // bucket — its column/stat card reflect every sale regardless of
    // category, same as the Meta Geral it's already compared against
    // (effectiveMetaGeral always pulls from goals.MER).
    const columnFilter = c.key === 'MER' ? 'ALL' : c.key;
    const ranking = computeColumnRanking(sales, collaborators, dashFrom, dashTo, columnFilter, isUnit, mode, refYear, refMonth, specialLists);
    // Always the registered daily goal, regardless of the page's own
    // dia/mês date-range mode — the generated image's "Atingimento" box is
    // fixed to "Meta Diária" per column (MER's own goal already represents
    // the whole store, matching its now-total column above).
    const metaDiaria = getGoal(goals[c.key], 'dia', sales, collaborators);
    return { ...c, ranking, isUnit, metaDiaria };
  });

  async function handleGenerateAllImages() {
    setGeneratingAll(true);
    try {
      const specs = columnData.map((c) => ({
        key: c.key,
        titulo: c.titulo,
        rows: c.isUnit ? c.ranking.map((r) => ({ ...r, valor: r.itens })) : c.ranking,
        isUnit: c.isUnit,
        metaDiaria: c.metaDiaria,
      }));
      const results = await generateAllCategoryImages(specs, dashFrom, dashTo, store?.nome_loja);
      setMultiImages(results);
    } finally {
      setGeneratingAll(false);
    }
  }

  const statCards: MfbStatCard[] = [
    ...RANKING_COLS.map((c) => {
      const isUnit = c.key === 'LEVMEL' || c.key === 'CHIP';
      const rows = computeSummary(sales, collaborators, dashFrom, dashTo, c.key === 'MER' ? 'ALL' : c.key, specialLists);
      const total = isUnit ? rows.reduce((a, r) => a + r.itens, 0) : rows.reduce((a, r) => a + r.valor, 0);
      return { label: `Total ${c.titulo}`, value: isUnit ? `${total} un.` : fmtMoney(total), color: c.cor };
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
    <div className="flex flex-col gap-4">
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
        {generatingAll && <div className="mt-3 text-xs text-slate-500 text-center">Gerando imagens de todas as categorias…</div>}
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
