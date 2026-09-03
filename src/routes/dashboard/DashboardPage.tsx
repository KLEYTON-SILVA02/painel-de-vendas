import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { PageLoading } from '../../components/PageLoading';
import { useAuth } from '../../auth/AuthContext';
import { SidebarCalendarCard } from '../../components/SidebarCalendarCard';
import { GenerateImageScopeModal } from '../../components/ranking/GenerateImageScopeModal';
import { MultiRankingImageModal } from '../../components/ranking/MultiRankingImageModal';
import { PodiumSplit, type PodiumSpots } from '../../components/ranking/PodiumSplit';
import { PodiumStaircase } from '../../components/ranking/PodiumStaircase';
import { RankingImageModal } from '../../components/ranking/RankingImageModal';
import { RankingModeToggle } from '../../components/ranking/RankingModeToggle';
import { CAT_KEYS, type CategoryKey } from '../../lib/business/classification';
import { computeChampionStars, type ChampionStar } from '../../lib/business/champion';
import { computeDinamicaRanking, intersectDynamicPeriod } from '../../lib/business/dynamics';
import { effectiveMetaGeral, getGoal, getSuperMeta } from '../../lib/business/goals';
import type { Dynamic, SummaryRow } from '../../lib/business/types';
import { catTotals, computeSummary } from '../../lib/business/summary';
import { generateChampionCardBlob } from '../../lib/championImage';
import { monthFirstISO, monthLastISO, todayISO } from '../../lib/dateRange';
import { fmtDateBR, fmtMoney, monthName } from '../../lib/format';
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
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: singleLine ? 'nowrap' : 'wrap' }}>
        {[...RANK_FILTERS, { k: 'LEVMEL' as RankFilter, l: 'Levmel' }, { k: 'CHIP' as RankFilter, l: 'Chip' }].map((x) => (
          <SubtabButton key={x.k} active={rankFilter === x.k} onClick={() => setRankFilter(x.k)}>
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

function SubtabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? '#ffb700' : 'transparent',
        border: `1px solid ${active ? '#ffb700' : '#212948'}`,
        color: active ? '#231a02' : '#8b90bf',
        padding: '7px 13px',
        borderRadius: 10,
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '.04em',
      }}
    >
      {children}
    </button>
  );
}

