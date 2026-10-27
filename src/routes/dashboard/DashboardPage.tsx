import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { PageError } from '../../components/PageError';
import { PageLoading } from '../../components/PageLoading';
import { HelpTip } from '../../components/HelpTip';
import { BillingCycleClock } from '../../components/BillingCycleClock';
import { useAuth } from '../../auth/AuthContext';
import { DailyEvolutionChart, formatChartValue, type ChartCategoryKey } from '../../components/dashboard/DailyEvolutionChart';
import { useCategoryLabelMap } from '../../lib/business/categoryLabels';
import { SemicircleGauge } from '../../components/SemicircleGauge';
import { SidebarCalendarCard } from '../../components/SidebarCalendarCard';
import { GenerateImageScopeModal } from '../../components/ranking/GenerateImageScopeModal';
import { MultiRankingImageModal } from '../../components/ranking/MultiRankingImageModal';
import { PodiumSplit, type PodiumSpots } from '../../components/ranking/PodiumSplit';
import { PodiumStaircase } from '../../components/ranking/PodiumStaircase';
import { RankingImageModal } from '../../components/ranking/RankingImageModal';
import { RankingModeToggle } from '../../components/ranking/RankingModeToggle';
import { CAT_KEYS, type CategoryKey } from '../../lib/business/classification';
import { computeDsmSummary } from '../../lib/business/dsm';
import { computeUvcSummary, fmtUvc } from '../../lib/business/uvc';
import { computeDinamicaRanking, intersectDynamicPeriod } from '../../lib/business/dynamics';
import {
  diasRestantesNoMes,
  effectiveMetaGeralFromTotals,
  getGoalFromTotals,
  getSuperMetaFromTotals,
  goalProration,
} from '../../lib/business/goals';
import type { Dynamic, Goal } from '../../lib/business/types';
import { summaryFromCategoryTotals, sumCategoryTotals } from '../../lib/business/summary';
import { addDaysISO, monthFirstISO, monthLastISO, todayISO } from '../../lib/dateRange';
import { fmtDateBR, fmtMoney } from '../../lib/format';
import { copyText, formatRankingText } from '../../lib/clipboard';
import { useUpdateStoreSettings } from '../../lib/mutations';
import { generateAllCategoryImages, generateRankingImageBlob, tryCopyImage, type CategoryImageSpec, type MultiImageResult } from '../../lib/rankingImage';
import {
  useCategoryTypes,
  useClientServiceRecords,
  useCollaborators,
  useDailyItemsSoldByCollaborator,
  useDsmRecords,
  useDynamics,
  useGoals,
  useMobileCategoryTotals,
  useSalesInRange,
  useSpecialLists,
  useStore,
  useStoreBillingCycle,
  useStoreSettings,
} from '../../lib/queries';
import { useDateRange, type RankFilter } from '../DateRangeContext';

const RANKING_CATEGORIES: { key: CategoryKey | 'LEVMEL' | 'CHIP'; titulo: string }[] = [
  { key: 'DERM', titulo: 'Dermo' },
  { key: 'GEN', titulo: 'Gen/Sim' },
  { key: 'MP', titulo: 'Marcas Excl.' },
  { key: 'MER', titulo: 'Merc. Geral' },
  { key: 'LEVMEL', titulo: 'Levmel' },
  { key: 'CHIP', titulo: 'Chip' },
];

const CAT_COLOR: Record<CategoryKey, string> = {
  DERM: '#ff3df0',
  GEN: '#14ff00',
  MP: '#a82bff',
  MER: '#ff6a00',
};

// "Todas" and "Mercadoria Geral" used to be two separate buttons here (ALL
// and MER) that silently disagreed: MER filtered sales down to
// `sale.grupo === 'MER'` (the classification's own leftover-fallback
// bucket), while ALL summed every sale in the period — so "Mercadoria
// Geral" always showed a smaller total than "Todas", even though they're
// meant to be the exact same grand total (the same convention
// CategoryPage/RankingPage already use for their own MER screens/columns:
// `catFilter === 'MER' ? 'ALL' : catKey`). Fixed at the root instead of
// patched: the redundant MER button is gone, and 'ALL' is now simply
// labeled with the store's own "Mercadoria Geral" name (see the `l: ...`
// override below and resolveRankFilterParams' label for 'ALL').
const RANK_FILTERS: { k: RankFilter; l: string }[] = [
  { k: 'ALL', l: 'Mercadoria Geral' },
  { k: 'DERM', l: 'Dermo' },
  { k: 'GEN', l: 'Gen/Sim' },
  { k: 'MP', l: 'Marcas Excl.' },
];

// EVOLUÇÃO DIÁRIA não tem mais filtro de categoria próprio — segue sempre o
// mesmo filtro de "Ranking Geral" logo acima (rankFilter). As categorias se
// correspondem 1:1, exceto Dinâmicas: o gráfico não tem lógica própria para
// casar produtos pela regra de uma Dinâmica dia a dia (diferente do ranking,
// que já tem computeDinamicaRanking para o período inteiro), então cai no
// mesmo "Mercadoria Geral" que resolveRankFilterParams já usa quando uma
// Dinâmica não é encontrada.
function chartCategoryFromRankFilter(rankFilter: RankFilter): ChartCategoryKey {
  if (rankFilter === 'UVC') return 'UVC';
  // Dinâmicas não têm lógica própria pra casar produtos dia a dia (ver
  // computeDailyPoints) — cai no mesmo fallback que 'ALL' já usa
  // (Mercadoria Geral).
  if (rankFilter === 'ALL' || rankFilter.startsWith('DIN:')) return 'MER';
  // .startsWith() above isn't a type guard, so TS can't narrow the
  // template-literal DIN: member out on its own (same situation already
  // noted in resolveRankFilterParams below) — the remaining values here are
  // always 'DERM'|'GEN'|'MP'|'LEVMEL'|'CHIP'|'DSM', all valid ChartCategoryKeys.
  return rankFilter as ChartCategoryKey;
}

