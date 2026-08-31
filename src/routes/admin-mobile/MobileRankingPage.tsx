import { useState } from 'react';
import { RankingImageModal } from '../../components/ranking/RankingImageModal';
import { computeSummary } from '../../lib/business/summary';
import { copyText, formatRankingText } from '../../lib/clipboard';
import { fmtMoney } from '../../lib/format';
import { generateRankingImageBlob, tryCopyImage } from '../../lib/rankingImage';
import { useCollaborators, useSales, useSpecialLists, useStore } from '../../lib/queries';
import { useDateRange } from '../DateRangeContext';
import { MobileDateFilter } from './MobileDateFilter';

const RANKING_COLS = [
  { key: 'DERM' as const, titulo: 'Dermo', cor: '#b84c9c' },
  { key: 'GEN' as const, titulo: 'Gen/Sim', cor: '#698b46' },
  { key: 'MP' as const, titulo: 'Marcas Excl.', cor: '#813c97' },
  { key: 'MER' as const, titulo: 'Merc. Geral', cor: '#f26122' },
  { key: 'LEVMEL' as const, titulo: 'Levmel', cor: '#f0b514' },
  { key: 'CHIP' as const, titulo: 'Chip', cor: '#fed400' },
];

export function MobileRankingPage() {
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: specialLists } = useSpecialLists();
  const { data: store } = useStore();
  const { dashFrom, dashTo } = useDateRange();
  const [catKey, setCatKey] = useState<(typeof RANKING_COLS)[number]['key']>('DERM');
  const [generating, setGenerating] = useState(false);
  const [imageModal, setImageModal] = useState<{ url: string; copied: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!collaborators || !sales || !specialLists) {
    return <div style={{ padding: 24, fontSize: 12, color: 'var(--mv2-texto-2)' }}>Carregando…</div>;
  }

  const info = RANKING_COLS.find((c) => c.key === catKey)!;
  const isUnit = catKey === 'LEVMEL' || catKey === 'CHIP';
  const ranking = computeSummary(sales, collaborators, dashFrom, dashTo, catKey, specialLists);
  const rankingList = ranking.filter((r) => (isUnit ? r.itens > 0 : r.valor > 0));
  const totalValor = ranking.reduce((a, r) => a + r.valor, 0);
  const totalItens = ranking.reduce((a, r) => a + r.itens, 0);

  async function handleCopy() {
    const text = formatRankingText(rankingList, info.titulo, dashFrom, dashTo, store?.nome_loja);
    const ok = await copyText(text);
    setCopied(ok);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleGenerateImage() {
    setGenerating(true);
    try {
      const rows = rankingList.map((r) => ({ nome: r.nome, apelido: r.apelido, foto: r.foto, valor: isUnit ? r.itens : r.valor }));
      const blob = await generateRankingImageBlob(rows, info.titulo, dashFrom, dashTo, store?.nome_loja);
      if (!blob) return;
      const copied = await tryCopyImage(blob);
      setImageModal({ url: URL.createObjectURL(blob), copied });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <div className="mv2-screen-title mv2-ranking">RANKING</div>

      <MobileDateFilter />

      <div className="mv2-chip-row">
        {RANKING_COLS.map((c) => (
          <button
            key={c.key}
            onClick={() => setCatKey(c.key)}
            className={`mv2-chip ${catKey === c.key ? 'active' : ''}`}
            style={{ ['--mv2-chip-color' as string]: c.cor }}
          >
            {c.titulo}
          </button>
        ))}
      </div>

      <div className="mv2-ranking-list-card">
        <div style={{ fontSize: 10, fontWeight: 700, color: info.cor, marginBottom: 4 }}>{info.titulo.toUpperCase()}</div>
        {rankingList.length === 0 ? (
          <div style={{ fontSize: 10, color: 'var(--mv2-texto-2)', padding: '8px 0', textAlign: 'center' }}>Sem vendas no período.</div>
        ) : (
          rankingList.map((r, i) => (
            <div key={r.matricula} className="mv2-row">
              <span className="mv2-pos" style={{ color: info.cor }}>
                {i + 1}
              </span>
              {r.foto ? <img src={r.foto} alt="" className="mv2-avatar" /> : <div className="mv2-avatar" />}
              <span className="mv2-name">{r.apelido || r.nome}</span>
              <span className="mv2-qty">{isUnit ? `${r.itens} un.` : fmtMoney(r.valor)}</span>
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

      <div style={{ margin: '0 18px', fontSize: 8, color: 'var(--mv2-texto-2)' }}>
        Total período: {fmtMoney(totalValor)} · {totalItens} un.
      </div>

      {imageModal && (
        <RankingImageModal
          url={imageModal.url}
          copied={imageModal.copied}
          onClose={() => setImageModal(null)}
          title="Imagem do ranking"
          filename="ranking-vendas.png"
          alt="Ranking"
        />
      )}
    </div>
  );
}
