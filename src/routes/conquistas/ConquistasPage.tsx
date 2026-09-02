import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SidebarCalendarCard } from '../../components/SidebarCalendarCard';
import { RankingImageModal } from '../../components/ranking/RankingImageModal';
import {
  CONQUISTA_TIERS_BY_CAT,
  computeConquistas,
  computeConquistasDayGallery,
  conquistaTierLabel,
  isUnitConquista,
  type ConquistaCategoria,
  type ConquistaRow,
} from '../../lib/business/conquistas';
import { BUILT_IN_TEMPLATE, renderConquistaCard, type ConquistaCardTemplate } from '../../lib/conquistaCardRender';
import { generateConquistaImageBlob } from '../../lib/conquistaImage';
import { fmtDateBR, fmtMoney } from '../../lib/format';
import { useCollaborators, useConquistaCardTemplates, useSales, useSpecialLists, useStore } from '../../lib/queries';
import { tryCopyImage } from '../../lib/rankingImage';
import { useDateRange } from '../DateRangeContext';

// Galeria de Conquistas — detects achievers of any of a category's fixed
// tiers (R$ for Dermo/Marcas Exclusivas/Genérico, unidades vendidas for
// Levmel/Chip), mirroring the Início screen's two-column dash-grid layout
// (main content + sidebar date filter). Individual-goal configuration
// (formerly a "Super Meta Individual" duplicated here) now lives only in
// ADM > Metas > Metas Individuais — the "Ajustar" button below links there
// instead of opening its own panel.

const CONQUISTA_CATS: { key: ConquistaCategoria; label: string; color: string }[] = [
  { key: 'DERM', label: 'Dermocosméticos', color: '#ff3df0' },
  { key: 'MP', label: 'Marcas Exclusivas', color: '#a82bff' },
  { key: 'GEN', label: 'Genérico', color: '#14ff00' },
  { key: 'LEVMEL', label: 'Levmel', color: '#ffb700' },
  { key: 'CHIP', label: 'Chip', color: '#00e5ff' },
];

type TierFilter = 'ALL' | number;

function matchesFilter(row: ConquistaRow, filter: TierFilter): boolean {
  return filter === 'ALL' || row.tier === filter;
}

export function ConquistasPage() {
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: specialLists } = useSpecialLists();
  const { data: store } = useStore();
  const { data: cardTemplates } = useConquistaCardTemplates();
  const { dashFrom, dashTo, setDay } = useDateRange();
  const [catKey, setCatKey] = useState<ConquistaCategoria>('DERM');
  const [tierFilter, setTierFilter] = useState<TierFilter>('ALL');
  const [generating, setGenerating] = useState(false);
  const [imageModal, setImageModal] = useState<{ url: string; copied: boolean } | null>(null);

  if (!collaborators || !sales || !specialLists) {
    return <div className="text-sm text-slate-500 p-6">Carregando…</div>;
  }

  const info = CONQUISTA_CATS.find((c) => c.key === catKey)!;
  const isUnit = isUnitConquista(catKey);
  const activeTemplate: ConquistaCardTemplate = cardTemplates?.find((t) => t.isDefault) ?? BUILT_IN_TEMPLATE;
  const rows = computeConquistas(sales, collaborators, dashFrom, dashTo, catKey, specialLists);
  const filtered = rows.filter((r) => matchesFilter(r, tierFilter));
  const dayGallery = computeConquistasDayGallery(sales, collaborators, dashFrom, dashTo, catKey, specialLists);

  async function handleCopyImage() {
    setGenerating(true);
    try {
      const blob = await generateConquistaImageBlob(filtered, catKey, info.label, dashFrom, dashTo, store?.nome_loja);
      if (!blob) return;
      const copiedToClipboard = await tryCopyImage(blob);
      setImageModal({ url: URL.createObjectURL(blob), copied: copiedToClipboard });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
      <div className="flex flex-col gap-3 min-w-0">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-lg font-semibold mb-3" style={{ color: '#ffb700' }}>
            🏆 Galeria de Conquistas — {info.label}
          </h3>

          <div className="flex flex-wrap gap-2 mb-3">
            {CONQUISTA_CATS.map((c) => (
              <button
                key={c.key}
                onClick={() => {
                  setCatKey(c.key);
                  setTierFilter('ALL');
                }}
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
            {(['ALL', ...CONQUISTA_TIERS_BY_CAT[catKey]] as TierFilter[]).map((f) => (
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
                {f === 'ALL' ? 'Todos' : `🏆 ${conquistaTierLabel(catKey, f)}`}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          {filtered.length === 0 ? (
            <div className="text-sm text-slate-500 py-6 text-center">Sem conquistas para este período.</div>
          ) : (
            <div className="grid grid-cols-1 min-[520px]:grid-cols-2 min-[760px]:grid-cols-3 gap-4">
              {filtered.map((r) => (
                <ConquistaCard
                  key={r.matricula}
                  row={r}
                  categoria={catKey}
                  color={info.color}
                  isUnit={isUnit}
                  logoUrl={store?.logo_url}
                  template={activeTemplate}
                />
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={handleCopyImage}
              disabled={generating}
              className="rounded-lg border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
              style={{ borderColor: '#ffb700', color: '#ffb700' }}
            >
              {generating ? 'Gerando...' : '🖼️ Copiar galeria (imagem)'}
            </button>
            <Link
              to="/metas"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              ⚙️ Ajustar Metas
            </Link>
            <Link
              to="/admin/card-conquista"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              🎨 Modelos de Card
            </Link>
          </div>
        </div>
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

/** The achievement "figurinha": collaborator photo, the store's own logo
 * (pre-configured in ADM > Minha Loja) and a tier banner, each clipped to
 * the active template's exact mask geometry via canvas `destination-in`
 * compositing (see conquistaCardRender.ts) — not a CSS approximation. Name
 * and value stay as plain text below the art, matching the reference cards'
 * own layout (their masks cover only photo/logo/tier-banner). */
function ConquistaCard({
  row,
  categoria,
  color,
  isUnit,
  logoUrl,
  template,
}: {
  row: ConquistaRow;
  categoria: ConquistaCategoria;
  color: string;
  isUnit: boolean;
  logoUrl?: string | null;
  template: ConquistaCardTemplate;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tierText = conquistaTierLabel(categoria, row.tier);

  useEffect(() => {
    let active = true;
    renderConquistaCard(template, { photoUrl: row.foto, logoUrl: logoUrl ?? null, tierText, color }).then((rendered) => {
      if (!active) return;
      const target = canvasRef.current;
      if (!target) return;
      target.width = rendered.width;
      target.height = rendered.height;
      target.getContext('2d')?.drawImage(rendered, 0, 0);
    });
    return () => {
      active = false;
    };
  }, [template, row.foto, logoUrl, tierText, color]);

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col items-center text-center" style={{ boxShadow: `0 0 24px -6px ${color}80` }}>
      <canvas ref={canvasRef} className="w-full h-auto block" />
      <div className="mt-2 text-base font-bold truncate max-w-full px-3">{row.apelido || row.nome}</div>
      <div className="text-sm font-mono" style={{ color: '#14ff00' }}>
        {isUnit ? `${row.itens} un.` : fmtMoney(row.valor)}
      </div>
    </div>
  );
}