// Ported 1:1 from legacy/index-original.html (resolveRankFilterParams()).
function resolveRankFilterParams(
  rankFilter: RankFilter,
  dashFrom: string,
  dashTo: string,
  dynamics: Dynamic[],
  categoryLabels: Record<CategoryKey | 'LEVMEL' | 'CHIP', string>,
) {
  if (rankFilter.startsWith('DIN:')) {
    const din = dynamics.find((d) => d.id === rankFilter.slice(4));
    if (din) {
      const { from, to } = intersectDynamicPeriod(din, dashFrom, dashTo);
      return { from, to, catFilter: 'ALL' as const, label: din.titulo, dinamica: din };
    }
    return { from: dashFrom, to: dashTo, catFilter: 'ALL' as const, label: 'Todas', dinamica: null };
  }
  if (rankFilter === 'LEVMEL') return { from: dashFrom, to: dashTo, catFilter: 'LEVMEL' as const, label: categoryLabels.LEVMEL, dinamica: null };
  if (rankFilter === 'CHIP') return { from: dashFrom, to: dashTo, catFilter: 'CHIP' as const, label: categoryLabels.CHIP, dinamica: null };
  // DSM isn't a sales category — there's no CategoryKey for it, so this
  // reuses 'ALL' as a safe catFilter placeholder (goals/effectiveMetaGeral
  // already special-case 'ALL' instead of indexing goals[catFilter]).
  // DashboardPage's isDsmMode overrides every actual value derived from
  // this (ranking, meta bar, stat cards) before it reaches the screen.
  if (rankFilter === 'DSM') return { from: dashFrom, to: dashTo, catFilter: 'ALL' as const, label: 'DSM', dinamica: null };
  // UVC também não é uma CategoryKey — mesmo placeholder 'ALL' que DSM usa
  // acima; DashboardPage's isUvcMode sobrescreve ranking/barra/cards antes
  // de chegar na tela, igual isDsmMode já faz.
  if (rankFilter === 'UVC') return { from: dashFrom, to: dashTo, catFilter: 'ALL' as const, label: 'UVC', dinamica: null };
  const found = RANK_FILTERS.find((x) => x.k === rankFilter);
  // rankFilter here is one of RANK_FILTERS' keys ('ALL'|'DERM'|'GEN'|'MP') —
  // the DIN:/LEVMEL/CHIP cases were already returned above, but .startsWith()
  // isn't a type guard so TS can't narrow the template-literal member out.
  // 'ALL' always shows the store's own (customizable) "Mercadoria Geral"
  // label, same as the button itself — see RANK_FILTERS above.
  const label = rankFilter === 'ALL' ? categoryLabels.MER : categoryLabels[rankFilter as CategoryKey] ?? found?.l ?? 'Todas';
  return { from: dashFrom, to: dashTo, catFilter: rankFilter as CategoryKey | 'ALL', label, dinamica: null };
}

function RankFilterBar({
  dynamics,
  hiddenCategories,
  dsmLabel,
}: {
  dynamics: Dynamic[];
  hiddenCategories: string[];
  /** category_types.nome for the 'dsm' row, only when it's ativo — null
   * hides the button, same "ocultar" rule the sidebar/DSM page follow. */
  dsmLabel: string | null;
}) {
  const { rankFilter, setRankFilter } = useDateRange();
  const categoryLabels = useCategoryLabelMap();
  const today = todayISO();
  const activeDynamics = dynamics.filter((d) => d.dataFim >= today);
  // 'ALL' shows the store's "Mercadoria Geral" label/total (see the comment
  // above RANK_FILTERS) — hiding MER hides this button too, per ADM
  // Nomes das Categorias (store_settings.hidden_categories).
  const visibleFilters = [...RANK_FILTERS, { k: 'LEVMEL' as RankFilter, l: 'Levmel' }, { k: 'CHIP' as RankFilter, l: 'Chip' }].filter(
    (x) => !hiddenCategories.includes(x.k === 'ALL' ? 'MER' : x.k),
  );

  return (
    <>
      {/* Botões de categoria esticados, mesma largura entre si, ocupando a
          linha inteira — antes disputavam espaço com Copiar/Gerar
          imagem/Premium na mesma linha (clamp() encolhendo tudo); agora
          que esses 3 botões moraram embaixo do pódio (ver `footer` de
          PodiumSplit), essa linha é só dos filtros (pedido explícito do
          usuário, 2026-10-27). */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 4 }}>
        <HelpTip helpKey="dashboard.filtro_categoria" fallback="Escolha uma categoria para ver só as vendas dela na tela e no ranking." />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 6 }}>
        {visibleFilters.map((x) => (
          <SubtabButton key={x.k} active={rankFilter === x.k} onClick={() => setRankFilter(x.k)} stretch>
            {/* Abreviação só para este filtro da tela Início — o rótulo completo
                (customizável em ADM > Nomes das Categorias) continua em todo o
                resto do sistema. 'ALL' shows categoryLabels.MER directly since
                categoryLabels has no 'ALL' entry of its own (see RANK_FILTERS). */}
            {x.k === 'DERM' ? 'DERMO' : x.k === 'ALL' ? categoryLabels.MER : (categoryLabels[x.k as keyof typeof categoryLabels] ?? x.l)}
          </SubtabButton>
        ))}
        {dsmLabel && (
          <SubtabButton active={rankFilter === 'DSM'} onClick={() => setRankFilter('DSM')} stretch>
            🎟️ DSM
          </SubtabButton>
        )}
        <SubtabButton active={rankFilter === 'UVC'} onClick={() => setRankFilter('UVC')} stretch>
          📈 UVC
        </SubtabButton>
      </div>
      {activeDynamics.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          {activeDynamics.map((d) => (
            <SubtabButton key={d.id} active={rankFilter === `DIN:${d.id}`} onClick={() => setRankFilter(`DIN:${d.id}`)}>
              🎯 {d.marca || 'DINÂMICA'}
            </SubtabButton>
          ))}
        </div>
      )}
    </>
  );
}

// `stretch` makes the button fill its grid cell (width:100%, centered text)
// — used by the main category-filter row (RankFilterBar), now that it has
// the whole "Ranking Geral" header row to itself (Copiar/Gerar
// imagem/Premium moved below the pódio, see `footer` on PodiumSplit —
// pedido explícito do usuário, 2026-10-27). Without `stretch` (e.g. the
// Dinâmicas row below), the button keeps its original fit-content sizing.
function SubtabButton({ active, onClick, children, stretch }: { active: boolean; onClick: () => void; children: ReactNode; stretch?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? '#ffb700' : 'transparent',
        border: `1px solid ${active ? '#ffb700' : '#212948'}`,
        color: active ? '#231a02' : '#8b90bf',
        padding: stretch ? '8px 6px' : '7px 13px',
        borderRadius: 10,
        cursor: 'pointer',
        fontSize: stretch ? 11 : 12,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '.04em',
        whiteSpace: 'nowrap',
        overflow: stretch ? 'hidden' : undefined,
        textOverflow: stretch ? 'ellipsis' : undefined,
        width: stretch ? '100%' : undefined,
        textAlign: stretch ? 'center' : undefined,
        flexShrink: stretch ? undefined : 0,
      }}
    >
      {children}
    </button>
  );
}

