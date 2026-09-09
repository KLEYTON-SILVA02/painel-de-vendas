import { useEffect, useMemo, useRef, useState } from 'react';
import { PageLoading } from '../../components/PageLoading';
import { Link } from 'react-router-dom';
import { SidebarCalendarCard } from '../../components/SidebarCalendarCard';
import { RankingImageModal } from '../../components/ranking/RankingImageModal';
import { useCategoryLabelMap } from '../../lib/business/categoryLabels';
import {
  computeConquistas,
  computeConquistasDayGallery,
  conquistaTierLabel,
  conquistaTierParts,
  isUnitConquista,
  tiersFor,
  type ConquistaCategoria,
  type ConquistaRow,
  type GenericConquistaConfig,
} from '../../lib/business/conquistas';
import { BUILT_IN_TEMPLATE, renderConquistaCard, type ConquistaCardTemplate } from '../../lib/conquistaCardRender';
import { generateConquistaImageBlob } from '../../lib/conquistaImage';
import { fmtDateBR, fmtMoney } from '../../lib/format';
import { useCollaborators, useConquistaCardTemplates, useGenericConquistaConfigs, useSales, useSpecialLists, useStore } from '../../lib/queries';
import { tryCopyImage } from '../../lib/rankingImage';
import { useDateRange } from '../DateRangeContext';

// Galeria de Conquistas — detects achievers of any of a category's fixed
// tiers (R$ for Dermo/Marcas Exclusivas/Genérico, unidades vendidas for
// Levmel/Chip), mirroring the Início screen's two-column dash-grid layout
// (main content + sidebar date filter). Individual-goal configuration
// (formerly a "Super Meta Individual" duplicated here) now lives only in
// ADM > Metas > Metas Individuais — the "Ajustar" button below links there
// instead of opening its own panel.
//
// ADM-created generic categories (Gerenciar Categorias) that configured
// their own conquista_tiers ladder show up here too, alongside the 5 fixed
// ones — Biosintética never does: it's an isolated category with its own
// meta1/2/3 achievement system, kept out of Conquistas entirely (see
// useGenericConquistaConfigs).

type FixedConquistaCat = 'DERM' | 'MP' | 'GEN' | 'LEVMEL' | 'CHIP';

const CONQUISTA_CATS: { key: FixedConquistaCat; label: string; color: string }[] = [
  { key: 'DERM', label: 'Dermocosméticos', color: '#ff3df0' },
  { key: 'MP', label: 'Marcas Exclusivas', color: '#a82bff' },
  { key: 'GEN', label: 'Genérico', color: '#14ff00' },
  { key: 'LEVMEL', label: 'Levmel', color: '#ffb700' },
  { key: 'CHIP', label: 'Chip', color: '#00e5ff' },
];

