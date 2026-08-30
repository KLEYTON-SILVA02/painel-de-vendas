import { useState } from 'react';
import { SidebarCalendarCard } from '../../components/SidebarCalendarCard';
import { PodiumStaircase } from '../../components/ranking/PodiumStaircase';
import { RankingImageModal } from '../../components/ranking/RankingImageModal';
import { CONQUISTA_TIERS, computeConquistas, computeConquistasDayGallery, type ConquistaCategoria, type ConquistaRow, type SuperMetasPorMatricula } from '../../lib/business/conquistas';
import { generateConquistaImageBlob } from '../../lib/conquistaImage';
import { fmtDateBR, fmtMoney } from '../../lib/format';
import { useConquistaSuperMetas, useUpsertConquistaSuperMeta } from '../../lib/mutations';
import { useAuth } from '../../auth/AuthContext';
import { useCollaborators, useSales, useStore } from '../../lib/queries';
import { tryCopyImage } from '../../lib/rankingImage';
import { useDateRange } from '../DateRangeContext';

// New feature: Galeria de Conquistas — detects achievers of any of 5 fixed
// R$ tiers or their own Super Meta Individual, mirroring the Início screen's
// two-column dash-grid layout (main content + sidebar date filter).

const CONQUISTA_CATS: { key: ConquistaCategoria; label: string; color: string }[] = [
  { key: 'DERM', label: 'Dermocosméticos', color: '#ff3df0' },
  { key: 'MP', label: 'Marcas Exclusivas', color: '#a82bff' },
  { key: 'GEN', label: 'Genérico', color: '#14ff00' },
];

type TierFilter = 'ALL' | 'SUPER' | (typeof CONQUISTA_TIERS)[number];

function matchesFilter(row: ConquistaRow, filter: TierFilter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'SUPER') return row.bateuSuper;
  return row.tier === filter;
}

function tierLabel(row: ConquistaRow): string {
  return row.tier > 0 ? `🏆 ${row.tier / 1000}k` : '⭐ SUPER META';
}

