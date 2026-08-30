import { useState } from 'react';
import { RankingImageModal } from '../../components/ranking/RankingImageModal';
import { CAT_KEYS, type CategoryKey } from '../../lib/business/classification';
import { computeChampionStars, type ChampionStar } from '../../lib/business/champion';
import { effectiveMetaGeral, getGoal, getSuperMeta } from '../../lib/business/goals';
import { catTotals, computeSummary } from '../../lib/business/summary';
import type { SummaryRow } from '../../lib/business/types';
import { generateChampionCardBlob } from '../../lib/championImage';
import { monthFirstISO, monthLastISO } from '../../lib/dateRange';
import { fmtMoney, monthName } from '../../lib/format';
import { tryCopyImage } from '../../lib/rankingImage';
import { useCollaborators, useDynamics, useGoals, useSales, useSpecialLists, useStore, useStoreSettings } from '../../lib/queries';
import { useDateRange } from '../DateRangeContext';
import { GoalGauge } from './GoalGauge';
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
  const { dashFrom, dashTo, refYear, refMonth } = useDateRange();

  if (!collaborators || !sales || !goals || !storeSettings || !specialLists || !dynamics) {
    return <div style={{ padding: 24, fontSize: 12, color: 'var(--mv2-texto-2)' }}>Carregando…</div>;
  }

  const modoDia = dashFrom === dashTo;
  const mode = modoDia ? 'dia' : 'mes';

  const ranking = computeSummary(sales, collaborators, dashFrom, dashTo, undefined, specialLists);
  const totalValor = ranking.reduce((a, r) => a + r.valor, 0);
  const totalItens = ranking.reduce((a, r) => a + r.itens, 0);
  const rankingList = ranking.filter((r) => r.valor > 0).slice(0, 10);

  const metaGeral = effectiveMetaGeral(goals, mode, sales, collaborators, storeSettings.meta_geral_fallback);
  const metaSuper = getSuperMeta(goals.MER, mode, sales, collaborators);
  const atingiuMeta = metaGeral > 0 && totalValor >= metaGeral;
  const saldo = totalValor - metaGeral;
  const pct = metaGeral > 0 ? Math.min(999, (totalValor / metaGeral) * 100) : 0;
  let faltaLabel = 'Falta p/ Meta';
  let faltaValor = Math.max(0, metaGeral - totalValor);
  if (atingiuMeta && metaSuper > metaGeral) {
    faltaLabel = 'Falta p/ Super Meta';
    faltaValor = Math.max(0, metaSuper - totalValor);
  }

  const monthFirst = monthFirstISO(refYear, refMonth);
  const monthLast = monthLastISO(refYear, refMonth);
  const monthRanking = computeSummary(sales, collaborators, monthFirst, monthLast);
  const campeaoSource = modoDia ? ranking : monthRanking;
  const campeao = campeaoSource.length && campeaoSource[0].valor > 0 ? campeaoSource[0] : null;
  const campeaoLabel = modoDia ? `Campeão do dia` : `Campeão — ${monthName(refMonth)}/${refYear}`;
  const campeaoStars = campeao
    ? computeChampionStars(campeao.matricula, sales, collaborators, goals, specialLists, modoDia ? dashFrom : monthFirst, modoDia ? dashTo : monthLast, mode)
    : null;

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
          <div className="mv2-value">
            {saldo >= 0 ? '' : '-'}
            {fmtMoney(Math.abs(saldo))}
          </div>
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

      <div className="mv2-ranking-track">
        {rankingList.map((r, i) => (
          <div key={r.matricula} className={`mv2-ranking-col ${i === 0 ? 'mv2-first' : i === 1 ? 'mv2-second' : i === 2 ? 'mv2-third' : ''}`}>
            {r.foto ? <img src={r.foto} alt="" className="mv2-avatar" /> : <div className="mv2-avatar" />}
            <div className="mv2-position">{i + 1}</div>
            <div className="mv2-name">{r.apelido || r.nome}</div>
          </div>
        ))}
      </div>

      <div className="mv2-goals-grid">
        {CAT_KEYS.map((k) => {
          const t = catTotals(sales, dashFrom, dashTo, k);
          const goal = getGoal(goals[k], mode, sales, collaborators);
          const gaugePct = goal > 0 ? Math.min(100, (t.valor / goal) * 100) : 0;
          return (
            <div key={k} className="mv2-goal-item">
              <GoalGauge pct={gaugePct} color={CAT_COLOR[k]} />
              <div className="mv2-goal-name">{CAT_LABEL[k]}</div>
              <div className="mv2-goal-value">{fmtMoney(t.valor)}</div>
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