// Botões do rodapé do pódio (Copiar ranking/Gerar imagem), mesma largura
// entre si (flex:1) — RankingModeToggle usa seu próprio prop `fill` pro
// mesmo efeito, já que não é um <button> que dá pra estilizar por fora.
const ACTION_BUTTON_STYLE: CSSProperties = {
  flex: 1,
  padding: '8px 6px',
  borderRadius: 10,
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

function CategoryGauge({ label, valor, goal, color }: { label: string; valor: number; goal: number; color: string }) {
  const pct = goal > 0 ? Math.min(100, (valor / goal) * 100) : 0;
  return (
    <div style={{ textAlign: 'center', containerType: 'inline-size' } as CSSProperties}>
      <div style={{ width: '100%', maxWidth: 88, margin: '0 auto' }}>
        <SemicircleGauge pct={pct} color={color} trackColor="rgba(255,255,255,.07)" strokeWidth={16} />
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 'clamp(11px, 15cqi, 16px)', fontWeight: 700, marginTop: 4, color }}>
        {pct.toFixed(0)}%
      </div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.03em', fontWeight: 700, marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 'clamp(8.5px, 11cqi, 11px)', color: '#8b90bf', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {fmtMoney(valor)}
      </div>
      <div style={{ fontSize: 'clamp(8.5px, 11cqi, 11px)', color: '#8b90bf', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        meta {fmtMoney(goal)}
      </div>
    </div>
  );
}

function StatCard({ label, value, color, badge }: { label: string; value: string; color: string; badge?: string }) {
  return (
    <div
      style={
        {
          background: '#0b0e1d',
          border: `1px solid ${color}`,
          borderRadius: 14,
          padding: '9px 10px',
          height: '100%',
          containerType: 'inline-size',
        } as CSSProperties
      }
    >
      <div style={{ fontSize: 9, color: '#8b90bf', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4, fontWeight: 700 }}>
        {label}
        {badge && (
          <span style={{ marginLeft: 8, fontSize: 10, background: '#ffb700', color: '#231a02', padding: '2px 6px', borderRadius: 6, fontWeight: 800 }}>
            {badge}
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 'clamp(9px, 11cqi, 17px)',
          fontWeight: 700,
          fontFamily: "'JetBrains Mono', monospace",
          color,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { profile } = useAuth();
  const categoryLabels = useCategoryLabelMap();
  const [rankingCopied, setRankingCopied] = useState(false);
  const [imageScopeOpen, setImageScopeOpen] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingProgress, setGeneratingProgress] = useState({ done: 0, total: 0 });
  const [rankingImageModal, setRankingImageModal] = useState<{ url: string; copied: boolean } | null>(null);
  const [multiImages, setMultiImages] = useState<MultiImageResult[] | null>(null);
  const [bestDayExpanded, setBestDayExpanded] = useState(false);
  const { data: collaborators, isError: collaboratorsError } = useCollaborators();
  const { data: goals, isError: goalsError } = useGoals();
  const { data: storeSettings, isError: storeSettingsError } = useStoreSettings();
  const { data: store } = useStore();
  const { data: billingCycle } = useStoreBillingCycle();
  const { data: dsmRecords } = useDsmRecords();
  const { data: clientServiceRecords } = useClientServiceRecords();
  const { data: categoryTypes } = useCategoryTypes();
  const dsmCategory = categoryTypes?.find((c) => c.chave === 'dsm');
  const { data: specialLists, isError: specialListsError } = useSpecialLists();
  const { data: dynamics, isError: dynamicsError } = useDynamics();
  const { dashFrom, dashTo, refYear, refMonth, rankFilter, modoGeral, setRankFilter } = useDateRange();
  const isUvcMode = rankFilter === 'UVC';
  const updateStoreSettings = useUpdateStoreSettings(profile?.store_id);

  // Plano de Ação Tartaruga (Desktop): categoria/colaborador totals — the
  // ranking, the "Vendas por Categoria" gauges, the meta/falta/saldo cards
  // and the "Gerar imagem" specs — used to be computeSummary()/catTotals()
  // full passes over the whole `sales` array, redone on every render this
  // page re-renders for (opening a modal, the "copiado" toast, a filter
  // click). They now read from the same pre-aggregated
  // mobile_category_totals() rows the mobile app already uses (see
  // migrations 0093/0094) — same reasoning, same source of truth, just
  // reused here instead of client-side scanning. `salesData` stays in use
  // below for the pieces that genuinely need item-level detail: the "Melhor
  // Dia de Vendas" card, the Evolução Diária chart, and a Dinâmica-filtered
  // ranking (dynamics match products by their own rules, not a fixed
  // categoria the rollup knows about).
  const { data: categoryTotals, isError: categoryTotalsError } = useMobileCategoryTotals(dashFrom, dashTo);
  const now = new Date();
  const currentMonthFirst = monthFirstISO(now.getFullYear(), now.getMonth());
  const currentMonthLast = monthLastISO(now.getFullYear(), now.getMonth());
  const { data: monthToDateTotals, isError: monthToDateTotalsError } = useMobileCategoryTotals(currentMonthFirst, todayISO());

  // Only the 3 pieces below still need item-level sales instead of
  // pre-aggregated totals (see the comment above categoryTotals): "Melhor
  // Dia de Vendas" (scans the real current month), the Evolução Diária
  // chart (scans whichever month the date picker is browsing), and a
  // Dinâmica-filtered ranking (its own period, intersected with dashFrom/
  // dashTo). Instead of useSales()'s full multi-month history, this fetches
  // only the union of those three windows — in the common case (today,
  // current month, no custom range) that's a single month, not the whole
  // retained history, and it never grows with it.
  const monthFirst = monthFirstISO(refYear, refMonth);
  const monthLast = monthLastISO(refYear, refMonth);
  const salesRangeFrom = [currentMonthFirst, monthFirst, dashFrom].sort()[0];
  const salesRangeTo = [currentMonthLast, monthLast, dashTo].sort().at(-1)!;
  const { data: sales } = useSalesInRange(salesRangeFrom, salesRangeTo);
  // Numerador do UVC — buscado sempre (não só quando o filtro UVC está
  // ativo), na mesma janela união que `sales` acima usa: cobre tanto o
  // dashFrom/dashTo do ranking/barra em modo UVC (isUvcMode) quanto o mês
  // inteiro que a Evolução Diária pode estar exibindo e a geração de imagem
  // "Todas as categorias" (allCategorySpecs) — computeUvcSummary/
  // computeUvcDailyRows já filtram por fromDate/toDate internamente, então
  // buscar essa janela mais ampla aqui não muda o resultado de nenhum dos
  // três usos, só evita um 2º fetch por range. Precisa de granularidade
  // diária (não só o total do período, como categoryTotals) pro Modo Geral
  // calcular a média das razões diárias em vez da razão do total do mês —
  // ver uvc.ts.
  const { data: dailyItensUvc } = useDailyItemsSoldByCollaborator(salesRangeFrom, salesRangeTo);

  // Seta de tendência (dia anterior) — só faz sentido com um único dia
  // selecionado (dashFrom === dashTo); fora disso não há um "dia anterior"
  // único pra comparar (decisão do usuário, 2026-10-24). Busca própria,
  // sempre o dia de calendário imediatamente anterior, independente da
  // categoria/filtro selecionado no momento — troca de categoria não dispara
  // um novo fetch. categoryTotals cobre as 6 categorias fixas + Levmel/Chip;
  // dsmRecords/clientServiceRecords já vêm completos (sem filtro de data,
  // ver seus próprios fetches acima); UVC precisa da sua própria busca por
  // dia porque dailyItensUvc é por período. Dinâmicas ficam fora do escopo
  // desta seta (ver previousValueMap abaixo).
  const previousDayISO = dashFrom === dashTo ? addDaysISO(dashFrom, -1) : null;
  const { data: prevDayCategoryTotals } = useMobileCategoryTotals(previousDayISO ?? dashFrom, previousDayISO ?? dashFrom, !!previousDayISO);
  const { data: prevDayItensUvc } = useDailyItemsSoldByCollaborator(previousDayISO ?? dashFrom, previousDayISO ?? dashFrom, !!previousDayISO);

  // rankFilter lives in DateRangeContext, shared with RankingPage — sem
  // isso, escolher uma categoria lá (ou aqui, numa visita anterior) deixava
  // a Tela Início sempre "presa" naquela categoria da próxima vez que fosse
  // aberta. Volta sempre para Mercadoria Geral ao entrar/retornar aqui —
  // a menos que a própria loja tenha ocultado essa categoria (ADM > Nomes
  // das Categorias), caso em que não haveria botão nenhum destacado; nesse
  // caso cai para a primeira categoria ainda visível.
  useEffect(() => {
    if (storeSettings?.hidden_categories.includes('MER')) {
      const fallback = ([...RANK_FILTERS.slice(1), { k: 'LEVMEL' as RankFilter }, { k: 'CHIP' as RankFilter }] as { k: RankFilter }[]).find(
        (x) => !storeSettings.hidden_categories.includes(x.k as string),
      );
      setRankFilter(fallback?.k ?? 'ALL');
    } else {
      setRankFilter('ALL');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeSettings?.hidden_categories]);

  // Safe stand-ins for the useMemo calls below, so their hook call order
  // never depends on whether every query has resolved yet — the
  // "Carregando…" guard has to come after them, not before: the Rules of
  // Hooks require the same hooks run in the same order on every render,
  // and a hook that only runs once data has loaded breaks that the moment
  // this component re-renders after the guard stops firing.
  const salesData = sales ?? [];
  const collaboratorsData = collaborators ?? [];

  const modoDia = dashFrom === dashTo;
  const mode = modoDia ? 'dia' : 'mes';
  const proration = useMemo(() => goalProration(dashFrom, dashTo, modoGeral), [dashFrom, dashTo, modoGeral]);
  const rankFilterParams = resolveRankFilterParams(rankFilter, dashFrom, dashTo, dynamics ?? [], categoryLabels);

  // Store-wide grand total (Mercadoria Geral) for the selected dashFrom/
  // dashTo range — a single sum over the already-aggregated rows instead of
  // a full computeSummary() pass over every sale.
  const totalAll = sumCategoryTotals(categoryTotals ?? [], 'ALL');
  const totalValor = totalAll.valor;
  const totalItens = totalAll.qtd;

  // "Vendas por Categoria" gauges — 3 sumCategoryTotals() lookups (MER
  // reuses totalAll above instead of a 4th) plus a getGoalFromTotals() per
  // category.
  const gaugeData = useMemo(() => {
    if (!goals) return [];
    return CAT_KEYS.map((k) => {
      const t = k === 'MER' ? { valor: totalValor, qtd: totalItens } : sumCategoryTotals(categoryTotals ?? [], k);
      const goal = getGoalFromTotals(goals[k], mode, monthToDateTotals ?? [], collaboratorsData, proration);
      return { key: k, valor: t.valor, goal };
    });
  }, [categoryTotals, collaboratorsData, goals, mode, proration, totalValor, totalItens, monthToDateTotals]);

  // "Melhor Dia de Vendas" always tracks the real current month (like the
  // achievement-celebration check), regardless of which month the date
  // picker (refYear/refMonth) is currently browsing — it's meant to answer
  // "what's our record day so far this month", not "in the period I'm
  // looking at". Naturally re-picks the new leader the moment a day's total
  // surpasses the previous best, since it's just a max over the month's
  // sales rather than a value stored anywhere.
  const bestDay = useMemo(() => {
    const now = new Date();
    const currentMonthFirst = monthFirstISO(now.getFullYear(), now.getMonth());
    const currentMonthLast = monthLastISO(now.getFullYear(), now.getMonth());
    const byDay = new Map<string, number>();
    salesData.forEach((s) => {
      if (!s.dataISO || s.dataISO < currentMonthFirst || s.dataISO > currentMonthLast) return;
      byDay.set(s.dataISO, (byDay.get(s.dataISO) ?? 0) + (Number(s.valor) || 0));
    });
    let best: { dateISO: string; valor: number } | null = null;
    byDay.forEach((valor, dateISO) => {
      if (!best || valor > best.valor) best = { dateISO, valor };
    });
    return best;
  }, [salesData]);

  // DSM não é uma categoria de vendas — não roda por computeSummary/sales
  // nenhum. 'DSM' é tratado à parte aqui, mapeando as linhas de
  // computeDsmSummary para o mesmo formato SummaryRow que o resto da tela
  // já espera (valor = itens = conversões), o que deixa todo o resto do
  // ranking (podium, ordenação, "Copiar ranking") funcionar sem duplicar
  // lógica — só os cartões de meta/R$ (que não fazem sentido pro DSM) são
  // sobrescritos separadamente mais abaixo (ver isDsmMode).
  const isDsmMode = rankFilter === 'DSM';
  // UVC = itens vendidos ÷ atendimentos, uma RAZÃO — não dá pra ranquear
  // nem somar do mesmo jeito que DSM soma conversões; ver uvc.ts. O ranking
  // usa `uvc` tanto em `valor` quanto `itens` (mesma convenção do DSM
  // acima, valor = itens = a métrica em si), mas o "total da loja" nunca
  // pode vir de rankingFiltered.reduce(...) — só de uvcSummary.totals,
  // calculado à parte (razão dos totais do período, ou média das razões
  // diárias no Modo Geral — ver computeUvcSummary). Calculado sempre (não só
  // quando isUvcMode), já que allCategorySpecs (geração de imagem "Todas as
  // categorias") também precisa do total/ranking de UVC independente do
  // filtro selecionado no momento.
  const uvcSummary = useMemo(
    () => computeUvcSummary(dailyItensUvc ?? [], clientServiceRecords ?? [], collaboratorsData, dashFrom, dashTo, modoGeral),
    [dailyItensUvc, clientServiceRecords, collaboratorsData, dashFrom, dashTo, modoGeral],
  );
  // Seta de tendência (dia anterior): valor de cada colaborador no dia de
  // venda anterior, na mesma métrica (itens ou valor) que o ranking atual
  // usa — null inteiro quando fora de "dia único" ou numa Dinâmica (fora do
  // escopo, ver chartCategoryFromRankFilter's mesmo raciocínio). LEVMEL/CHIP
  // comparam por itens (mesma convenção de isUnitRanking mais abaixo),
  // nunca por valor.
  const previousValueMap = useMemo(() => {
    if (!previousDayISO || rankFilterParams.dinamica) return null;
    const map = new Map<string, number>();
    if (isDsmMode) {
      computeDsmSummary(dsmRecords ?? [], collaboratorsData, previousDayISO, previousDayISO).forEach((r) => map.set(r.matricula, r.conversoes));
    } else if (isUvcMode) {
      computeUvcSummary(prevDayItensUvc ?? [], clientServiceRecords ?? [], collaboratorsData, previousDayISO, previousDayISO, false).rows.forEach((r) =>
        map.set(r.matricula, r.uvc),
      );
    } else {
      const catIsUnit = rankFilterParams.catFilter === 'LEVMEL' || rankFilterParams.catFilter === 'CHIP';
      summaryFromCategoryTotals(prevDayCategoryTotals ?? [], collaboratorsData, rankFilterParams.catFilter).forEach((r) =>
        map.set(r.matricula, catIsUnit ? r.itens : r.valor),
      );
    }
    return map;
  }, [previousDayISO, rankFilterParams.dinamica, rankFilterParams.catFilter, isDsmMode, isUvcMode, dsmRecords, prevDayItensUvc, clientServiceRecords, collaboratorsData, prevDayCategoryTotals]);
  const rankingFiltered = useMemo(() => {
    if (isDsmMode) {
      return computeDsmSummary(dsmRecords ?? [], collaboratorsData, dashFrom, dashTo).map((r) => ({
        matricula: r.matricula,
        nome: r.nome,
        apelido: r.apelido,
        foto: r.foto,
        metaIndividual: 0,
        qtd: { DERM: 0, GEN: 0, MP: 0, MER: 0, SEM: 0 },
        valor: r.conversoes,
        itens: r.conversoes,
      }));
    }
    if (isUvcMode) {
      return (uvcSummary?.rows ?? []).map((r) => ({
        matricula: r.matricula,
        nome: r.nome,
        apelido: r.apelido,
        foto: r.foto,
        metaIndividual: 0,
        qtd: { DERM: 0, GEN: 0, MP: 0, MER: 0, SEM: 0 },
        valor: r.uvc,
        itens: r.uvc,
      }));
    }
    // A Dinâmica matches products by its own rules (keyword/product list),
    // not a fixed categoria the totals rollup knows about — still needs
    // item-level sales. Every other case (the 6 fixed categories, 'ALL',
    // Levmel, Chip) reads the same pre-aggregated rows the gauges above use
    // — rankFilterParams.from/to always equal dashFrom/dashTo whenever it
    // isn't a Dinâmica (see resolveRankFilterParams), so categoryTotals
    // (already fetched for that exact range) is exactly right here too.
    return rankFilterParams.dinamica
      ? computeDinamicaRanking(
          { ...rankFilterParams.dinamica, dataInicio: rankFilterParams.from, dataFim: rankFilterParams.to },
          salesData,
          collaboratorsData,
        )
      : summaryFromCategoryTotals(categoryTotals ?? [], collaboratorsData, rankFilterParams.catFilter);
  }, [
    isDsmMode,
    dsmRecords,
    isUvcMode,
    uvcSummary,
    dashFrom,
    dashTo,
    rankFilterParams.dinamica,
    rankFilterParams.from,
    rankFilterParams.to,
    rankFilterParams.catFilter,
    categoryTotals,
    salesData,
    collaboratorsData,
  ]);

  // "Todas as categorias" image specs — 6 summaryFromCategoryTotals()
  // lookups over the already-aggregated rows instead of 6 computeSummary()
  // passes over the full `sales` array (this used to run inline inside
  // handleGenerateAllImages on every click, freezing the tab for as long as
  // those passes took, on top of the (now-parallelized, see
  // rankingImage.ts) image generation itself — memoized either way).
  const hiddenCategories = storeSettings?.hidden_categories ?? [];
  const allCategorySpecs = useMemo(() => {
    if (!goals) return [];
    const specs: CategoryImageSpec[] = RANKING_CATEGORIES.filter((c) => !hiddenCategories.includes(c.key)).map((c) => {
      const isUnit = c.key === 'LEVMEL' || c.key === 'CHIP';
      // Mercadoria Geral is the store's grand total, not its own exclusive
      // bucket (sale.grupo === 'MER' is only the classification's leftover
      // fallback) — same `'MER' ? 'ALL' : ...` convention already used for
      // the gauges above, CategoryPage, RankingPage and everywhere else MER
      // means "every sale". This spec list skipped it, so the generated
      // image for Mercadoria Geral undercounted whenever the loja also had
      // DERM/GEN/MP sales.
      const rowsRaw = summaryFromCategoryTotals(categoryTotals ?? [], collaboratorsData, c.key === 'MER' ? 'ALL' : c.key);
      return {
        key: c.key,
        titulo: categoryLabels[c.key] ?? c.titulo,
        rows: isUnit ? rowsRaw.map((r) => ({ ...r, valor: r.itens })) : rowsRaw,
        isUnit,
        metaDiaria: getGoalFromTotals(goals[c.key], 'dia', monthToDateTotals ?? [], collaboratorsData),
      };
    });
    // DSM não é uma CategoryKey (não vem de `sales`/categoryTotals — ver
    // isDsmMode acima) então entra à parte, só quando a própria loja não a
    // ocultou (mesmo "ativo" que Sidebar/RankFilterBar já respeitam).
    if (dsmCategory?.ativo) {
      const dsmRanking = computeDsmSummary(dsmRecords ?? [], collaboratorsData, dashFrom, dashTo);
      const dsmGoal = (goals as unknown as Partial<Record<'DSM', Goal>>).DSM;
      specs.push({
        key: 'DSM',
        titulo: dsmCategory.nome,
        rows: dsmRanking.map((r) => ({ nome: r.nome, apelido: r.apelido, foto: r.foto, valor: r.conversoes })),
        isUnit: true,
        unitLabel: 'conv.',
        metaDiaria: getGoalFromTotals(dsmGoal, 'dia', monthToDateTotals ?? [], collaboratorsData),
      });
    }
    // UVC também não é uma CategoryKey (ver isUvcMode acima) e, diferente de
    // DSM, não tem um "ativo"/ocultar próprio — o botão de filtro na tela
    // sempre aparece (RankFilterBar), então a imagem entra sempre também.
    // Igual ao resto do ranking de UVC (rankingFiltered/barValor acima), o
    // total não pode vir da soma das razões de `uvcSummary.rows` — só de
    // uvcSummary.totals.uvc, passado à parte via totalOverride/totalLabel
    // (rankingImage.ts) em vez do `ranking.reduce((a,r)=>a+r.valor)` padrão.
    // valueFormatter: fmtUvc garante "R$ 3,6" (1 casa decimal) tanto nas
    // barras individuais quanto no total, em vez de fmtMoney/contagem.
    specs.push({
      key: 'UVC',
      titulo: 'UVC',
      rows: uvcSummary.rows.map((r) => ({ nome: r.nome, apelido: r.apelido, foto: r.foto, valor: r.uvc })),
      isUnit: false,
      valueFormatter: fmtUvc,
      totalOverride: uvcSummary.totals.uvc ?? 0,
      totalLabel: 'UVC GERAL DA LOJA',
    });
    return specs;
  }, [categoryTotals, collaboratorsData, goals, dashFrom, dashTo, categoryLabels, hiddenCategories, dsmCategory, dsmRecords, monthToDateTotals, uvcSummary]);

  // Checked BEFORE the "still missing" guard below — see PageError's own
  // comment for why: a query that already gave up leaves `data` undefined
  // forever too, which used to be indistinguishable from "still loading".
  // `sales` deliberately isn't part of either check: it only backs 3 of
  // this page's many sections (see the comment above its fetch) — those 3
  // already fall back to an empty array (`salesData` below) while it's
  // still loading or if it errors, instead of holding up everything else
  // (the totals-based cards, which never depended on it) behind a full
  // network round trip.
  if (collaboratorsError || goalsError || storeSettingsError || specialListsError || dynamicsError || categoryTotalsError || monthToDateTotalsError) {
    return <PageError />;
  }

  if (!collaborators || !goals || !storeSettings || !specialLists || !dynamics || !categoryTotals || !monthToDateTotals) {
    return <PageLoading />;
  }

  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

  const isUnitRanking =
    isDsmMode ||
    isUvcMode ||
    rankFilterParams.catFilter === 'LEVMEL' ||
    rankFilterParams.catFilter === 'CHIP' ||
    rankFilterParams.dinamica?.metrica === 'unidade';
  // "un." pra Levmel/Chip, "conv." pro DSM — mesma trilha de formatação
  // (isUnitRanking), só troca o sufixo mostrado. UVC nem entra nessa
  // trilha: é uma razão (1 casa decimal, sem sufixo), não uma contagem —
  // fmtValue trata isso à parte, antes de chegar no `${v} ${unitSuffix}`.
  const unitSuffix = isDsmMode ? 'conv.' : 'un.';
  const fmtValue = (v: number) => (isUvcMode ? fmtUvc(v) : isUnitRanking ? `${v} ${unitSuffix}` : fmtMoney(v));
  const rankingFilteredList = rankingFiltered.filter((r) => r.valor > 0 || r.itens > 0);
  const modeloRanking = storeSettings.modelo_ranking as 'escadinha' | 'lista';

  // Barra de evolução (topo): "Venda total do período" + "Atingim. período"
  // ligados à categoria escolhida no filtro de ranking logo abaixo — antes
  // sempre mostravam o total/meta da loja inteira (MER) mesmo com outra
  // categoria selecionada. rankingFiltered já é o mesmo total filtrado por
  // categoria que o ranking abaixo usa, então reaproveita-lo aqui garante
  // que os dois nunca divirjam. Modo Geral compara com a Meta Geral (mês
  // inteiro, sem proração — Modo Geral já É o mês inteiro); Busca período/
  // Dia único sempre compara com a Meta Diária dessa categoria (nunca
  // prorateada pelo tamanho do período: "meta do dia" é sempre o alvo de um
  // único dia), a mesma meta diária redistribuída — (meta mensal - já
  // vendido no mês) / dias restantes — que EVOLUÇÃO DIÁRIA já usa. 'ALL'
  // (Mercadoria Geral) usa o mesmo fallback que effectiveMetaGeral() já
  // aplica no resto da tela.
  // UVC nunca soma o ranking (isso somaria razões — sem significado, ver
  // uvc.ts): o "total do período" é sempre a razão dos totais da loja,
  // calculada à parte em uvcSummary. `?? 0` só pra manter barValor como
  // number (usado em contas abaixo que já ficam neutralizadas por
  // barMetaBase=0 quando isUvcMode) — o visor da barra usa fmtUvc direto
  // no JSX, que mostra "—" para null em vez de "0,0".
  const barValor = isUvcMode
    ? (uvcSummary?.totals.uvc ?? 0)
    : isUnitRanking
      ? rankingFiltered.reduce((a, r) => a + r.itens, 0)
      : rankingFiltered.reduce((a, r) => a + r.valor, 0);
  const barGoalMode = modoGeral ? 'mes' : 'dia';
  // DSM/UVC não têm meta cadastrada (não são categorias de venda) — sem
  // isso, catFilter cai no fallback 'ALL' (ver resolveRankFilterParams) e
  // mostraria a Meta Geral em R$ da loja inteira ao lado de um ranking em
  // conversões/UVC, o que não faz sentido nenhum.
  const barMetaBase = isDsmMode || isUvcMode
    ? 0
    : rankFilterParams.catFilter === 'ALL'
      ? effectiveMetaGeralFromTotals(goals, barGoalMode, monthToDateTotals, collaborators, storeSettings.meta_geral_fallback)
      : getGoalFromTotals(goals[rankFilterParams.catFilter], barGoalMode, monthToDateTotals, collaborators);
  const barSuperBase = isDsmMode || isUvcMode
    ? 0
    : rankFilterParams.catFilter === 'ALL'
      ? getSuperMetaFromTotals(goals.MER, barGoalMode, monthToDateTotals, collaborators)
      : getSuperMetaFromTotals(goals[rankFilterParams.catFilter], barGoalMode, monthToDateTotals, collaborators);
  const atingiuBarMeta = barMetaBase > 0 && barValor >= barMetaBase;
  let barPct: number;
  let barMarker: number | null = null;
  if (atingiuBarMeta && barSuperBase > barMetaBase) {
    barPct = Math.min(100, (barValor / barSuperBase) * 100);
    barMarker = (barMetaBase / barSuperBase) * 100;
  } else {
    barPct = barMetaBase > 0 ? Math.min(100, (barValor / barMetaBase) * 100) : 0;
  }

  // Cards "Meta"/"Falta p/ Meta"/"Saldo"/"Itens Vendidos" (abaixo, ao lado
  // do ranking): seguem a mesma categoria e a mesma meta (geral ou diária,
  // normal ou super) que a barra de evolução acima já está mostrando — os
  // dois nunca podem divergir, já que vêm exatamente dos mesmos
  // barValor/barMetaBase/barSuperBase.
  let metaLabel: string;
  let faltaLabel: string;
  let faltaValor: number;
  let metaExibida: number;
  if (atingiuBarMeta && barSuperBase > barMetaBase) {
    metaLabel = modoGeral ? 'Super Meta' : 'Super Meta do Dia';
    metaExibida = barSuperBase;
    faltaValor = Math.max(0, barSuperBase - barValor);
    faltaLabel = 'Falta p/ Super Meta';
  } else {
    metaLabel = modoGeral ? 'Meta Geral' : 'Meta Diária';
    metaExibida = barMetaBase;
    faltaValor = Math.max(0, barMetaBase - barValor);
    faltaLabel = 'Falta p/ Meta';
  }
  // Sem meta cadastrada pro DSM, "Meta Geral: 0"/"Falta p/ Meta: 0" não diria
  // nada de útil — mostra em vez disso os mesmos dois números da tela
  // própria do DSM (DsmPage.tsx): dias restantes do mês e quantos
  // colaboradores converteram no período.
  if (isDsmMode) {
    metaLabel = 'Dias restantes do mês';
    faltaLabel = 'Colaboradores participantes';
  }
  // UVC também não tem meta — mostra dois números úteis de verdade em vez
  // de "Meta Geral: 0"/"Falta p/ Meta: 0": o total de atendimentos
  // importados no período, e quantos colaboradores tiveram atendimento
  // (mesmo padrão do DSM acima, só trocando a métrica).
  if (isUvcMode) {
    metaLabel = 'Atendimentos no período';
    faltaLabel = 'Colaboradores participantes';
  }
  const saldo = barValor - barMetaBase;
  // Mesmo motivo de barValor acima: "Itens Vendidos" pro UVC é o total de
  // verdade (uvcSummary.totals.itens), nunca a soma das razões por
  // colaborador que rankingFiltered.reduce(...) daria.
  const itensCategoria = isUvcMode ? (uvcSummary?.totals.itens ?? 0) : rankingFiltered.reduce((a, r) => a + r.itens, 0);

  async function handleCopyRanking() {
    const text = formatRankingText(rankingFilteredList, rankFilterParams.label, rankFilterParams.from, rankFilterParams.to, store?.nome_loja);
    const ok = await copyText(text);
    setRankingCopied(ok);
    setTimeout(() => setRankingCopied(false), 1500);
  }

  async function handleGenerateSelectedImage() {
    setGeneratingImage(true);
    try {
      const rows = isUnitRanking ? rankingFilteredList.map((r) => ({ ...r, valor: r.itens })) : rankingFilteredList;
      // 'ALL' (and dynamics, which also resolve to 'ALL') has no single
      // category's own goal to fall back on — use the store-wide daily goal
      // (same one "Meta Diária" at the top of this page already tracks).
      const metaDiariaValor =
        rankFilterParams.catFilter === 'ALL'
          ? effectiveMetaGeralFromTotals(goals!, 'dia', monthToDateTotals ?? [], collaborators!, storeSettings!.meta_geral_fallback)
          : getGoalFromTotals(goals![rankFilterParams.catFilter], 'dia', monthToDateTotals ?? [], collaborators!);
      const blob = await generateRankingImageBlob(
        rows,
        rankFilterParams.label,
        rankFilterParams.from,
        rankFilterParams.to,
        store?.nome_loja,
        isUnitRanking,
        metaDiariaValor,
      );
      if (!blob) return;
      const copiedToClipboard = await tryCopyImage(blob);
      setRankingImageModal({ url: URL.createObjectURL(blob), copied: copiedToClipboard });
    } finally {
      setGeneratingImage(false);
    }
  }

  async function handleGenerateAllImages() {
    setGeneratingImage(true);
    setGeneratingProgress({ done: 0, total: allCategorySpecs.length });
    try {
      const results = await generateAllCategoryImages(allCategorySpecs, dashFrom, dashTo, store?.nome_loja, (done, total) =>
        setGeneratingProgress({ done, total }),
      );
      setMultiImages(results);
    } finally {
      setGeneratingImage(false);
      setGeneratingProgress({ done: 0, total: 0 });
    }
  }

  // Copiar ranking/Gerar imagem/Premium — construído uma vez e reusado nos
  // dois lugares que precisam dele (footer do pódio no modo Premium, linha
  // própria abaixo do ranking no modo escadinha/lista), em vez de duplicar
  // o JSX. Copiar ranking/Gerar imagem ainda não têm uma versão pro DSM nem
  // pro UVC (o texto/imagem gerados assumem R$ ou "un.") — desligados aqui
  // em vez de gerar uma saída errada; as telas próprias (/dsm, ADM > UVC)
  // também não oferecem essas duas ações hoje.
  const rankingActionButtons = (
    <>
      <button
        onClick={handleCopyRanking}
        disabled={isDsmMode || isUvcMode}
        title={isDsmMode || isUvcMode ? 'Ainda não disponível para este ranking' : 'Copiar ranking de vendas p/ WhatsApp'}
        style={{
          ...ACTION_BUTTON_STYLE,
          background: 'transparent',
          border: '1px solid #212948',
          color: '#8b90bf',
          opacity: isDsmMode || isUvcMode ? 0.4 : 1,
        }}
      >
        {rankingCopied ? '✓ Copiado!' : '📋 Copiar ranking'}
      </button>
      <button
        onClick={() => setImageScopeOpen(true)}
        disabled={generatingImage || isDsmMode || isUvcMode}
        title={isDsmMode || isUvcMode ? 'Ainda não disponível para este ranking' : 'Gerar imagem do ranking'}
        style={{
          ...ACTION_BUTTON_STYLE,
          background: 'transparent',
          border: '1px solid #ffb700',
          color: '#ffb700',
          opacity: generatingImage || isDsmMode || isUvcMode ? 0.5 : 1,
        }}
      >
        {generatingImage
          ? generatingProgress.total > 0
            ? `Gerando… (${generatingProgress.done}/${generatingProgress.total})`
            : 'Gerando…'
          : '🖼️ Gerar imagem'}
      </button>
      <RankingModeToggle on={storeSettings.ranking_moderno} onToggle={() => updateStoreSettings.mutate({ ranking_moderno: !storeSettings.ranking_moderno })} fill />
    </>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-2">
      {/* Each left/right pair below shares an explicit lg:row-start, so the
          grid's default align-items:stretch makes both cells in a row match
          height — their top and bottom edges line up, instead of two
          independently-flowing flex-col stacks that only coincidentally
          matched before. DOM order stays left-column-first so the mobile
          single-column layout (no lg: placement) keeps its original stacking
          order. */}
      <div className="lg:col-start-1 lg:row-start-1 min-w-0" style={{ background: 'rgba(0,0,0,.35)', border: '1px solid #00f0ff', borderRadius: 18, padding: '11px 16px' }}>
          {/* Logo | separador | venda total (esquerda) ... atingimento
              (direita) | separador | Melhor Dia de Vendas. The dividers use
              alignSelf:stretch + a top/bottom margin instead of a full-height
              border so they read as a short rule floating inside the row —
              never touching the card's own top/bottom edges (OBS 2). */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 130 }}>
              {store?.logo_url ? (
                <img src={store.logo_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#212948', flexShrink: 0 }} />
              )}
              <div>
                <div style={{ color: '#00f0ff', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>
                  {saudacao.toUpperCase()},
                </div>
                <div style={{ fontSize: 15, margin: '2px 0', fontWeight: 700 }}>{store?.nome_equipe || 'Equipe'}</div>
                <div style={{ color: '#8b90bf', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>Painel Geral</div>
              </div>
            </div>

            <div style={{ alignSelf: 'stretch', width: 1, background: '#212948', margin: '5px 0' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flex: '1 1 auto', minWidth: 200 }}>
              <div>
                <div style={{ color: '#ffb700', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>
                  ⭐ {isDsmMode ? 'Conversões DSM no período' : isUvcMode ? 'UVC geral do período' : 'Venda total do período'}
                </div>
                <div style={{ fontSize: 26, textShadow: '0 0 10px rgba(0,240,255,.55)' }}>
                  {/* UVC pode não ter nenhum atendimento importado no período —
                      fmtUvc(null) mostra "—", nunca "0,0" (que pareceria um
                      resultado real em vez de "sem dado"). */}
                  {isUvcMode ? fmtUvc(uvcSummary?.totals.uvc ?? null) : fmtValue(barValor)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {/* DSM/UVC não têm meta pra comparar "atingimento" — reaproveita
                    este espaço pra mostrar quantos colaboradores converteram/
                    tiveram atendimento no período em vez de um "0%" sem sentido. */}
                <div style={{ color: '#8b90bf', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                  {isDsmMode || isUvcMode ? 'Colaboradores' : 'Atingim. período'}
                </div>
                <div style={{ fontSize: 26, textShadow: '0 0 10px rgba(0,240,255,.55)', color: '#00f0ff' }}>
                  {isDsmMode || isUvcMode ? rankingFiltered.length : `${barPct.toFixed(0)}%`}
                </div>
              </div>
            </div>

            <div style={{ alignSelf: 'stretch', width: 1, background: '#212948', margin: '5px 0' }} />

            <BestDayCard bestDay={bestDay} expanded={bestDayExpanded} onToggle={() => setBestDayExpanded((v) => !v)} />
            {billingCycle && <BillingCycleClock cycle={billingCycle} />}
          </div>
          <div style={{ position: 'relative', height: 8, borderRadius: 5, background: '#080818', border: '1px solid #212948', overflow: 'hidden', marginTop: 8 }}>
            <div style={{ height: '100%', width: `${barPct}%`, background: 'linear-gradient(90deg,#00f0ff,#a82bff)', borderRadius: 5 }} />
            {barMarker !== null && <div style={{ position: 'absolute', top: -3, bottom: -3, width: 2, background: '#ffb700', left: `${barMarker}%` }} />}
          </div>
        </div>

        <div className="lg:col-start-1 lg:row-start-2 min-w-0 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          {/* Filtros de categoria ocupam a linha inteira agora — Copiar
              ranking/Gerar imagem/Premium moraram embaixo do pódio (ver
              `footer` de PodiumSplit abaixo), em vez de dividir essa linha
              com os filtros (pedido explícito do usuário, 2026-10-27). */}
          <RankFilterBar dynamics={dynamics} hiddenCategories={storeSettings.hidden_categories} dsmLabel={dsmCategory?.ativo ? dsmCategory.nome : null} />
          <div className="mt-3">
            {storeSettings.ranking_moderno ? (
              <PodiumSplit
                ranking={rankingFilteredList}
                getValue={(r) => (isUnitRanking ? r.itens : r.valor)}
                formatValue={fmtValue}
                bgUrl={storeSettings.ranking_podium_bg_url}
                spots={storeSettings.ranking_podium_spots as unknown as PodiumSpots | null}
                getPreviousValue={previousValueMap ? (r) => previousValueMap.get(r.matricula) ?? 0 : undefined}
                footer={<div style={{ display: 'flex', gap: 8 }}>{rankingActionButtons}</div>}
              />
            ) : (
              <>
                <PodiumStaircase
                  ranking={rankingFilteredList}
                  getValue={(r) => (isUnitRanking ? r.itens : r.valor)}
                  formatValue={fmtValue}
                  variant={modeloRanking}
                  getPreviousValue={previousValueMap ? (r) => previousValueMap.get(r.matricula) ?? 0 : undefined}
                />
                {/* Escadinha/lista não tem um "quadro do pódio" próprio pra
                    ancorar embaixo dele (só o Premium/PodiumSplit tem) —
                    aqui os 3 botões ficam numa linha própria, largura
                    inteira, logo abaixo do ranking inteiro. */}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>{rankingActionButtons}</div>
              </>
            )}
          </div>
        </div>

        {/* Evolução Diária now spans both columns — the champion cell that
            used to sit in row 3's right column moved to a small trophy
            button in AppShell's top header (see ChampionHeaderButton), so
            this chart stretches into the freed width instead of being
            capped at the left column's ~70%. */}
        <div className="lg:col-start-1 lg:row-start-3 lg:col-span-2 min-w-0">
          <DailyEvolutionChart
            catKey={chartCategoryFromRankFilter(rankFilter)}
            salesData={salesData}
            collaboratorsData={collaboratorsData}
            goals={goals}
            specialLists={specialLists}
            monthFirst={monthFirst}
            monthLast={monthLast}
            dsmRecords={dsmRecords ?? []}
            dsmLabel={dsmCategory?.nome}
            dailyItensUvc={dailyItensUvc ?? []}
            clientServiceRecords={clientServiceRecords ?? []}
          />
        </div>

        {/* Vendas por Categoria also spans both columns, same reasoning. */}
        <div className="lg:col-start-1 lg:row-start-4 lg:col-span-2 min-w-0 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-cyan-400 font-semibold text-sm mb-3">Vendas por Categoria</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5">
            {gaugeData.map((g) => (
              <CategoryGauge key={g.key} label={categoryLabels[g.key]} valor={g.valor} goal={g.goal} color={CAT_COLOR[g.key]} />
            ))}
          </div>
        </div>

        {/* Meta/Falta/Saldo/Itens sit at the top of the sidebar, level with
            the venda-total summary bar in the left column; the date filter
            comes next, level with the "Ranking Geral" card. The champion
            cell that used to sit here moved to a trophy button in the top
            header (ChampionHeaderButton, in AppShell) — Evolução Diária and
            Vendas por Categoria below now both span the freed width. */}
        <div className="lg:col-start-2 lg:row-start-1 grid grid-cols-2 gap-2">
          <StatCard
            label={metaLabel}
            value={
              isDsmMode
                ? `${diasRestantesNoMes()} dia(s)`
                : isUvcMode
                  ? (uvcSummary?.totals.atendimentos ?? 0).toLocaleString('pt-BR')
                  : formatChartValue(metaExibida, isUnitRanking)
            }
            color="#00f0ff"
            badge={!isDsmMode && !isUvcMode && atingiuBarMeta ? 'MG ✓' : undefined}
          />
          <StatCard
            label={faltaLabel}
            value={isDsmMode || isUvcMode ? String(rankingFiltered.length) : formatChartValue(faltaValor, isUnitRanking)}
            color="#a82bff"
          />
          {/* Sign hidden by design (visual only) — `saldo` itself stays negative for every calculation elsewhere. */}
          <StatCard label="Saldo" value={fmtValue(Math.abs(saldo))} color={saldo >= 0 ? '#ffb700' : '#ff3df0'} />
          {/* "Itens Vendidos" é sempre uma contagem de unidades, nunca um
              valor em R$ — fmtValue (R$ pras categorias monetárias) não
              fazia sentido aqui mesmo antes do UVC existir (correção
              2026-10-24 só cobriu o caso UVC; agora é padrão pra toda
              categoria — pedido explícito do usuário, 2026-10-27). */}
          <StatCard label="Itens Vendidos" value={`${itensCategoria.toLocaleString('pt-BR')} un.`} color="#14ff00" />
        </div>

        <div className="lg:col-start-2 lg:row-start-2">
          <SidebarCalendarCard />
        </div>

      {imageScopeOpen && (
        <GenerateImageScopeModal
          categoryLabel={rankFilterParams.label}
          onChooseSelected={() => {
            setImageScopeOpen(false);
            handleGenerateSelectedImage();
          }}
          onChooseAll={() => {
            setImageScopeOpen(false);
            handleGenerateAllImages();
          }}
          onClose={() => setImageScopeOpen(false)}
        />
      )}

      {rankingImageModal && (
        <RankingImageModal
          url={rankingImageModal.url}
          copied={rankingImageModal.copied}
          onClose={() => setRankingImageModal(null)}
          title={`Imagem — ${rankFilterParams.label}`}
          filename="ranking-vendas.png"
          alt="Ranking de vendas"
        />
      )}

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

function ToggleSwitch({ on, onToggle, title }: { on: boolean; onToggle: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={title}
      style={{
        width: 34,
        height: 18,
        borderRadius: 999,
        border: '1px solid #212948',
        background: on ? '#14ff00' : '#0b0e1d',
        position: 'relative',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'background .18s',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 1,
          left: on ? 17 : 1,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: on ? '#0b0e1d' : '#8b90bf',
          transition: 'left .18s',
        }}
      />
    </button>
  );
}

// Collapsed by default (OBS in the spec): only the toggle + "M.V." label show
// until switched on, so the top bar stays compact until an ADM actually wants
// to see the record day. `bestDay` always tracks the real current month (see
// its useMemo in DashboardPage), so a new record replaces the shown value
// automatically the moment that day's total overtakes it — nothing here
// needs to "know" a value changed, it just re-renders with the new max.
function BestDayCard({
  bestDay,
  expanded,
  onToggle,
}: {
  bestDay: { dateISO: string; valor: number } | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!expanded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ color: '#8b90bf', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>M.V.</div>
        <ToggleSwitch on={expanded} onToggle={onToggle} title="Exibir Melhor Dia de Vendas" />
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 170 }}>
      <div>
        <div style={{ color: '#8b90bf', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
          🔥 Melhor Dia de Vendas
        </div>
        {bestDay ? (
          <>
            <div style={{ fontSize: 12.5, color: '#8b90bf' }}>{fmtDateBR(bestDay.dateISO)}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#14ff00', fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtMoney(bestDay.valor)}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: '#8b90bf' }}>Sem vendas ainda</div>
        )}
      </div>
      <ToggleSwitch on={expanded} onToggle={onToggle} title="Ocultar Melhor Dia de Vendas" />
    </div>
  );
}

