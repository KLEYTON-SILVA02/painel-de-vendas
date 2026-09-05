import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { PageLoading } from '../../components/PageLoading';
import { useAuth } from '../../auth/AuthContext';
import { DailyEvolutionChart } from '../../components/dashboard/DailyEvolutionChart';
import { SemicircleGauge } from '../../components/SemicircleGauge';
import { SidebarCalendarCard } from '../../components/SidebarCalendarCard';
import { GenerateImageScopeModal } from '../../components/ranking/GenerateImageScopeModal';
import { MultiRankingImageModal } from '../../components/ranking/MultiRankingImageModal';
import { PodiumSplit, type PodiumSpots } from '../../components/ranking/PodiumSplit';
import { PodiumStaircase } from '../../components/ranking/PodiumStaircase';
import { RankingImageModal } from '../../components/ranking/RankingImageModal';
import { RankingModeToggle } from '../../components/ranking/RankingModeToggle';
import { CAT_KEYS, type CategoryKey } from '../../lib/business/classification';
import { computeDinamicaRanking, intersectDynamicPeriod } from '../../lib/business/dynamics';
import { effectiveMetaGeral, getGoal, getSuperMeta, goalProration } from '../../lib/business/goals';
import type { Dynamic } from '../../lib/business/types';
import { catTotals, computeSummary } from '../../lib/business/summary';
import { monthFirstISO, monthLastISO, todayISO } from '../../lib/dateRange';
import { fmtDateBR, fmtMoney } from '../../lib/format';
import { copyText, formatRankingText } from '../../lib/clipboard';
import { useUpdateStoreSettings } from '../../lib/mutations';
import { generateAllCategoryImages, generateRankingImageBlob, tryCopyImage, type MultiImageResult } from '../../lib/rankingImage';
import { useCollaborators, useDynamics, useGoals, useSales, useSpecialLists, useStore, useStoreSettings } from '../../lib/queries';
import { useDateRange, type RankFilter } from '../DateRangeContext';

const RANKING_CATEGORIES: { key: CategoryKey | 'LEVMEL' | 'CHIP'; titulo: string }[] = [
  { key: 'DERM', titulo: 'Dermo' },
  { key: 'GEN', titulo: 'Gen/Sim' },
  { key: 'MP', titulo: 'Marcas Excl.' },
  { key: 'MER', titulo: 'Merc. Geral' },
  { key: 'LEVMEL', titulo: 'Levmel' },
  { key: 'CHIP', titulo: 'Chip' },
];

const CAT_LABEL: Record<CategoryKey, string> = {
  DERM: 'Dermocosméticos',
  GEN: 'Genérico',
  MP: 'Marcas Exclusivas',
  MER: 'Mercadoria Geral',
};
const CAT_COLOR: Record<CategoryKey, string> = {
  DERM: '#ff3df0',
  GEN: '#14ff00',
  MP: '#a82bff',
  MER: '#ff6a00',
};

// Ported 1:1 from legacy/index-original.html (RANK_FILTERS).
const RANK_FILTERS: { k: RankFilter; l: string }[] = [
  { k: 'ALL', l: 'Todas' },
  { k: 'DERM', l: 'Dermo' },
  { k: 'GEN', l: 'Gen/Sim' },
  { k: 'MP', l: 'Marcas Excl.' },
  { k: 'MER', l: 'Merc. Geral' },
];

// Ported 1:1 from legacy/index-original.html (resolveRankFilterParams()).
function resolveRankFilterParams(rankFilter: RankFilter, dashFrom: string, dashTo: string, dynamics: Dynamic[]) {
  if (rankFilter.startsWith('DIN:')) {
    const din = dynamics.find((d) => d.id === rankFilter.slice(4));
    if (din) {
      const { from, to } = intersectDynamicPeriod(din, dashFrom, dashTo);
      return { from, to, catFilter: 'ALL' as const, label: din.titulo, dinamica: din };
    }
    return { from: dashFrom, to: dashTo, catFilter: 'ALL' as const, label: 'Todas', dinamica: null };
  }
  if (rankFilter === 'LEVMEL') return { from: dashFrom, to: dashTo, catFilter: 'LEVMEL' as const, label: 'Levmel', dinamica: null };
  if (rankFilter === 'CHIP') return { from: dashFrom, to: dashTo, catFilter: 'CHIP' as const, label: 'Chip', dinamica: null };
  const found = RANK_FILTERS.find((x) => x.k === rankFilter);
  // rankFilter here is one of RANK_FILTERS' keys ('ALL'|'DERM'|'GEN'|'MP'|'MER') —
  // the DIN:/LEVMEL/CHIP cases were already returned above, but .startsWith()
  // isn't a type guard so TS can't narrow the template-literal member out.
  return { from: dashFrom, to: dashTo, catFilter: rankFilter as CategoryKey | 'ALL', label: found?.l || 'Todas', dinamica: null };
}