const GENERIC_CAT_COLORS = ['#00c2ff', '#ff8a00', '#7bffb0', '#ff5c8a', '#c9a0ff'];

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
  const { data: genericConquistas } = useGenericConquistaConfigs();
  const { dashFrom, dashTo, setDay } = useDateRange();
  const categoryLabels = useCategoryLabelMap();
  const categories = useMemo(() => {
    const fixed = CONQUISTA_CATS.map((c) => ({ ...c, label: categoryLabels[c.key] ?? c.label, generic: undefined as GenericConquistaConfig | undefined }));
    const generic = (genericConquistas ?? []).map((g, i) => ({
      key: g.chave as ConquistaCategoria,
      label: g.nome,
      color: GENERIC_CAT_COLORS[i % GENERIC_CAT_COLORS.length],
      generic: g as GenericConquistaConfig | undefined,
    }));
    return [...fixed, ...generic];
  }, [categoryLabels, genericConquistas]);
  const [catKey, setCatKey] = useState<ConquistaCategoria>('DERM');
  const [tierFilter, setTierFilter] = useState<TierFilter>('ALL');
  const [generating, setGenerating] = useState(false);
  const [imageModal, setImageModal] = useState<{ url: string; copied: boolean } | null>(null);

  const info = categories.find((c) => c.key === catKey) ?? categories[0];
  const generic = info.generic;

  // Safe stand-ins so the useMemo calls below always run in the same order
  // (Rules of Hooks) whether or not every query has resolved yet — the
  // "Carregando…" guard comes after them, not before.
  const salesData = sales ?? [];
  const collaboratorsData = collaborators ?? [];
  const rows = useMemo(
    () => computeConquistas(salesData, collaboratorsData, dashFrom, dashTo, catKey, specialLists, generic),
    [salesData, collaboratorsData, dashFrom, dashTo, catKey, specialLists, generic],
  );
  const dayGallery = useMemo(
    () => computeConquistasDayGallery(salesData, collaboratorsData, dashFrom, dashTo, catKey, specialLists, generic),
    [salesData, collaboratorsData, dashFrom, dashTo, catKey, specialLists, generic],
  );

  if (!collaborators || !sales || !specialLists) {
    return <PageLoading />;
  }

  const isUnit = isUnitConquista(catKey);
  const activeTemplate: ConquistaCardTemplate = cardTemplates?.find((t) => t.isDefault) ?? BUILT_IN_TEMPLATE;
  const filtered = rows.filter((r) => matchesFilter(r, tierFilter));

  async function handleCopyImage() {
    setGenerating(true);
    try {
      const blob = await generateConquistaImageBlob(filtered, catKey, info.label, dashFrom, dashTo, store?.nome_loja, activeTemplate, store?.logo_url, info.color, generic);
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
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <h3 className="text-lg font-semibold" style={{ color: '#ffb700' }}>
              🏆 Galeria de Conquistas — {info.label}
            </h3>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            {categories.map((c) => (
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
            {(['ALL', ...tiersFor(catKey, generic)] as TierFilter[]).map((f) => (
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
                {f === 'ALL' ? 'Todos' : `🏆 ${conquistaTierLabel(catKey, f, generic)}`}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          {filtered.length === 0 ? (
            <div className="text-sm text-slate-500 py-6 text-center">Sem conquistas para este período.</div>
          ) : (
            <div className="grid grid-cols-2 min-[520px]:grid-cols-4 min-[760px]:grid-cols-6 gap-2">
              {filtered.map((r) => (
                <ConquistaCard
                  key={r.matricula}
                  row={r}
                  categoria={catKey}
                  generic={generic}
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
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {/* Ajustar Metas / Modelos de Card / Galeria de Figurinhas — em cima
            da célula do filtro de datas, uma célula por botão: os dois
            primeiros lado a lado, o terceiro ocupando a linha de baixo. */}
        <div className="grid grid-cols-2 gap-2">
          <Link
            to="/metas"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 text-center"
          >
            ⚙️ Ajustar Metas
          </Link>
          <Link
            to="/admin/card-conquista"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 text-center"
          >
            🎨 Modelos de Card
          </Link>
          <Link
            to="/conquistas/figurinhas"
            className="col-span-2 rounded-lg border px-3 py-1.5 text-sm font-semibold text-center"
            style={{ borderColor: '#ffb700', color: '#ffb700' }}
          >
            🖼️ Galeria de Figurinhas
          </Link>
        </div>
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
          compact={filtered.length === 1}
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
  generic,
  color,
  isUnit,
  logoUrl,
  template,
}: {
  row: ConquistaRow;
  categoria: ConquistaCategoria;
  generic?: GenericConquistaConfig;
  color: string;
  isUnit: boolean;
  logoUrl?: string | null;
  template: ConquistaCardTemplate;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle');
  const tierText = conquistaTierLabel(categoria, row.tier, generic);
  const { valor: valorText, categoria: categoriaText } = conquistaTierParts(categoria, row.tier, generic);

  async function handleCopyCard() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setCopyState('copying');
    canvas.toBlob(async (blob) => {
      const ok = blob ? await tryCopyImage(blob) : false;
      setCopyState(ok ? 'copied' : 'failed');
      setTimeout(() => setCopyState('idle'), 2000);
    }, 'image/png');
  }

  useEffect(() => {
    let active = true;
    renderConquistaCard(template, { photoUrl: row.foto, logoUrl: logoUrl ?? null, tierText, valorText, categoriaText, color }).then((rendered) => {
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
  }, [template, row.foto, logoUrl, tierText, valorText, categoriaText, color]);

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col items-center text-center" style={{ boxShadow: `0 0 24px -6px ${color}80` }}>
      <canvas ref={canvasRef} className="w-full h-auto block" />
      <div className="mt-1 text-xs font-bold truncate max-w-full px-2">{row.apelido || row.nome}</div>
      <div className="text-xs font-mono" style={{ color: '#14ff00' }}>
        {isUnit ? `${row.itens} un.` : fmtMoney(row.valor)}
      </div>
      <button
        onClick={handleCopyCard}
        disabled={copyState === 'copying'}
        className="mt-1 mb-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold disabled:opacity-50"
        style={{ borderColor: '#ffb700', color: '#ffb700' }}
      >
        {copyState === 'copied' ? '✓ Copiado' : copyState === 'copying' ? 'Copiando…' : copyState === 'failed' ? 'Falhou' : '📋 Copiar imagem'}
      </button>
    </div>
  );
}
