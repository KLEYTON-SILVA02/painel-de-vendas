import { useMemo, useState } from 'react';
import { PageLoading } from '../../components/PageLoading';
import { MetricsFilterBar, type MfbStatCard } from '../../components/MetricsFilterBar';
import { MultiRankingImageModal } from '../../components/ranking/MultiRankingImageModal';
import { RankingColumnCard } from '../../components/ranking/RankingColumnCard';
import { useCategoryLabelMap } from '../../lib/business/categoryLabels';
import { computeDsmSummary } from '../../lib/business/dsm';
import { diasRestantesNoMes, effectiveMetaGeral, getGoal, getSuperMeta, goalProration } from '../../lib/business/goals';
import { computeColumnRanking, type ColumnRankingRow } from '../../lib/business/ranking';
import { computeSummary } from '../../lib/business/summary';
import { VISITANTE_SETOR, type Goal } from '../../lib/business/types';
import { computeUvcDailyRowsForCollaborator, computeUvcSummary, fmtUvc } from '../../lib/business/uvc';
import { addDaysISO, monthFirstISO, monthLastISO, todayISO } from '../../lib/dateRange';
import { monthName, fmtDateBR, fmtMoney } from '../../lib/format';
import { accumulateMonthExtract, buildMonthExtract, buildMonthExtractHtml, openPrintPreview, type MonthExtractCategory } from '../../lib/printExtract';
import { generateAllCategoryImages, type CategoryImageSpec, type MultiImageResult } from '../../lib/rankingImage';
import {
  useCategoryTypes,
  useClientServiceRecords,
  useCollaborators,
  useDailyItemsSoldByCollaborator,
  useDsmRecords,
  useGoals,
  useSalesInRange,
  useSpecialLists,
  useStore,
  useStoreSettings,
} from '../../lib/queries';
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
  /** Mesmos totalOverride/totalLabel/valueFormatter de rankingImage.ts — só
   * UVC passa isso (sua razão não pode ser somada a partir de `ranking`,
   * ver uvc.ts). */
  totalOverride?: number;
  totalLabel?: string;
  valueFormatter?: (v: number) => string;
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

// Categorias selecionáveis no Extrato por Colaborador — as mesmas 6 fixas
// acima + UVC (não vem de `sales`, tratada à parte em
// handlePrintColaboradorExtract: é uma razão itens÷atendimentos, nunca soma
// entre dias mesmo em "Dias acumulados" — ver comentário lá).
const EXTRATO_CATEGORIES = [...RANKING_COLS, { key: 'UVC' as const, titulo: 'UVC', icon: '📈', cor: '#ffb700' }];