export function ConquistasPage() {
  const { profile } = useAuth();
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: store } = useStore();
  const { dashFrom, dashTo, setDay } = useDateRange();
  const [catKey, setCatKey] = useState<ConquistaCategoria>('DERM');
  const [tierFilter, setTierFilter] = useState<TierFilter>('ALL');
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [imageModal, setImageModal] = useState<{ url: string; copied: boolean } | null>(null);

  const { data: superMetaRows } = useConquistaSuperMetas(catKey);
  const upsertSuperMeta = useUpsertConquistaSuperMeta(profile?.store_id);

  if (!collaborators || !sales || !superMetaRows) {
    return <div className="text-sm text-slate-500 p-6">Carregando…</div>;
  }

  const superMetas: SuperMetasPorMatricula = {};
  const byId = new Map(collaborators.map((c) => [c.id, c]));
  superMetaRows.forEach((r) => {
    const c = byId.get(r.collaborator_id);
    if (c) superMetas[c.matricula] = Number(r.valor) || 0;
  });

  const info = CONQUISTA_CATS.find((c) => c.key === catKey)!;
  const rows = computeConquistas(sales, collaborators, dashFrom, dashTo, catKey, superMetas);
  const filtered = rows.filter((r) => matchesFilter(r, tierFilter));
  const dayGallery = computeConquistasDayGallery(sales, collaborators, dashFrom, dashTo, catKey, superMetas);

  async function handleCopyImage() {
    setGenerating(true);
    try {
      const blob = await generateConquistaImageBlob(filtered, info.label, dashFrom, dashTo, store?.nome_loja);
      if (!blob) return;
      const copiedToClipboard = await tryCopyImage(blob);
      setImageModal({ url: URL.createObjectURL(blob), copied: copiedToClipboard });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-lg font-semibold mb-3" style={{ color: '#ffb700' }}>
            🏆 Galeria de Conquistas — {info.label}
          </h3>

          <div className="flex flex-wrap gap-2 mb-3">
            {CONQUISTA_CATS.map((c) => (
              <button
                key={c.key}
                onClick={() => setCatKey(c.key)}
                style={{
                  background: catKey === c.key ? c.color : 'transparent',
                  border: `1px solid ${c.color}`,
                  color: catKey === c.key ? '#0b0e1d' : c.color,
                  padding: '7px 13px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '.04em',
                }}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {(['ALL', 'SUPER', ...CONQUISTA_TIERS] as TierFilter[]).map((f) => (
              <button
                key={String(f)}
                onClick={() => setTierFilter(f)}
                style={{
                  background: tierFilter === f ? '#ffb700' : '#0b0e1d',
                  border: '1px solid #ffb700',
                  color: tierFilter === f ? '#231a02' : '#ffb700',
                  padding: '5px 11px',
                  borderRadius: 999,
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {f === 'ALL' ? 'Todos' : f === 'SUPER' ? '⭐ Super Meta' : `🏆 ${f / 1000}k`}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <PodiumStaircase ranking={filtered} getValue={(r) => r.valor} formatValue={(v) => fmtMoney(v)} variant="lista" getSub={tierLabel} />
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={handleCopyImage}
              disabled={generating}
              className="rounded-lg border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
              style={{ borderColor: '#ffb700', color: '#ffb700' }}
            >
              {generating ? 'Gerando...' : '🖼️ Copiar galeria (imagem)'}
            </button>
            <button
              onClick={() => setAdjustOpen((v) => !v)}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              {adjustOpen ? '✕ Fechar ajuste' : '⚙️ Ajustar cards/Super Meta'}
            </button>
          </div>
        </div>

        {adjustOpen && (
          <SuperMetaTable
            categoria={catKey}
            collaborators={collaborators}
            superMetaRows={superMetaRows}
            onSave={(collaboratorId, valor) => upsertSuperMeta.mutateAsync({ categoria: catKey, collaboratorId, valor })}
          />
        )}
      </div>

      <div className="flex flex-col gap-3">
        <SidebarCalendarCard />
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-xs font-semibold mb-3 text-slate-300 uppercase tracking-wide">Galeria de dias</h3>
          <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto">
            {dayGallery.map((d) => {
              const active = dashFrom === d.dia && dashTo === d.dia;
              return (
                <button
                  key={d.dia}
                  onClick={() => setDay(d.dia)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: active ? 'rgba(255,183,0,.15)' : '#0b0e1d',
                    border: `1px solid ${active ? '#ffb700' : '#212948'}`,
                    borderRadius: 10,
                    padding: '6px 10px',
                    cursor: 'pointer',
                    color: active ? '#ffb700' : '#c9d3e6',
                    fontSize: 12,
                  }}
                >
                  <span>{fmtDateBR(d.dia)}</span>
                  <span style={{ fontWeight: 700, color: d.count > 0 ? '#14ff00' : '#4a5178' }}>{d.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {imageModal && (
        <RankingImageModal
          url={imageModal.url}
          copied={imageModal.copied}
          onClose={() => setImageModal(null)}
          title="Imagem da galeria de conquistas"
          filename="galeria-conquistas.png"
          alt="Galeria de Conquistas"
        />
      )}
    </div>
  );
}

function SuperMetaTable({
  categoria,
  collaborators,
  superMetaRows,
  onSave,
}: {
  categoria: ConquistaCategoria;
  collaborators: { id: string; nome: string; apelido: string | null; matricula: string }[];
  superMetaRows: { collaborator_id: string; valor: number }[];
  onSave: (collaboratorId: string, valor: number) => Promise<void>;
}) {
  const byCollaborator = new Map(superMetaRows.map((r) => [r.collaborator_id, r.valor]));
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  async function handleSaveAll() {
    setSaving(true);
    try {
      for (const [collaboratorId, valor] of Object.entries(edits)) {
        await onSave(collaboratorId, valor);
      }
      setEdits({});
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="font-semibold mb-1">Super Meta Individual — {categoria}</h3>
      <p className="text-xs text-slate-500 mb-4">
        Um valor de venda (R$) que, se atingido por um colaborador nesta categoria, conta como conquista mesmo sem
        bater nenhum dos degraus fixos (1k/2k/3k/5k/10k).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-800">
              <th className="py-2 pr-3">Colaborador</th>
              <th className="py-2 pr-3">Super Meta Individual (R$)</th>
            </tr>
          </thead>
          <tbody>
            {collaborators.map((c) => {
              const current = edits[c.id] ?? byCollaborator.get(c.id) ?? 0;
              return (
                <tr key={c.id} className="border-b border-slate-900">
                  <td className="py-2 pr-3">{c.apelido || c.nome}</td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      value={current}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [c.id]: Number(e.target.value) }))}
                      className="w-28 rounded-md bg-slate-800 border border-slate-700 px-2 py-1 text-xs"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        onClick={handleSaveAll}
        disabled={saving || Object.keys(edits).length === 0}
        className="mt-3 self-start rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm disabled:opacity-50"
      >
        {saving ? 'Salvando…' : 'Salvar Super Metas'}
      </button>
    </div>
  );
}
