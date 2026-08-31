import { useState } from 'react';
import type { ColumnRankingRow } from '../../lib/business/ranking';
import { copyText, formatRankingText } from '../../lib/clipboard';
import { generateRankingImageBlob, tryCopyImage } from '../../lib/rankingImage';
import { RankingImageModal } from './RankingImageModal';

// Ported 1:1 from legacy/index-original.html — .rank-col / .rank-col-header /
// .rank-col-item / .rci-* (viewRanking()).

const MEDAL_TEXT: Record<string, { color: string; weight: number }> = {
  gold: { color: '#eab308', weight: 900 },
  silver: { color: '#cbd5e1', weight: 900 },
  bronze: { color: '#f97316', weight: 900 },
};
const MEDAL_AVATAR: Record<string, string> = {
  gold: '2px solid #eab308',
  silver: '2px solid #cbd5e1',
  bronze: '2px solid #f97316',
};
const MEDAL_SHADOW: Record<string, string> = {
  gold: '0 0 6px rgba(234,179,8,.5)',
  silver: '0 0 6px rgba(203,213,225,.5)',
  bronze: '0 0 6px rgba(249,115,22,.5)',
};

function medalOf(i: number): 'gold' | 'silver' | 'bronze' | null {
  return i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : null;
}

export function RankingColumnCard({
  title,
  icon,
  color,
  ranking,
  isUnit,
  dashFrom,
  dashTo,
  storeName,
}: {
  title: string;
  icon: string;
  color: string;
  ranking: ColumnRankingRow[];
  isUnit: boolean;
  dashFrom: string;
  dashTo: string;
  storeName?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [imageModal, setImageModal] = useState<{ url: string; copied: boolean } | null>(null);

  async function handleCopy() {
    const text = formatRankingText(ranking, title, dashFrom, dashTo, storeName);
    const ok = await copyText(text);
    setCopied(ok);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleGenerateImage() {
    setGenerating(true);
    try {
      const rows = isUnit ? ranking.map((r) => ({ ...r, valor: r.itens })) : ranking;
      const blob = await generateRankingImageBlob(rows, title, dashFrom, dashTo, storeName, isUnit);
      if (!blob) return;
      const copiedToClipboard = await tryCopyImage(blob);
      const url = URL.createObjectURL(blob);
      setImageModal({ url, copied: copiedToClipboard });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#0b0e1d', border: '1px solid #212948', borderRadius: 14, padding: 10 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontWeight: 800,
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: '.03em',
          paddingBottom: 8,
          borderBottom: `1.5px solid ${color}`,
          color,
        }}
      >
        <span>{icon}</span>
        <span>{title}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
        {ranking.length === 0 ? (
          <div style={{ padding: '16px 0' }} className="text-sm text-slate-500 text-center">
            Sem vendas.
          </div>
        ) : (
          ranking.map((r, i) => {
            const medal = medalOf(i);
            return (
              <div key={r.matricula} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 10, color: medal ? MEDAL_TEXT[medal].color : '#8b90bf', width: 14, flexShrink: 0, fontWeight: medal ? MEDAL_TEXT[medal].weight : 700 }}>
                  {i + 1}
                </div>
                {r.foto ? (
                  <img
                    src={r.foto}
                    alt=""
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      background: '#0b0e1d',
                      border: medal ? MEDAL_AVATAR[medal] : '2px solid #00f0ff',
                      boxShadow: medal ? MEDAL_SHADOW[medal] : 'none',
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: '#0b0e1d',
                      border: medal ? MEDAL_AVATAR[medal] : '2px solid #00f0ff',
                      boxShadow: medal ? MEDAL_SHADOW[medal] : 'none',
                      flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.apelido || r.nome}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ flex: 1, height: 4, borderRadius: 3, background: '#080818', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(100, r.pct ?? 0)}%`, background: color }} />
                    </div>
                    <div style={{ fontSize: 9, color: '#8b90bf', flexShrink: 0, width: 26, textAlign: 'right' }}>{r.pct !== null ? `${r.pct.toFixed(0)}%` : '—'}</div>
                  </div>
                </div>
                <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: '#ffb700', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {isUnit ? `${r.itens} un.` : r.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
              </div>
            );
          })
        )}
      </div>

      <button
        onClick={handleCopy}
        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
      >
        {copied ? '✓ Copiado!' : '📋 Copiar'}
      </button>
      <button
        onClick={handleGenerateImage}
        disabled={generating}
        className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        style={{ borderColor: '#ffb700', color: '#ffb700' }}
      >
        {generating ? 'Gerando...' : '🖼️ Gerar imagem'}
      </button>

      {imageModal && <RankingImageModal url={imageModal.url} copied={imageModal.copied} onClose={() => setImageModal(null)} />}
    </div>
  );
}