export function RankingPage() {
  const { data: collaborators } = useCollaborators();
  const { data: goals } = useGoals();
  const { data: storeSettings } = useStoreSettings();
  const { data: specialLists } = useSpecialLists();
  const { data: store } = useStore();
  const { data: dsmRecords } = useDsmRecords();
  const { data: categoryTypes } = useCategoryTypes();
  const dsmCategory = categoryTypes?.find((c) => c.chave === 'dsm');
  const { dashFrom, dashTo, refYear, refMonth, modoGeral } = useDateRange();
  // Bounded instead of useSales()'s full history: the selected period
  // (columnData) union the real current month-to-date (getGoal/getSuperMeta/
  // effectiveMetaGeral's auto-redistribute lookup, always scans
  // monthFirst(now)..today) union the browsed reference month (the
  // "Extrato por Colaborador" print always covers the whole refMonth, even
  // when dashFrom/dashTo is narrowed to a single day).
  const now = new Date();
  const currentMonthFirst = monthFirstISO(now.getFullYear(), now.getMonth());
  const refMonthFirst = monthFirstISO(refYear, refMonth);
  const refMonthLast = monthLastISO(refYear, refMonth);
  const salesRangeFrom = [currentMonthFirst, refMonthFirst, dashFrom].sort()[0];
  const salesRangeTo = [todayISO(), refMonthLast, dashTo].sort().at(-1)!;
  const { data: sales } = useSalesInRange(salesRangeFrom, salesRangeTo);
  // UVC (coluna própria, sempre visível — mesmo "sem ocultar" do botão UVC
  // em DashboardPage.tsx) — mesma dupla fonte de dados usada lá:
  // clientServiceRecords já vem completo, dailyItensUvc é por período.
  const { data: clientServiceRecords } = useClientServiceRecords();
  const { data: dailyItensUvc } = useDailyItemsSoldByCollaborator(salesRangeFrom, salesRangeTo);
  // Seta de tendência (dia anterior) — só com um único dia selecionado;
  // busca própria e dedicada (um único dia), independente de `sales` acima
  // (mesmo raciocínio de CategoryPage.tsx).
  const previousDayISO = dashFrom === dashTo ? addDaysISO(dashFrom, -1) : null;
  const { data: prevDaySales } = useSalesInRange(previousDayISO ?? dashFrom, previousDayISO ?? dashFrom, !!previousDayISO);
  const { data: prevDayItensUvc } = useDailyItemsSoldByCollaborator(previousDayISO ?? dashFrom, previousDayISO ?? dashFrom, !!previousDayISO);
  const categoryLabels = useCategoryLabelMap();
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingProgress, setGeneratingProgress] = useState({ done: 0, total: 0 });
  const [multiImages, setMultiImages] = useState<MultiImageResult[] | null>(null);
  // Extrato por colaborador: ADM escolhe um colaborador + quais categorias
  // marcar, e imprime o detalhamento dia a dia do mês (mesmo motor de
  // "Imprimir extrato do mês" do SidebarCalendarCard, só que as vendas já
  // chegam pré-filtradas para a matrícula escolhida e as categorias ficam a
  // critério do ADM em vez de ser sempre as 6 fixas).
  const [extratoMatricula, setExtratoMatricula] = useState('');
  const [extratoCategorias, setExtratoCategorias] = useState<Set<string>>(new Set(RANKING_COLS.map((c) => c.key)));
  // 'dia' (padrão) = cada dia mostra só o que foi vendido naquele dia.
  // 'acumulado' = cada dia mostra a soma progressiva até ali (dia 2 =
  // dia1+dia2, dia 3 = dia1+dia2+dia3, ...), até o último dia com venda no
  // mês — ver accumulateMonthExtract.
  const [extratoModo, setExtratoModo] = useState<'dia' | 'acumulado'>('dia');

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
    // UVC também não vem de `sales`/computeColumnRanking (itens ÷
    // atendimentos, uma RAZÃO — ver uvc.ts) e, diferente de DSM, não tem um
    // "ativo"/ocultar próprio — entra sempre, mesmo "sempre visível" do
    // botão UVC em DashboardPage.tsx. O total da coluna nunca pode vir de
    // somar `ranking` (somaria razões, sem significado) — só de
    // uvcSummary.totals.uvc, passado à parte via totalOverride/totalLabel/
    // valueFormatter (mesmo mecanismo de allCategorySpecs em
    // DashboardPage.tsx).
    const uvcSummary = computeUvcSummary(dailyItensUvc ?? [], clientServiceRecords ?? [], collaboratorsData, dashFrom, dashTo, modoGeral);
    const uvcRanking: ColumnRankingRow[] = uvcSummary.rows.map((r) => ({
      matricula: r.matricula,
      nome: r.nome,
      apelido: r.apelido,
      foto: r.foto,
      metaIndividual: 0,
      qtd: { DERM: 0, GEN: 0, MP: 0, MER: 0, SEM: 0 },
      valor: r.uvc,
      itens: r.uvc,
      pct: null,
    }));
    cols.push({
      key: 'UVC',
      titulo: 'UVC',
      icon: '📈',
      cor: '#ffb700',
      ranking: uvcRanking,
      isUnit: false,
      metaDiaria: 0,
      valueFormatter: fmtUvc,
      totalOverride: uvcSummary.totals.uvc ?? 0,
      totalLabel: 'UVC GERAL DA LOJA',
    });
    return cols;
  }, [
    salesData,
    collaboratorsData,
    goals,
    dashFrom,
    dashTo,
    mode,
    refYear,
    refMonth,
    specialLists,
    categoryLabels,
    hiddenCategories,
    dsmCategory,
    dsmRecords,
    dailyItensUvc,
    clientServiceRecords,
    modoGeral,
  ]);

  // Seta de tendência: mapa coluna → (matrícula → valor do colaborador no
  // dia de venda anterior), um Map por chave de coluna — null inteiro fora
  // de "dia único".
  const previousValueMaps = useMemo(() => {
    if (!previousDayISO) return null;
    const prevSalesData = prevDaySales ?? [];
    const result = new Map<string, Map<string, number>>();
    RANKING_COLS.forEach((c) => {
      const isUnit = c.key === 'LEVMEL' || c.key === 'CHIP';
      const columnFilter = c.key === 'MER' ? 'ALL' : c.key;
      const map = new Map<string, number>();
      computeSummary(prevSalesData, collaboratorsData, previousDayISO, previousDayISO, columnFilter, specialLists).forEach((r) =>
        map.set(r.matricula, isUnit ? r.itens : r.valor),
      );
      result.set(c.key, map);
    });
    if (dsmCategory?.ativo) {
      const map = new Map<string, number>();
      computeDsmSummary(dsmRecords ?? [], collaboratorsData, previousDayISO, previousDayISO).forEach((r) => map.set(r.matricula, r.conversoes));
      result.set('DSM', map);
    }
    const uvcMap = new Map<string, number>();
    computeUvcSummary(prevDayItensUvc ?? [], clientServiceRecords ?? [], collaboratorsData, previousDayISO, previousDayISO, false).rows.forEach((r) =>
      uvcMap.set(r.matricula, r.uvc),
    );
    result.set('UVC', uvcMap);
    return result;
  }, [previousDayISO, prevDaySales, collaboratorsData, specialLists, dsmCategory, dsmRecords, prevDayItensUvc, clientServiceRecords]);

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
        totalOverride: c.totalOverride,
        totalLabel: c.totalLabel,
        valueFormatter: c.valueFormatter,
      }));
      const results = await generateAllCategoryImages(specs, dashFrom, dashTo, store?.nome_loja, (done, total) =>
        setGeneratingProgress({ done, total }),
      );
      setMultiImages(results);
    } finally {
      setGeneratingAll(false);
    }
  }

  function handlePrintColaboradorExtract() {
    if (!extratoMatricula) return;
    const colaborador = collaborators!.find((c) => c.matricula === extratoMatricula);
    const nomeColaborador = colaborador?.apelido || colaborador?.nome || extratoMatricula;
    const salesColaborador = sales!.filter((s) => s.matricula === extratoMatricula);
    const categoriasBase = buildMonthExtract(salesColaborador, refYear, refMonth + 1, specialLists!, categoryLabels).filter((c) =>
      extratoCategorias.has(c.key),
    );
    const isAcumulado = extratoModo === 'acumulado';
    const categorias: MonthExtractCategory[] = isAcumulado ? accumulateMonthExtract(categoriasBase) : categoriasBase;
    // UVC é uma razão (itens ÷ atendimentos) — nunca passa por
    // accumulateMonthExtract, mesmo com "Dias acumulados" ativo (pedido
    // explícito do usuário, 2026-10-24): soma de razões de dias diferentes
    // não tem significado. Sempre mostra a razão do próprio dia, com a
    // coluna rotulada "Valor" independente do modo escolhido para as
    // outras categorias (valueColumnLabel por categoria).
    if (extratoCategorias.has('UVC')) {
      const uvcDays = computeUvcDailyRowsForCollaborator(
        dailyItensUvc ?? [],
        clientServiceRecords ?? [],
        collaboratorsData,
        extratoMatricula,
        refMonthFirst,
        refMonthLast,
      );
      const uvcMonthSummary = computeUvcSummary(dailyItensUvc ?? [], clientServiceRecords ?? [], collaboratorsData, refMonthFirst, refMonthLast, false);
      const uvcTotal = uvcMonthSummary.rows.find((r) => r.matricula === extratoMatricula)?.uvc ?? 0;
      categorias.push({
        key: 'UVC',
        label: 'UVC',
        isUnit: false,
        total: uvcTotal,
        days: uvcDays.map((d) => ({ dataISO: d.dataISO, value: d.uvc ?? 0 })),
        valueColumnLabel: 'Valor',
      });
    }
    const monthLabel = `${monthName(refMonth)}/${refYear}`;
    const html = buildMonthExtractHtml(
      categorias,
      monthLabel,
      store?.nome_loja,
      nomeColaborador,
      isAcumulado ? 'Acumulado' : 'Valor',
      'Extrato do Mês',
      'Total do mês',
      true,
      !isAcumulado,
    );
    openPrintPreview(`Extrato ${isAcumulado ? '(acumulado) ' : ''}— ${nomeColaborador} — ${monthLabel}`, html);
  }

  const statCards: MfbStatCard[] = [
    // Reuses columnData's already-computed ranking instead of a second
    // computeSummary pass per category — computeColumnRanking's `list`
    // only drops zero rows, so the sum is identical either way.
    ...columnData.map((c) => {
      // UVC: nunca soma o ranking (somaria razões, sem significado — ver
      // uvc.ts) — totalOverride já traz o total real da loja.
      const total = c.totalOverride ?? (c.isUnit ? c.ranking.reduce((a, r) => a + r.itens, 0) : c.ranking.reduce((a, r) => a + r.valor, 0));
      const value = c.valueFormatter ? c.valueFormatter(total) : c.isUnit ? `${total} ${c.unitLabel ?? 'un.'}` : fmtMoney(total);
      return { label: `Total ${c.titulo}`, value, color: c.cor };
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
          {columnData.map((c) => {
            const prevMap = previousValueMaps?.get(c.key);
            return (
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
                getPreviousValue={prevMap ? (r) => prevMap.get(r.matricula) ?? 0 : undefined}
                formatValue={c.valueFormatter}
                totalOverride={c.totalOverride}
                totalLabel={c.totalLabel}
              />
            );
          })}
        </div>
        {generatingAll && (
          <div className="mt-3 text-xs text-slate-500 text-center">
            Gerando imagens de todas as categorias… ({generatingProgress.done}/{generatingProgress.total})
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-1">🖨️ Extrato por Colaborador</h3>
        <p className="text-xs text-slate-500 mb-3">
          Escolha um colaborador e marque as categorias — a impressão mostra só os valores dele, dia a dia de venda,
          no mês selecionado em "Período rápido".
        </p>
        <div className="mb-3">
          <label className="block text-xs text-slate-400 mb-1">Colaborador</label>
          <select value={extratoMatricula} onChange={(e) => setExtratoMatricula(e.target.value)} className="input !w-auto">
            <option value="">Selecione…</option>
            {collaborators
              .filter((c) => c.setor !== VISITANTE_SETOR)
              .map((c) => (
                <option key={c.id} value={c.matricula}>
                  {c.apelido || c.nome}
                </option>
              ))}
          </select>
        </div>
        {/* Todas as categorias do sistema ficam disponíveis aqui, mesmo uma
            que a loja tenha ocultado do resto do app (ADM > Nomes das
            Categorias) — esse extrato é uma ferramenta à parte, não a
            navegação normal, então não segue aquele filtro. Largura igual
            pros 6 botões, ocupando a linha de ponta a ponta (grid em vez de
            flex-wrap) em vez de cada um só do tamanho do próprio texto. */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${EXTRATO_CATEGORIES.length}, 1fr)`, gap: 8, marginBottom: 12 }}>
          {EXTRATO_CATEGORIES.map((c) => {
            const checked = extratoCategorias.has(c.key);
            // categoryLabels só cobre as 6 categorias fixas (Record
            // tipado) — UVC não tem apelido configurável, sempre "UVC".
            const label = c.key === 'UVC' ? c.titulo : (categoryLabels[c.key] ?? c.titulo);
            return (
              <button
                key={c.key}
                onClick={() =>
                  setExtratoCategorias((prev) => {
                    const next = new Set(prev);
                    if (next.has(c.key)) next.delete(c.key);
                    else next.add(c.key);
                    return next;
                  })
                }
                style={{
                  background: checked ? c.cor : 'transparent',
                  border: `1px solid ${c.cor}`,
                  color: checked ? '#0b0e1d' : c.cor,
                  padding: '6px 4px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {checked ? '✓ ' : ''}
                {label}
              </button>
            );
          })}
        </div>
        <div className="mb-3">
          <label className="block text-xs text-slate-400 mb-1">Modo de exibição dos dias</label>
          {/* Mesma ideia da linha de categorias acima: Dias individuais/
              acumulados e Preparar impressão lado a lado, largura igual,
              ocupando a linha inteira — em vez de "Preparar impressão"
              ficar numa linha própria embaixo. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {(
              [
                { key: 'dia' as const, label: '📅 Dias individuais', title: 'Cada dia mostra só o que foi vendido naquele dia.' },
                {
                  key: 'acumulado' as const,
                  label: '📈 Dias acumulados',
                  title: 'Cada dia mostra a soma progressiva até ali (dia 1 + dia 2 + ... até o dia).',
                },
              ] as const
            ).map((m) => (
              <button
                key={m.key}
                onClick={() => setExtratoModo(m.key)}
                title={m.title}
                style={{
                  background: extratoModo === m.key ? '#ffb700' : 'transparent',
                  border: '1px solid #ffb700',
                  color: extratoModo === m.key ? '#231a02' : '#ffb700',
                  padding: '6px 4px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {m.label}
              </button>
            ))}
            <button
              onClick={handlePrintColaboradorExtract}
              disabled={!extratoMatricula || extratoCategorias.size === 0}
              className="rounded-lg border text-sm font-semibold disabled:opacity-50"
              style={{ borderColor: '#ffb700', color: '#ffb700', padding: '6px 4px' }}
            >
              🖨️ Preparar impressão
            </button>
          </div>
        </div>
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