function CategoryGauge({ label, valor, goal, color }: { label: string; valor: number; goal: number; color: string }) {
  const pct = goal > 0 ? Math.min(100, (valor / goal) * 100) : 0;
  return (
    <div style={{ textAlign: 'center', containerType: 'inline-size' } as CSSProperties}>
      <div style={{ width: '100%', maxWidth: 88, aspectRatio: '2/1', overflow: 'hidden', position: 'relative', margin: '0 auto' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            aspectRatio: '1/1',
            borderRadius: '50%',
            background: `conic-gradient(${color} ${pct}%, rgba(255,255,255,.07) 0)`,
          }}
        >
          <div style={{ position: 'absolute', inset: '12%', borderRadius: '50%', background: '#0b0e1d' }} />
        </div>
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
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: goals } = useGoals();
  const { data: storeSettings } = useStoreSettings();
  const { data: store } = useStore();
  const { data: specialLists } = useSpecialLists();
  const { data: dynamics } = useDynamics();
  const { dashFrom, dashTo, refYear, refMonth, rankFilter } = useDateRange();
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
  const monthFirst = monthFirstISO(refYear, refMonth);
  const monthLast = monthLastISO(refYear, refMonth);
  const rankFilterParams = resolveRankFilterParams(rankFilter, dashFrom, dashTo, dynamics ?? []);

  const campeaoFrom = modoDia ? dashFrom : monthFirst;
  const campeaoTo = modoDia ? dashTo : monthLast;
  // The champion follows the same category filter as the "Ranking Geral"
  // podium right above it (RankFilterBar) — 'ALL' and dynamics (no
  // per-category "melhor vendedor" concept) fall back to the overall
  // best seller, same as before this filter was wired in.
  const isUnitChampionCat = rankFilter === 'LEVMEL' || rankFilter === 'CHIP';
  const championCatFilter = rankFilter === 'ALL' || rankFilter.startsWith('DIN:') ? undefined : (rankFilter as CategoryKey | 'LEVMEL' | 'CHIP');

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
      const goal = getGoal(goals[k], mode, salesData, collaboratorsData);
      return { key: k, valor: t.valor, goal };
    });
  }, [salesData, collaboratorsData, goals, dashFrom, dashTo, mode, totalValor, totalItens]);

  const campeaoSource = useMemo(
    () => computeSummary(salesData, collaboratorsData, campeaoFrom, campeaoTo, championCatFilter, specialLists),
    [salesData, collaboratorsData, campeaoFrom, campeaoTo, championCatFilter, specialLists],
  );
  const campeao =
    campeaoSource.length && (isUnitChampionCat ? campeaoSource[0].itens > 0 : campeaoSource[0].valor > 0) ? campeaoSource[0] : null;
  // computeChampionStars scores 5 categories, each scanning `sales` day by
  // day across the whole campeaoFrom..campeaoTo range — the most expensive
  // single call on this page in "Modo Geral", so it's the most important
  // one to keep out of every unrelated render.
  const campeaoMatricula = campeao?.matricula;
  const campeaoStars = useMemo(
    () =>
      campeaoMatricula
        ? computeChampionStars(campeaoMatricula, salesData, collaboratorsData, specialLists, campeaoFrom, campeaoTo)
        : null,
    [campeaoMatricula, salesData, collaboratorsData, specialLists, campeaoFrom, campeaoTo],
  );

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

  const campeaoBase = modoDia ? `Campeão do dia — ${dashFrom.split('-').reverse().join('/')}` : `Campeão — ${monthName(refMonth)}/${refYear}`;
  const campeaoLabel = championCatFilter ? `${campeaoBase} · ${rankFilterParams.label}` : campeaoBase;

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
          {/* Saudação, venda total e atingimento share one row instead of the
              venda total sitting in its own stacked row below — same info,
              less vertical footprint. */}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ minWidth: 130 }}>
              <div style={{ color: '#00f0ff', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>
                {saudacao.toUpperCase()},
              </div>
              <div style={{ fontSize: 15, margin: '2px 0', fontWeight: 700 }}>{store?.nome_equipe || 'Equipe'}</div>
              <div style={{ color: '#8b90bf', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>Painel Geral</div>
            </div>
            <div style={{ minWidth: 160 }}>
              <div style={{ color: '#ffb700', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>
                ⭐ Venda total do período
              </div>
              <div style={{ fontSize: 26, textShadow: '0 0 10px rgba(0,240,255,.55)' }}>{fmtMoney(totalValor)}</div>
            </div>
            <div style={{ textAlign: 'right', minWidth: 100 }}>
              <div style={{ color: '#8b90bf', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.08em' }}>Atingim. período</div>
              <div style={{ fontSize: 26, textShadow: '0 0 10px rgba(0,240,255,.55)', color: '#00f0ff' }}>{pct.toFixed(0)}%</div>
            </div>
          </div>
          <div style={{ position: 'relative', height: 8, borderRadius: 5, background: '#080818', border: '1px solid #212948', overflow: 'hidden', marginTop: 8 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#00f0ff,#a82bff)', borderRadius: 5 }} />
            {marker !== null && <div style={{ position: 'absolute', top: -3, bottom: -3, width: 2, background: '#ffb700', left: `${marker}%` }} />}
          </div>
        </div>

        <div className="lg:col-start-1 lg:row-start-2 min-w-0 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: '1 1 auto', minWidth: 0, overflowX: 'auto', paddingBottom: 2 }}>
              <RankFilterBar dynamics={dynamics} singleLine />
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                onClick={handleCopyRanking}
                title="Copiar ranking de vendas p/ WhatsApp"
                style={{
                  background: 'transparent',
                  border: '1px solid #212948',
                  color: '#8b90bf',
                  padding: '7px 13px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {rankingCopied ? '✓ Copiado!' : '📋 Copiar ranking'}
              </button>
              <button
                onClick={() => setImageScopeOpen(true)}
                disabled={generatingImage}
                title="Gerar imagem do ranking"
                style={{
                  background: 'transparent',
                  border: '1px solid #ffb700',
                  color: '#ffb700',
                  padding: '7px 13px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
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

        <div className="lg:col-start-1 lg:row-start-3 min-w-0 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-cyan-400 font-semibold text-sm mb-3">Vendas por Categoria</h3>
          <div className="grid grid-cols-2 min-[1051px]:grid-cols-4 gap-1.5">
            {gaugeData.map((g) => (
              <CategoryGauge key={g.key} label={CAT_LABEL[g.key]} valor={g.valor} goal={g.goal} color={CAT_COLOR[g.key]} />
            ))}
          </div>
        </div>

        {/* Meta/Falta/Saldo/Itens sit at the top of the sidebar, level with
            the venda-total summary bar in the left column; the date filter
            comes next, level with the "Ranking Geral" card; the champion
            card moves below the date filter instead of above it. */}
        <div className="lg:col-start-2 lg:row-start-1 grid grid-cols-2 gap-2">
          <StatCard label={metaLabel} value={fmtMoney(metaExibida)} color="#00f0ff" badge={atingiuMeta ? 'MG ✓' : undefined} />
          <StatCard label={faltaLabel} value={fmtMoney(faltaValor)} color="#a82bff" />
          <StatCard label="Saldo" value={`${saldo >= 0 ? '' : '-'}${fmtMoney(Math.abs(saldo))}`} color={saldo >= 0 ? '#ffb700' : '#ff3df0'} />
          <StatCard label="Itens Vendidos" value={`${totalItens} un.`} color="#14ff00" />
        </div>

        <div className="lg:col-start-2 lg:row-start-2">
          <SidebarCalendarCard />
        </div>

        {campeao && (
          <div className="lg:col-start-2 lg:row-start-3">
            <ChampionCard campeao={campeao} campeaoLabel={campeaoLabel} campeaoStars={campeaoStars} storeName={store?.nome_loja} />
          </div>
        )}

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

function ChampionCard({
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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderColor: '#ffb700',
        boxShadow: '0 0 18px rgba(255,183,0,.35)',
        padding: '10px 12px',
        background: '#0b0e1d',
        border: '1px solid #ffb700',
        borderRadius: 18,
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      {campeao.foto ? (
        <img src={campeao.foto} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#212948', flexShrink: 0 }} />
      )}
      <div style={{ minWidth: 0, overflow: 'hidden', flex: 1 }}>
        <div style={{ fontSize: 9, color: '#ffb700', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          👑 {campeaoLabel}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{campeao.apelido || campeao.nome}</div>
        <div style={{ fontSize: 10.5, color: '#8b90bf', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {fmtMoney(campeao.valor)} · {campeao.itens} it.
        </div>
        {campeaoStars && (
          <div style={{ marginTop: 2 }} title={campeaoStars.map((s) => `${s.achieved ? '✓' : '✗'} ${s.label}`).join(' · ')}>
            {campeaoStars.map((s) => (
              <span key={s.key} style={{ fontSize: 12, color: s.achieved ? '#ffb700' : '#2b3350' }}>
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
        className="rounded-lg text-slate-950 font-semibold disabled:opacity-50 flex-shrink-0"
        style={{ background: '#ffb700', padding: '6px 10px', fontSize: 11 }}
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