function RankFilterBar({ dynamics, singleLine }: { dynamics: Dynamic[]; singleLine?: boolean }) {
  const { rankFilter, setRankFilter } = useDateRange();
  const today = todayISO();
  const activeDynamics = dynamics.filter((d) => d.dataFim >= today);

  return (
    <>
      <div style={{ display: 'flex', gap: 'clamp(3px, 0.5vw, 6px)', marginBottom: 6, flexWrap: singleLine ? 'nowrap' : 'wrap' }}>
        {[...RANK_FILTERS, { k: 'LEVMEL' as RankFilter, l: 'Levmel' }, { k: 'CHIP' as RankFilter, l: 'Chip' }].map((x) => (
          <SubtabButton key={x.k} active={rankFilter === x.k} onClick={() => setRankFilter(x.k)} shrink={singleLine}>
            {x.l}
          </SubtabButton>
        ))}
      </div>
      {activeDynamics.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          {activeDynamics.map((d) => (
            <SubtabButton key={d.id} active={rankFilter === `DIN:${d.id}`} onClick={() => setRankFilter(`DIN:${d.id}`)}>
              🎯 {d.titulo}
            </SubtabButton>
          ))}
        </div>
      )}
    </>
  );
}

// `shrink` scales padding/font-size down with the viewport (via clamp())
// instead of the fixed sizing every other use of this button keeps — only
// the Dashboard's "Ranking Geral" header needs it, where the category
// filters share one non-wrapping row with the Copiar/Gerar imagem/toggle
// buttons (ACTION_BUTTON_STYLE below matches the same clamp() curve) and a
// narrower desktop window otherwise cut the row off instead of everything
// shrinking to fit. Deliberately no flex-shrink here: shrinking a flex item
// narrower than its own (nowrap) text just makes the text spill out over
// whatever sits next to it — the RankFilterBar wrapper's own overflow-x is
// what catches whatever this clamp() floor still doesn't fit.
function SubtabButton({ active, onClick, children, shrink }: { active: boolean; onClick: () => void; children: ReactNode; shrink?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? '#ffb700' : 'transparent',
        border: `1px solid ${active ? '#ffb700' : '#212948'}`,
        color: active ? '#231a02' : '#8b90bf',
        padding: shrink ? 'clamp(2px, 0.4vw, 6px) clamp(3px, 0.7vw, 10px)' : '7px 13px',
        borderRadius: 10,
        cursor: 'pointer',
        fontSize: shrink ? 'clamp(6px, 0.7vw, 10px)' : 12,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '.04em',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

// Shared with SubtabButton's `shrink` curve above so the category filters
// and these action buttons shrink together, at the same rate, and the whole
// "Ranking Geral" header row keeps everything visible on one line instead
// of any of them getting clipped or forced into a scrollbar.
const ACTION_BUTTON_STYLE: CSSProperties = {
  padding: 'clamp(2px, 0.4vw, 6px) clamp(3px, 0.7vw, 10px)',
  borderRadius: 10,
  cursor: 'pointer',
  fontSize: 'clamp(6px, 0.7vw, 10px)',
  fontWeight: 700,
  whiteSpace: 'nowrap',
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
  const [rankingCopied, setRankingCopied] = useState(false);
  const [imageScopeOpen, setImageScopeOpen] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingProgress, setGeneratingProgress] = useState({ done: 0, total: 0 });
  const [rankingImageModal, setRankingImageModal] = useState<{ url: string; copied: boolean } | null>(null);
  const [multiImages, setMultiImages] = useState<MultiImageResult[] | null>(null);
  const [bestDayExpanded, setBestDayExpanded] = useState(false);
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: goals } = useGoals();
  const { data: storeSettings } = useStoreSettings();
  const { data: store } = useStore();
  const { data: specialLists } = useSpecialLists();
  const { data: dynamics } = useDynamics();
  const { dashFrom, dashTo, refYear, refMonth, rankFilter, modoGeral } = useDateRange();
  const updateStoreSettings = useUpdateStoreSettings(profile?.store_id);

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
  const monthFirst = monthFirstISO(refYear, refMonth);
  const monthLast = monthLastISO(refYear, refMonth);
  const rankFilterParams = resolveRankFilterParams(rankFilter, dashFrom, dashTo, dynamics ?? []);

  // Each of these walks the full `sales` array (up to 3 months of history
  // per REGRA 2's retention window) — in "Modo Geral" (whole month) that's
  // real work, and this component re-renders on unrelated state changes
  // (opening a modal, the "copiado" toast, image generation). Memoizing
  // keeps that work tied to the data/date-range actually changing instead
  // of redone on every render.
  const ranking = useMemo(
    () => computeSummary(salesData, collaboratorsData, dashFrom, dashTo),
    [salesData, collaboratorsData, dashFrom, dashTo],
  );
  const totalValor = ranking.reduce((a, r) => a + r.valor, 0);
  const totalItens = ranking.reduce((a, r) => a + r.itens, 0);

  // "Vendas por Categoria" gauges — 3 catTotals() full-array passes (MER
  // reuses totalValor/totalItens above instead of a 4th) plus a getGoal()
  // per category.
  const gaugeData = useMemo(() => {
    if (!goals) return [];
    return CAT_KEYS.map((k) => {
      const t = k === 'MER' ? { valor: totalValor, qtd: totalItens } : catTotals(salesData, dashFrom, dashTo, k);
      const goal = getGoal(goals[k], mode, salesData, collaboratorsData, proration);
      return { key: k, valor: t.valor, goal };
    });
  }, [salesData, collaboratorsData, goals, dashFrom, dashTo, mode, proration, totalValor, totalItens]);

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

  const rankingFiltered = useMemo(
    () =>
      rankFilterParams.dinamica
        ? computeDinamicaRanking(
            { ...rankFilterParams.dinamica, dataInicio: rankFilterParams.from, dataFim: rankFilterParams.to },
            salesData,
            collaboratorsData,
          )
        : computeSummary(salesData, collaboratorsData, rankFilterParams.from, rankFilterParams.to, rankFilterParams.catFilter, specialLists),
    [rankFilterParams.dinamica, rankFilterParams.from, rankFilterParams.to, rankFilterParams.catFilter, salesData, collaboratorsData, specialLists],
  );

  // "Todas as categorias" image specs — 6 computeSummary passes over the
  // full `sales` array. This used to run inline inside
  // handleGenerateAllImages on every click instead of being memoized like
  // every other full-array pass on this page, so clicking the button froze
  // the tab for as long as those 6 synchronous passes over a large `sales`
  // array took, on top of the (now-parallelized, see rankingImage.ts) image
  // generation itself.
  const allCategorySpecs = useMemo(() => {
    if (!goals) return [];
    return RANKING_CATEGORIES.map((c) => {
      const isUnit = c.key === 'LEVMEL' || c.key === 'CHIP';
      const rowsRaw = computeSummary(salesData, collaboratorsData, dashFrom, dashTo, c.key, specialLists);
      return {
        key: c.key,
        titulo: c.titulo,
        rows: isUnit ? rowsRaw.map((r) => ({ ...r, valor: r.itens })) : rowsRaw,
        isUnit,
        metaDiaria: getGoal(goals[c.key], 'dia', salesData, collaboratorsData),
      };
    });
  }, [salesData, collaboratorsData, goals, dashFrom, dashTo, specialLists]);

  if (!collaborators || !sales || !goals || !storeSettings || !specialLists || !dynamics) {
    return <PageLoading />;
  }

  const metaGeral = effectiveMetaGeral(goals, mode, sales, collaborators, storeSettings.meta_geral_fallback, proration);
  const metaSuper = getSuperMeta(goals.MER, mode, sales, collaborators, proration);
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

  const isUnitRanking =
    rankFilterParams.catFilter === 'LEVMEL' || rankFilterParams.catFilter === 'CHIP' || rankFilterParams.dinamica?.metrica === 'unidade';
  const rankingFilteredList = rankingFiltered.filter((r) => r.valor > 0 || r.itens > 0);
  const modeloRanking = storeSettings.modelo_ranking as 'escadinha' | 'lista';

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
          ? effectiveMetaGeral(goals!, 'dia', sales!, collaborators!, storeSettings!.meta_geral_fallback)
          : getGoal(goals![rankFilterParams.catFilter], 'dia', sales!, collaborators!);
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
                  ⭐ Venda total do período
                </div>
                <div style={{ fontSize: 26, textShadow: '0 0 10px rgba(0,240,255,.55)' }}>{fmtMoney(totalValor)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#8b90bf', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.08em' }}>Atingim. período</div>
                <div style={{ fontSize: 26, textShadow: '0 0 10px rgba(0,240,255,.55)', color: '#00f0ff' }}>{pct.toFixed(0)}%</div>
              </div>
            </div>

            <div style={{ alignSelf: 'stretch', width: 1, background: '#212948', margin: '5px 0' }} />

            <BestDayCard bestDay={bestDay} expanded={bestDayExpanded} onToggle={() => setBestDayExpanded((v) => !v)} />
          </div>
          <div style={{ position: 'relative', height: 8, borderRadius: 5, background: '#080818', border: '1px solid #212948', overflow: 'hidden', marginTop: 8 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#00f0ff,#a82bff)', borderRadius: 5 }} />
            {marker !== null && <div style={{ position: 'absolute', top: -3, bottom: -3, width: 2, background: '#ffb700', left: `${marker}%` }} />}
          </div>
        </div>

        <div className="lg:col-start-1 lg:row-start-2 min-w-0 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          {/* Category filters + Copiar/Gerar imagem/toggle all share this one
              non-wrapping row — every button here scales its padding/font
              via the same clamp() curve (SubtabButton's `shrink` prop,
              ACTION_BUTTON_STYLE, RankingModeToggle's `shrink` prop) so a
              narrower desktop window shrinks everything down together
              instead of clipping the tail end of the row. overflow-x lives
              on the filter-bar's own wrapper (not this outer row) so if the
              filters still don't fit at the clamp()s' floor, THEY scroll
              inside their own box — the flex:1 1 auto wrapper is otherwise
              allowed to shrink narrower than its content (min-width:0),
              which without a matching overflow here let that content spill
              out over the action buttons sitting right next to it instead
              of clipping/scrolling. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(4px, 1vw, 12px)', paddingBottom: 2 }}>
            <div style={{ flex: '1 1 auto', minWidth: 0, overflowX: 'auto' }}>
              <RankFilterBar dynamics={dynamics} singleLine />
            </div>
            <div style={{ display: 'flex', gap: 'clamp(3px, 0.5vw, 6px)', flexShrink: 0 }}>
              <button
                onClick={handleCopyRanking}
                title="Copiar ranking de vendas p/ WhatsApp"
                style={{
                  ...ACTION_BUTTON_STYLE,
                  background: 'transparent',
                  border: '1px solid #212948',
                  color: '#8b90bf',
                }}
              >
                {rankingCopied ? '✓ Copiado!' : '📋 Copiar ranking'}
              </button>
              <button
                onClick={() => setImageScopeOpen(true)}
                disabled={generatingImage}
                title="Gerar imagem do ranking"
                style={{
                  ...ACTION_BUTTON_STYLE,
                  background: 'transparent',
                  border: '1px solid #ffb700',
                  color: '#ffb700',
                  opacity: generatingImage ? 0.5 : 1,
                }}
              >
                {generatingImage
                  ? generatingProgress.total > 0
                    ? `Gerando… (${generatingProgress.done}/${generatingProgress.total})`
                    : 'Gerando…'
                  : '🖼️ Gerar imagem'}
              </button>
              <RankingModeToggle
                on={storeSettings.ranking_moderno}
                onToggle={() => updateStoreSettings.mutate({ ranking_moderno: !storeSettings.ranking_moderno })}
                shrink
              />
            </div>
          </div>
          <div className="mt-3">
            {storeSettings.ranking_moderno ? (
              <PodiumSplit
                ranking={rankingFilteredList}
                getValue={(r) => (isUnitRanking ? r.itens : r.valor)}
                formatValue={(v) => (isUnitRanking ? `${v} un.` : fmtMoney(v))}
                bgUrl={storeSettings.ranking_podium_bg_url}
                spots={storeSettings.ranking_podium_spots as unknown as PodiumSpots | null}
              />
            ) : (
              <PodiumStaircase
                ranking={rankingFilteredList}
                getValue={(r) => (isUnitRanking ? r.itens : r.valor)}
                formatValue={(v) => (isUnitRanking ? `${v} un.` : fmtMoney(v))}
                variant={modeloRanking}
              />
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
            salesData={salesData}
            collaboratorsData={collaboratorsData}
            goals={goals}
            specialLists={specialLists}
            monthFirst={monthFirst}
            monthLast={monthLast}
          />
        </div>

        {/* Vendas por Categoria also spans both columns, same reasoning. */}
        <div className="lg:col-start-1 lg:row-start-4 lg:col-span-2 min-w-0 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-cyan-400 font-semibold text-sm mb-3">Vendas por Categoria</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5">
            {gaugeData.map((g) => (
              <CategoryGauge key={g.key} label={CAT_LABEL[g.key]} valor={g.valor} goal={g.goal} color={CAT_COLOR[g.key]} />
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
          <StatCard label={metaLabel} value={fmtMoney(metaExibida)} color="#00f0ff" badge={atingiuMeta ? 'MG ✓' : undefined} />
          <StatCard label={faltaLabel} value={fmtMoney(faltaValor)} color="#a82bff" />
          {/* Sign hidden by design (visual only) — `saldo` itself stays negative for every calculation elsewhere. */}
          <StatCard label="Saldo" value={fmtMoney(Math.abs(saldo))} color={saldo >= 0 ? '#ffb700' : '#ff3df0'} />
          <StatCard label="Itens Vendidos" value={`${totalItens} un.`} color="#14ff00" />
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

