import { useState, type ReactNode } from 'react';
import { SidebarCalendarCard } from '../../components/SidebarCalendarCard';
import { PodiumStaircase } from '../../components/ranking/PodiumStaircase';
import { RankingImageModal } from '../../components/ranking/RankingImageModal';
import { CAT_KEYS, type CategoryKey } from '../../lib/business/classification';
import { computeChampionStars, type ChampionStar } from '../../lib/business/champion';
import { computeDinamicaRanking, intersectDynamicPeriod } from '../../lib/business/dynamics';
import { effectiveMetaGeral, getGoal, getSuperMeta } from '../../lib/business/goals';
import type { Dynamic, SummaryRow } from '../../lib/business/types';
import { catTotals, computeSummary } from '../../lib/business/summary';
import { generateChampionCardBlob } from '../../lib/championImage';
import { monthFirstISO, monthLastISO, todayISO } from '../../lib/dateRange';
import { fmtMoney, monthName } from '../../lib/format';
import { tryCopyImage } from '../../lib/rankingImage';
import { useCollaborators, useDynamics, useGoals, useSales, useSpecialLists, useStore, useStoreSettings } from '../../lib/queries';
import { useDateRange, type RankFilter } from '../DateRangeContext';

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

function RankFilterBar({ dynamics }: { dynamics: Dynamic[] }) {
  const { rankFilter, setRankFilter } = useDateRange();
  const today = todayISO();
  const activeDynamics = dynamics.filter((d) => d.dataFim >= today);

  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
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
    <div style={{ textAlign: 'center' }}>
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
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, marginTop: 4, color }}>{pct.toFixed(0)}%</div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.03em', fontWeight: 700, marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 10.5, color: '#8b90bf' }}>{fmtMoney(valor)}</div>
      <div style={{ fontSize: 10.5, color: '#8b90bf' }}>meta {fmtMoney(goal)}</div>
    </div>
  );
}

function StatCard({ label, value, color, badge }: { label: string; value: string; color: string; badge?: string }) {
  return (
    <div style={{ background: '#0b0e1d', border: `1px solid ${color}`, borderRadius: 14, padding: '9px 10px', height: '100%' }}>
      <div style={{ fontSize: 9, color: '#8b90bf', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4, fontWeight: 700 }}>
        {label}
        {badge && (
          <span style={{ marginLeft: 8, fontSize: 10, background: '#ffb700', color: '#231a02', padding: '2px 6px', borderRadius: 6, fontWeight: 800 }}>
            {badge}
          </span>
        )}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color }}>{value}</div>
    </div>
  );
}

