import { useMemo, useState } from 'react';
import { RankingImageModal } from '../../components/ranking/RankingImageModal';
import { diasRestantesNoMes } from '../../lib/business/goals';
import { computeSummary, matchesSpecialList } from '../../lib/business/summary';
import type { Collaborator } from '../../lib/business/types';
import { copyText, formatRankingText } from '../../lib/clipboard';
import { todayISO } from '../../lib/dateRange';
import { generateRankingImageBlob, tryCopyImage } from '../../lib/rankingImage';
import { useCollaborators, useGoals, useSales, useSpecialLists, useStore } from '../../lib/queries';
import { useDateRange } from '../DateRangeContext';
import { MobileDateFilter } from './MobileDateFilter';
import { MobileSalesTable, MobileSellerAccordion } from './MobileSellerDetail';

// Shared compact mobile v2 screen for Levmel/Chip — the spec says Chip
// reuses Levmel's structure exactly, only color/values differ.
//
// Meta Mensal/Meta Diária come from the `goals` table (categoria=LEVMEL/CHIP,
// see ADM > Funções > Metas > Levmel/Chip) — reused via useGoals() same as
// every other category. A store that hasn't configured them yet just sees 0%.

export function MobileUnitCategoryScreen({
  catKey,
  title,
  titleClass,
  accent,
}: {
  catKey: 'LEVMEL' | 'CHIP';
  title: string;
  titleClass: string;
  accent: string;
}) {
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: specialLists } = useSpecialLists();
  const { data: store } = useStore();
  const { data: goals } = useGoals();
  const { dashFrom, dashTo } = useDateRange();
  const [selectedSeller, setSelectedSeller] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imageModal, setImageModal] = useState<{ url: string; copied: boolean } | null>(null);

  const byMatricula = useMemo(() => {
    const map = new Map<string, Collaborator>();
    (collaborators ?? []).forEach((c) => map.set(c.matricula, c));
    return map;
  }, [collaborators]);

  if (!collaborators || !sales || !specialLists || !goals) {
    return <div style={{ padding: 24, fontSize: 12, color: 'var(--mv2-texto-2)' }}>Carregando…</div>;
  }

  const ranking = computeSummary(sales, collaborators, dashFrom, dashTo, catKey, specialLists);
  const rankingList = ranking.filter((r) => r.itens > 0).sort((a, b) => b.itens - a.itens);
  const totalItens = ranking.reduce((a, r) => a + r.itens, 0);
  const dias = diasRestantesNoMes();

  const today = todayISO();
  const todayRanking = computeSummary(sales, collaborators, today, today, catKey, specialLists);
  const itensHoje = todayRanking.reduce((a, r) => a + r.itens, 0);
  const vendedoresAtivosHoje = todayRanking.filter((r) => r.itens > 0).length;

  const metaMensal = goals[catKey]?.mensal ?? 0;
  const metaDiaria = goals[catKey]?.diaria ?? 0;
  const pctMensal = metaMensal > 0 ? Math.min(100, (totalItens / metaMensal) * 100) : 0;
  const pctDiaria = metaDiaria > 0 ? Math.min(100, (itensHoje / metaDiaria) * 100) : 0;

  const list = catKey === 'LEVMEL' ? specialLists.levmel : specialLists.chip;
  const unitSales = sales
    .filter((s) => {
      if (s.dataISO && (s.dataISO < dashFrom || s.dataISO > dashTo)) return false;
      if (!matchesSpecialList(s.produto, list)) return false;
      if (selectedSeller && s.matricula !== selectedSeller) return false;
      return true;
    })
    .sort((a, b) => (b.dataISO || '').localeCompare(a.dataISO || ''))
    .slice(0, 150);

  async function handleCopy() {
    const text = formatRankingText(
      rankingList.map((r) => ({ ...r, valor: r.itens })),
      title,
      dashFrom,
      dashTo,
      store?.nome_loja,
    );
    const ok = await copyText(text);
    setCopied(ok);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleGenerateImage() {
    setGenerating(true);
    try {
      const rows = rankingList.map((r) => ({ nome: r.nome, apelido: r.apelido, foto: r.foto, valor: r.itens }));
      const blob = await generateRankingImageBlob(rows, title, dashFrom, dashTo, store?.nome_loja, true);
      if (!blob) return;
      const wasCopied = await tryCopyImage(blob);
      setImageModal({ url: URL.createObjectURL(blob), copied: wasCopied });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <div className={`mv2-screen-title ${titleClass}`}>{title.toUpperCase()}</div>

      <div className="mv2-metrics-grid">
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: accent }}>
          <div className="mv2-label">Itens Totais</div>
          <div className="mv2-value">{totalItens} un.</div>
        </div>
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: '#698b46' }}>
          <div className="mv2-label">Dias Restantes</div>
          <div className="mv2-value">{dias} dia(s)</div>
        </div>
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: '#00b6da' }}>
          <div className="mv2-label">Itens Vendidos Hoje</div>
          <div className="mv2-value">{itensHoje} un.</div>
        </div>
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: '#5c3795' }}>
          <div className="mv2-label">Vendedores Ativos Hoje</div>
          <div className="mv2-value">{vendedoresAtivosHoje}</div>
        </div>
      </div>

      <div style={{ margin: '0 18px 8px', fontSize: 9, fontWeight: 700, color: 'var(--mv2-texto-2)', textTransform: 'uppercase' }}>
        Atingimento de Metas
      </div>
      <div className="mv2-dual-progress">
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8 }}>
          <span>Meta Mensal</span>
          <span>{pctMensal.toFixed(0)}%</span>
        </div>
        <div className="mv2-track mv2-mensal">
          <span style={{ width: `${pctMensal}%` }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, marginTop: 4 }}>
          <span>Meta Diária</span>
          <span>{pctDiaria.toFixed(0)}%</span>
        </div>
        <div className="mv2-track mv2-diaria">
          <span style={{ width: `${pctDiaria}%` }} />
        </div>
      </div>

      <MobileDateFilter />

      <div className="mv2-ranking-list-card">
        {rankingList.length === 0 ? (
          <div style={{ fontSize: 10, color: 'var(--mv2-texto-2)', padding: '8px 0', textAlign: 'center' }}>Sem vendas no período.</div>
        ) : (
          rankingList.map((r, i) => (
            <div key={r.matricula} className="mv2-row">
              <span className="mv2-pos" style={{ color: accent }}>
                {i + 1}
              </span>
              {r.foto ? <img src={r.foto} alt="" className="mv2-avatar" /> : <div className="mv2-avatar" />}
              <span className="mv2-name">{r.apelido || r.nome}</span>
              <span className="mv2-qty">{r.itens} un.</span>
            </div>
          ))
        )}
      </div>

      <div className="mv2-ranking-actions">
        <div className="mv2-row" style={{ gap: 6 }}>
          <button className="mv2-btn-outline" onClick={handleCopy}>
            {copied ? '✓ Copiado' : 'Copiar'}
          </button>
          <button className="mv2-btn-generate" onClick={handleGenerateImage} disabled={generating}>
            {generating ? 'Gerando…' : 'Gerar Imagem'}
          </button>
        </div>
      </div>

      <MobileSellerAccordion collaborators={collaborators} selected={selectedSeller} onSelect={setSelectedSeller} />

      <MobileSalesTable
        title={`Lista de vendas — ${title}`}
        sales={unitSales}
        byMatricula={byMatricula}
        showValor={false}
        subtotalMode={selectedSeller ? 'quantidade' : 'none'}
      />

      {imageModal && (
        <RankingImageModal
          url={imageModal.url}
          copied={imageModal.copied}
          onClose={() => setImageModal(null)}
          title={`Imagem — ${title}`}
          filename={`${catKey.toLowerCase()}-vendas.png`}
          alt={title}
        />
      )}
    </div>
  );
}