export function DashboardPage() {
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: goals } = useGoals();
  const { data: storeSettings } = useStoreSettings();
  const { data: store } = useStore();
  const { data: specialLists } = useSpecialLists();
  const { data: dynamics } = useDynamics();
  const { dashFrom, dashTo, refYear, refMonth, rankFilter } = useDateRange();

  if (!collaborators || !sales || !goals || !storeSettings || !specialLists || !dynamics) {
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
  const campeaoLabel = modoDia ? `Campeão do dia — ${dashFrom.split('-').reverse().join('/')}` : `Campeão — ${monthName(refMonth)}/${refYear}`;
  const campeaoStars = campeao
    ? computeChampionStars(campeao.matricula, sales, collaborators, goals, specialLists, modoDia ? dashFrom : monthFirst, modoDia ? dashTo : monthLast, mode)
    : null;

  const rankFilterParams = resolveRankFilterParams(rankFilter, dashFrom, dashTo, dynamics);
  const rankingFiltered = rankFilterParams.dinamica
    ? computeDinamicaRanking(
        { ...rankFilterParams.dinamica, dataInicio: rankFilterParams.from, dataFim: rankFilterParams.to },
        sales,
        collaborators,
      )
    : computeSummary(sales, collaborators, rankFilterParams.from, rankFilterParams.to, rankFilterParams.catFilter, specialLists);
  const isUnitRanking =
    rankFilterParams.catFilter === 'LEVMEL' || rankFilterParams.catFilter === 'CHIP' || rankFilterParams.dinamica?.metrica === 'unidade';
  const rankingFilteredList = rankingFiltered.filter((r) => r.valor > 0 || r.itens > 0);
  const modeloRanking = storeSettings.modelo_ranking as 'escadinha' | 'lista';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <div className="flex flex-col gap-4">
        <div style={{ background: 'rgba(0,0,0,.35)', border: '1px solid #00f0ff', borderRadius: 18, padding: '11px 16px' }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ minWidth: 150 }}>
              <div style={{ color: '#00f0ff', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>
                {saudacao.toUpperCase()},
              </div>
              <div style={{ fontSize: 15, margin: '2px 0', fontWeight: 700 }}>{store?.nome_equipe || 'Equipe'}</div>
              <div style={{ color: '#8b90bf', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>Painel Geral</div>
            </div>
            <div style={{ textAlign: 'right', minWidth: 120 }}>
              <div style={{ color: '#8b90bf', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.08em' }}>Atingim. período</div>
              <div style={{ fontSize: 26, textShadow: '0 0 10px rgba(0,240,255,.55)', color: '#00f0ff' }}>{pct.toFixed(0)}%</div>
            </div>
          </div>
          <div style={{ textAlign: 'left', marginTop: 8 }}>
            <div style={{ color: '#ffb700', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>
              ⭐ Venda total do período
            </div>
            <div style={{ fontSize: 26, textShadow: '0 0 10px rgba(0,240,255,.55)' }}>{fmtMoney(totalValor)}</div>
          </div>
          <div style={{ position: 'relative', height: 8, borderRadius: 5, background: '#080818', border: '1px solid #212948', overflow: 'hidden', marginTop: 8 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#00f0ff,#a82bff)', borderRadius: 5 }} />
            {marker !== null && <div style={{ position: 'absolute', top: -3, bottom: -3, width: 2, background: '#ffb700', left: `${marker}%` }} />}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-cyan-400 font-semibold text-sm mb-2">🏆 Ranking Geral de Vendas — {rankFilterParams.label}</h3>
          <RankFilterBar dynamics={dynamics} />
          <div className="mt-3">
            <PodiumStaircase
              ranking={rankingFilteredList}
              getValue={(r) => (isUnitRanking ? r.itens : r.valor)}
              formatValue={(v) => (isUnitRanking ? `${v} un.` : fmtMoney(v))}
              variant={modeloRanking}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-cyan-400 font-semibold text-sm mb-3">Vendas por Categoria</h3>
          <div className="grid grid-cols-2 min-[1051px]:grid-cols-4 gap-1.5">
            {CAT_KEYS.map((k) => {
              const t = catTotals(sales, dashFrom, dashTo, k);
              const goal = getGoal(goals[k], mode, sales, collaborators);
              return <CategoryGauge key={k} label={CAT_LABEL[k]} valor={t.valor} goal={goal} color={CAT_COLOR[k]} />;
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {/* Meta/Falta/Saldo/Itens sit at the top of the sidebar, level with
            the venda-total summary bar in the left column; the date filter
            comes next, level with the "Ranking Geral" card; the champion
            card moves below the date filter instead of above it. */}
        <div className="grid grid-cols-2 gap-2">
          <StatCard label={metaLabel} value={fmtMoney(metaExibida)} color="#00f0ff" badge={atingiuMeta ? 'MG ✓' : undefined} />
          <StatCard label={faltaLabel} value={fmtMoney(faltaValor)} color="#a82bff" />
          <StatCard label="Saldo" value={`${saldo >= 0 ? '' : '-'}${fmtMoney(Math.abs(saldo))}`} color={saldo >= 0 ? '#ffb700' : '#ff3df0'} />
          <StatCard label="Itens Vendidos" value={`${totalItens} un.`} color="#14ff00" />
        </div>

        <SidebarCalendarCard />

        {campeao && (
          <ChampionCard campeao={campeao} campeaoLabel={campeaoLabel} campeaoStars={campeaoStars} storeName={store?.nome_loja} />
        )}
      </div>
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

