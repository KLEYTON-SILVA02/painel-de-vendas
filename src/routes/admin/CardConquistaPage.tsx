import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { useAuth } from '../../auth/AuthContext';
import {
  BUILT_IN_TEMPLATE,
  renderConquistaCard,
  type CardTextKind,
  type CardTextLayer,
  type CardZone,
  type CardZoneShapeKind,
  type ConquistaCardTemplate,
} from '../../lib/conquistaCardRender';
import { magicWandSelect } from '../../lib/magicWand';
import { loadImg } from '../../lib/rankingImage';
import {
  useDeleteConquistaCardTemplate,
  useSaveConquistaCardTemplate,
  useSetDefaultConquistaCardTemplate,
} from '../../lib/mutations';
import { useConquistaCardTemplates, useStore, type ConquistaCardTemplateRow } from '../../lib/queries';
import { uploadConquistaCardBackground, uploadConquistaCardLogo } from '../../lib/storage';
import type { Json } from '../../types/database';

// Manual configuration tool for Galeria de Conquistas card templates. Each
// template's photo/logo zones and up to 3 independent text layers are built
// from shape primitives (not raster masks, except when the magic wand
// generates one — see below) so the admin can manipulate them with shape/
// scale/position controls, matching the request in full: mask-building
// tools, scale, position, an optional reference image used only for
// on-screen alignment (never persisted — it's a local object URL, discarded
// on save or when the editor closes), a magic-wand tool that flood-fills an
// area from a click to detect it automatically, an independent logo scale
// control, up to 3 text layers (1º = nível/tier, 2º = categoria, 3º = texto
// livre) each with its own font, solid-or-gradient color, and optional
// background plate, a freehand "pen" tool for tracing an exact cutout by
// hand, and a gallery to create/edit/delete templates and mark one default.

const SHAPE_OPTIONS: { value: CardZoneShapeKind; label: string }[] = [
  { value: 'circle', label: 'Círculo' },
  { value: 'roundedRect', label: 'Retângulo arredondado' },
  { value: 'pill', label: 'Cápsula (pílula)' },
  { value: 'trapezoid', label: 'Trapézio (faixa)' },
  { value: 'notched', label: 'Cantos cortados (cartão)' },
  { value: 'none', label: 'Sem forma (só o conteúdo)' },
];

const FONT_OPTIONS = [
  'Arial',
  'Georgia',
  'Verdana',
  'Trebuchet MS',
  'Courier New',
  'Impact',
  'Comic Sans MS',
  'Poppins',
  'Montserrat',
  'Oswald',
  'Bebas Neue',
  'Anton',
  'Russo One',
  'Playfair Display',
  'Pacifico',
  'Bangers',
];

const ZONE_COLORS = { foto: '#00f0ff', logo: '#ffb700' } as const;
const ZONE_LABELS = { foto: 'Foto do colaborador', logo: 'Logo da loja' } as const;

const TEXT_KIND_LABEL: Record<CardTextKind, string> = {
  tier: '1º texto — Nível (1K, 2K, 3K, 5K, 10K...)',
  categoria: '2º texto — Nome da categoria',
  custom: '3º texto — Texto livre',
};
const TEXT_KIND_COLOR: Record<CardTextKind, string> = {
  tier: '#ff3df0',
  categoria: '#a82bff',
  custom: '#00c2ff',
};
// The order new text layers get added in — always fills the 1º/2º slots
// (tier/categoria) before offering the free 3º slot, matching how the ADM
// asked for them ("o primeiro texto será... o segundo texto será...").
const TEXT_KIND_ORDER: CardTextKind[] = ['tier', 'categoria', 'custom'];
const MAX_TEXT_LAYERS = 3;

interface EditorState {
  id: string;
  isNew: boolean;
  name: string;
  backgroundUrl: string | null;
  uploadingBackground: boolean;
  logoUrl: string | null;
  uploadingLogo: boolean;
  /** Contain-fit scale for the logo within its zone — independent of the
   * zone's own w/h, which just define the placement area. */
  logoScale: number;
  referenceObjectUrl: string | null;
  foto: CardZone;
  logo: CardZone;
  textLayers: CardTextLayer[];
}

function newZone(shape: CardZoneShapeKind, x: number, y: number, w: number, h: number): CardZone {
  return { shape: { kind: shape }, x, y, w, h };
}

function newTextLayer(kind: CardTextKind, zone: CardZone): CardTextLayer {
  return {
    id: crypto.randomUUID(),
    kind,
    text: kind === 'custom' ? 'Texto livre' : '',
    zone,
    fontFamily: 'Arial',
    color: '#0b0e1d',
    useGradient: false,
    gradientFrom: '#ffb700',
    gradientTo: '#ff3df0',
  };
}

const DEFAULT_FOTO_ZONE = () => newZone('notched', 0.0742, 0.0334, 0.8509, 0.7963);

function defaultTextLayers(): CardTextLayer[] {
  return [
    newTextLayer('tier', newZone('trapezoid', 0.1531, 0.8362, 0.6939, 0.0459)),
    newTextLayer('categoria', newZone('none', 0.1531, 0.8821, 0.6939, 0.0459)),
  ];
}

/** Upgrades a template saved before this multi-text-layer editor existed
 * (only the legacy single `texto` zone + `textFontFamily`) into a starting
 * 1º/2º-text pair, so opening it here doesn't start from a blank slate —
 * it keeps roughly the same on-screen footprint, split in two. */
function synthesizeTextLayersFromLegacy(texto: CardZone | undefined, fontFamily: string | undefined): CardTextLayer[] {
  if (!texto) return defaultTextLayers();
  const color = texto.shape.kind === 'none' ? '#ffb700' : '#0b0e1d';
  const half = { ...texto, h: texto.h * 0.48 };
  const tier = { ...newTextLayer('tier', half), fontFamily: fontFamily ?? 'Arial', color };
  const categoria = {
    ...newTextLayer('categoria', { ...half, y: texto.y + texto.h * 0.52, shape: { kind: 'none' as const } }),
    fontFamily: fontFamily ?? 'Arial',
    color,
  };
  return [tier, categoria];
}

function blankEditor(): EditorState {
  return {
    id: crypto.randomUUID(),
    isNew: true,
    name: '',
    backgroundUrl: null,
    uploadingBackground: false,
    logoUrl: null,
    uploadingLogo: false,
    logoScale: 0.85,
    referenceObjectUrl: null,
    foto: DEFAULT_FOTO_ZONE(),
    logo: newZone('pill', 0.3168, 0.0274, 0.3663, 0.0321),
    textLayers: defaultTextLayers(),
  };
}

export function CardConquistaPage() {
  const { profile } = useAuth();
  const { data: store } = useStore();
  const { data: templates } = useConquistaCardTemplates();
  const saveTemplate = useSaveConquistaCardTemplate(profile?.store_id);
  const deleteTemplate = useDeleteConquistaCardTemplate();
  const setDefault = useSetDefaultConquistaCardTemplate(profile?.store_id);

  const [editing, setEditing] = useState<EditorState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return () => {
      if (editing?.referenceObjectUrl) URL.revokeObjectURL(editing.referenceObjectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startNew() {
    setError(null);
    setEditing(blankEditor());
  }

  function startEdit(t: ConquistaCardTemplateRow) {
    setError(null);
    const textLayers = t.textLayers && t.textLayers.length > 0 ? t.textLayers : synthesizeTextLayersFromLegacy(t.texto, t.textFontFamily);
    setEditing({
      id: t.id,
      isNew: false,
      name: t.name,
      backgroundUrl: t.backgroundUrl,
      uploadingBackground: false,
      logoUrl: t.logoUrl ?? null,
      uploadingLogo: false,
      logoScale: t.logoScale ?? 0.85,
      referenceObjectUrl: null,
      foto: t.foto,
      logo: t.logo,
      textLayers,
    });
  }

  /** The built-in Hiteck template is bundled code, not a DB row — there's
   * nothing to "Editar" on it directly. When it's the one actually in use
   * (no saved template marked default), the admin still needs a way to
   * adjust the card currently live — so this starts a new template
   * pre-filled with its geometry/masks/texts as a starting point instead of
   * from scratch. The background art can't be carried over as-is (it's a
   * bundled asset whose build-time URL isn't stable across deploys), so it
   * starts unset here — same as a brand-new template — and the admin
   * uploads their own before saving. */
  function startEditBuiltIn() {
    setError(null);
    setEditing({
      id: crypto.randomUUID(),
      isNew: true,
      name: `${BUILT_IN_TEMPLATE.name} (cópia)`,
      backgroundUrl: null,
      uploadingBackground: false,
      logoUrl: BUILT_IN_TEMPLATE.logoUrl ?? null,
      uploadingLogo: false,
      logoScale: BUILT_IN_TEMPLATE.logoScale ?? 0.85,
      referenceObjectUrl: null,
      foto: BUILT_IN_TEMPLATE.foto,
      logo: BUILT_IN_TEMPLATE.logo,
      textLayers: synthesizeTextLayersFromLegacy(BUILT_IN_TEMPLATE.texto, BUILT_IN_TEMPLATE.textFontFamily),
    });
  }

  function closeEditor() {
    if (editing?.referenceObjectUrl) URL.revokeObjectURL(editing.referenceObjectUrl);
    setEditing(null);
    setError(null);
  }

  async function handleBackgroundUpload(file: File) {
    if (!profile?.store_id || !editing) return;
    setEditing({ ...editing, uploadingBackground: true });
    try {
      const url = await uploadConquistaCardBackground(profile.store_id, editing.id, file);
      setEditing((ed) => (ed ? { ...ed, backgroundUrl: url, uploadingBackground: false } : ed));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao enviar o plano de fundo.');
      setEditing((ed) => (ed ? { ...ed, uploadingBackground: false } : ed));
    }
  }

  async function handleLogoUpload(file: File) {
    if (!profile?.store_id || !editing) return;
    setEditing({ ...editing, uploadingLogo: true });
    try {
      const url = await uploadConquistaCardLogo(profile.store_id, editing.id, file);
      setEditing((ed) => (ed ? { ...ed, logoUrl: url, uploadingLogo: false } : ed));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao enviar a logo.');
      setEditing((ed) => (ed ? { ...ed, uploadingLogo: false } : ed));
    }
  }

  function handleReferenceUpload(file: File) {
    if (!editing) return;
    if (editing.referenceObjectUrl) URL.revokeObjectURL(editing.referenceObjectUrl);
    setEditing({ ...editing, referenceObjectUrl: URL.createObjectURL(file) });
  }

  function removeReference() {
    if (!editing?.referenceObjectUrl) return;
    URL.revokeObjectURL(editing.referenceObjectUrl);
    setEditing({ ...editing, referenceObjectUrl: null });
  }

  async function handleSave() {
    if (!editing) return;
    if (!editing.backgroundUrl) {
      setError('Envie a imagem de plano de fundo final antes de salvar.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await saveTemplate.mutateAsync({
        id: editing.isNew ? undefined : editing.id,
        name: editing.name.trim() || 'Modelo sem nome',
        backgroundUrl: editing.backgroundUrl,
        logoUrl: editing.logoUrl,
        logoScale: editing.logoScale,
        foto: editing.foto as unknown as Json,
        logo: editing.logo as unknown as Json,
        textLayers: editing.textLayers as unknown as Json,
      });
      closeEditor();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar o modelo.');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(t: ConquistaCardTemplateRow) {
    if (!window.confirm(`Excluir o modelo "${t.name}"?`)) return;
    deleteTemplate.mutate(t.id);
  }

  const hasDefaultTemplate = !!templates?.some((t) => t.isDefault);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-1">Modelos de Card — Galeria de Conquistas</h3>
        <p className="text-xs text-slate-500">
          Crie modelos visuais para o card de conquista: monte as máscaras da foto e da logo escolhendo uma forma e ajustando escala e
          posição (ou use a varinha mágica pra detectar a área automaticamente, ou desenhe à mão com a caneta), adicione até 3 textos
          (nível, categoria e um texto livre) com fonte, cor ou degradê próprios, e ajuste a escala da logo. A imagem de referência é
          usada apenas para alinhar na tela e nunca é salva — só o plano de fundo final enviado é gravado.
        </p>
        {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
      </div>

      {!editing && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-300">Modelos salvos</h4>
            <button
              onClick={startNew}
              className="rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide"
              style={{ background: '#ffb700', color: '#231a02' }}
            >
              + Novo modelo
            </button>
          </div>

          <div className="grid grid-cols-1 min-[520px]:grid-cols-2 min-[860px]:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 flex flex-col gap-2">
              <TemplateThumb template={BUILT_IN_TEMPLATE} logoUrl={store?.logo_url} />
              <div className="text-sm font-semibold">{BUILT_IN_TEMPLATE.name}</div>
              <div className="text-[11px] text-slate-500">Modelo embutido — usado quando nenhum modelo abaixo estiver marcado como padrão.</div>
              <div
                className="text-[11px] font-bold uppercase tracking-wide text-center py-1 rounded-lg"
                style={{ background: hasDefaultTemplate ? 'transparent' : '#14ff0022', color: hasDefaultTemplate ? '#4a5178' : '#14ff00' }}
              >
                {hasDefaultTemplate ? 'Inativo' : '★ Em uso agora'}
              </div>
              <button onClick={startEditBuiltIn} className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800">
                Duplicar e editar
              </button>
            </div>

            {templates?.map((t) => (
              <div key={t.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 flex flex-col gap-2">
                <TemplateThumb template={t} logoUrl={store?.logo_url} />
                <div className="text-sm font-semibold truncate">{t.name}</div>
                <button
                  onClick={() => setDefault.mutate(t.id)}
                  className="text-[11px] font-bold uppercase tracking-wide text-center py-1 rounded-lg"
                  style={{ background: t.isDefault ? '#14ff0022' : '#0b0e1d', color: t.isDefault ? '#14ff00' : '#8b90bf', border: '1px solid #212948' }}
                >
                  {t.isDefault ? '★ Em uso agora' : 'Definir como padrão'}
                </button>
                <div className="flex gap-2">
                  <button onClick={() => startEdit(t)} className="flex-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800">
                    Editar
                  </button>
                  <button onClick={() => handleDelete(t)} className="flex-1 rounded-lg border border-rose-900 px-2 py-1 text-[11px] text-rose-400 hover:bg-rose-950">
                    Excluir
                  </button>
                </div>
              </div>
            ))}

            {templates?.length === 0 && (
              <div className="text-xs text-slate-500 flex items-center">Nenhum modelo criado ainda — use "+ Novo modelo" para começar.</div>
            )}
          </div>
        </div>
      )}

      {editing && (
        <TemplateEditor
          editing={editing}
          setEditing={setEditing}
          logoUrl={store?.logo_url}
          saving={saving}
          onCancel={closeEditor}
          onSave={handleSave}
          onUploadBackground={handleBackgroundUpload}
          onUploadLogo={handleLogoUpload}
          onRemoveLogo={() => setEditing({ ...editing, logoUrl: null })}
          onUploadReference={handleReferenceUpload}
          onRemoveReference={removeReference}
        />
      )}
    </div>
  );
}

function TemplateThumb({ template, logoUrl }: { template: ConquistaCardTemplate; logoUrl?: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    renderConquistaCard(template, { photoUrl: null, logoUrl: logoUrl ?? null, tierText: 'EXEMPLO 3K', valorText: '3K', categoriaText: 'EXEMPLO', color: '#ffb700' }).then(
      (rendered) => {
        if (!active) return;
        const target = canvasRef.current;
        if (!target) return;
        target.width = rendered.width;
        target.height = rendered.height;
        target.getContext('2d')?.drawImage(rendered, 0, 0);
      },
    );
    return () => {
      active = false;
    };
  }, [template, logoUrl]);
  return <canvas ref={canvasRef} className="w-full h-auto block rounded-lg" />;
}

function TemplateEditor({
  editing,
  setEditing,
  logoUrl,
  saving,
  onCancel,
  onSave,
  onUploadBackground,
  onUploadLogo,
  onRemoveLogo,
  onUploadReference,
  onRemoveReference,
}: {
  editing: EditorState;
  setEditing: (s: EditorState) => void;
  logoUrl?: string | null;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
  onUploadBackground: (file: File) => void;
  onUploadLogo: (file: File) => void;
  onRemoveLogo: () => void;
  onUploadReference: (file: File) => void;
  onRemoveReference: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Freehand "pen" tool for the photo cutout: null = not drawing; an array
  // (possibly empty) = actively tracing, one point per click on the preview.
  const [penPoints, setPenPoints] = useState<{ x: number; y: number }[] | null>(null);
  // Magic-wand tool: which zone a click on the preview should feed a
  // flood-fill selection into. Mutually exclusive with the pen tool.
  const [wandTarget, setWandTarget] = useState<'foto' | 'logo' | null>(null);
  const [wandTolerance, setWandTolerance] = useState(32);
  const [wandBusy, setWandBusy] = useState(false);
  const [wandError, setWandError] = useState<string | null>(null);

  const previewTemplate: ConquistaCardTemplate = {
    id: editing.id,
    name: editing.name,
    backgroundUrl: editing.backgroundUrl ?? BUILT_IN_TEMPLATE.backgroundUrl,
    logoUrl: editing.logoUrl,
    logoScale: editing.logoScale,
    foto: editing.foto,
    logo: editing.logo,
    textLayers: editing.textLayers,
  };

  useEffect(() => {
    let active = true;
    renderConquistaCard(previewTemplate, { photoUrl: null, logoUrl: logoUrl ?? null, tierText: 'EXEMPLO 3K', valorText: '3K', categoriaText: 'EXEMPLO', color: '#ffb700' }).then(
      (rendered) => {
        if (!active) return;
        const target = canvasRef.current;
        if (!target) return;
        target.width = rendered.width;
        target.height = rendered.height;
        target.getContext('2d')?.drawImage(rendered, 0, 0);
      },
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing.backgroundUrl, editing.logoUrl, editing.logoScale, editing.foto, editing.logo, editing.textLayers, logoUrl]);

  function finishPen() {
    if (!penPoints || penPoints.length < 3) return;
    const xs = penPoints.map((p) => p.x);
    const ys = penPoints.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    setEditing({
      ...editing,
      foto: { shape: { kind: 'polygon', points: penPoints }, x: minX, y: minY, w: Math.max(0.01, maxX - minX), h: Math.max(0.01, maxY - minY) },
    });
    setPenPoints(null);
  }

  async function handlePreviewClick(e: ReactMouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    if (penPoints !== null) {
      setPenPoints([...penPoints, { x, y }]);
      return;
    }

    if (wandTarget) {
      setWandBusy(true);
      setWandError(null);
      try {
        const sourceUrl = editing.referenceObjectUrl ?? editing.backgroundUrl;
        const img = sourceUrl ? await loadImg(sourceUrl) : null;
        if (!img) {
          setWandError('Carregue um plano de fundo (ou uma referência) antes de usar a varinha.');
          return;
        }
        const result = magicWandSelect(img, x, y, wandTolerance);
        if (!result) {
          setWandError('Não detectei uma área ali — tente clicar em outro ponto, ou aumente a tolerância.');
          return;
        }
        const newZoneValue: CardZone = {
          shape: { kind: 'image', imageUrl: result.maskDataUrl },
          x: result.x,
          y: result.y,
          w: result.w,
          h: result.h,
        };
        setEditing({ ...editing, [wandTarget]: newZoneValue });
      } finally {
        setWandBusy(false);
      }
    }
  }

  function addNextTextLayer() {
    if (editing.textLayers.length >= MAX_TEXT_LAYERS) return;
    const used = new Set(editing.textLayers.map((l) => l.kind));
    const nextKind = TEXT_KIND_ORDER.find((k) => !used.has(k)) ?? 'custom';
    // Starts near the top rather than stacked on the 1º/2º texto default
    // position (usually near the bottom, like the legacy tier banner) —
    // just a starting point, freely draggable via the sliders below either way.
    const layer = newTextLayer(nextKind, newZone('none', 0.15, 0.05, 0.7, 0.06));
    setEditing({ ...editing, textLayers: [...editing.textLayers, layer] });
  }

  function updateTextLayer(id: string, patch: Partial<CardTextLayer>) {
    setEditing({ ...editing, textLayers: editing.textLayers.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  }

  function removeTextLayer(id: string) {
    setEditing({ ...editing, textLayers: editing.textLayers.filter((l) => l.id !== id) });
  }

  const previewCursor = penPoints !== null || wandTarget ? 'crosshair' : undefined;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col lg:flex-row gap-5">
      <div className="flex flex-col gap-3 lg:w-[360px] shrink-0">
        <label className="text-xs text-slate-400">
          Nome do modelo
          <input
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="Ex.: Card Hiteck roxo"
            className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-sm text-slate-100"
          />
        </label>

        <div className="rounded-lg border border-slate-800 p-2.5 flex flex-col gap-2">
          <div className="text-xs font-semibold text-slate-300">Plano de fundo final (salvo)</div>
          <label className="w-full">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadBackground(f);
                e.target.value = '';
              }}
            />
            <span className="block text-center rounded-lg border border-slate-700 px-2 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800 cursor-pointer">
              {editing.uploadingBackground ? 'Enviando…' : editing.backgroundUrl ? 'Substituir plano de fundo' : 'Carregar plano de fundo'}
            </span>
          </label>
        </div>

        <div className="rounded-lg border border-slate-800 p-2.5 flex flex-col gap-2">
          <div className="text-xs font-semibold text-slate-300">Logo deste card (opcional)</div>
          <p className="text-[11px] text-slate-500">Substitui a logo da loja só neste modelo. Sem upload, usa a logo cadastrada em Minha Loja.</p>
          <label className="w-full">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadLogo(f);
                e.target.value = '';
              }}
            />
            <span className="block text-center rounded-lg border border-slate-700 px-2 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800 cursor-pointer">
              {editing.uploadingLogo ? 'Enviando…' : editing.logoUrl ? 'Substituir logo' : 'Carregar logo própria'}
            </span>
          </label>
          {editing.logoUrl && (
            <button onClick={onRemoveLogo} className="text-[11px] text-slate-500 hover:text-rose-400">
              Usar a logo da loja
            </button>
          )}
        </div>

        <div className="rounded-lg border border-slate-800 p-2.5 flex flex-col gap-2">
          <div className="text-xs font-semibold text-slate-300">Imagem de referência (só nesta tela)</div>
          <p className="text-[11px] text-slate-500">
            Carregue um print/rascunho para servir de guia enquanto você posiciona as formas abaixo (a varinha mágica e a caneta também
            traçam sobre ela quando presente). Ela nunca é salva — some ao trocar ou ao sair da edição.
          </p>
          <label className="w-full">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadReference(f);
                e.target.value = '';
              }}
            />
            <span className="block text-center rounded-lg border border-slate-700 px-2 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800 cursor-pointer">
              {editing.referenceObjectUrl ? 'Substituir referência' : 'Carregar referência'}
            </span>
          </label>
          {editing.referenceObjectUrl && (
            <button onClick={onRemoveReference} className="text-[11px] text-slate-500 hover:text-rose-400">
              Remover referência
            </button>
          )}
        </div>

        <ZoneControls
          label={ZONE_LABELS.foto}
          color={ZONE_COLORS.foto}
          zone={editing.foto}
          onChange={(z) => setEditing({ ...editing, foto: z })}
          pen={{
            active: penPoints !== null,
            pointCount: penPoints?.length ?? 0,
            onStart: () => {
              setWandTarget(null);
              setPenPoints([]);
            },
            onFinish: finishPen,
            onCancel: () => setPenPoints(null),
            onClearCustom: () => setEditing({ ...editing, foto: DEFAULT_FOTO_ZONE() }),
          }}
          wand={{
            active: wandTarget === 'foto',
            busy: wandBusy && wandTarget === 'foto',
            tolerance: wandTolerance,
            error: wandTarget === 'foto' ? wandError : null,
            onToleranceChange: setWandTolerance,
            onStart: () => {
              setPenPoints(null);
              setWandError(null);
              setWandTarget('foto');
            },
            onCancel: () => {
              setWandTarget(null);
              setWandError(null);
            },
          }}
        />
        <ZoneControls
          label={ZONE_LABELS.logo}
          color={ZONE_COLORS.logo}
          zone={editing.logo}
          onChange={(z) => setEditing({ ...editing, logo: z })}
          wand={{
            active: wandTarget === 'logo',
            busy: wandBusy && wandTarget === 'logo',
            tolerance: wandTolerance,
            error: wandTarget === 'logo' ? wandError : null,
            onToleranceChange: setWandTolerance,
            onStart: () => {
              setPenPoints(null);
              setWandError(null);
              setWandTarget('logo');
            },
            onCancel: () => {
              setWandTarget(null);
              setWandError(null);
            },
          }}
        >
          <label className="text-[11px] text-slate-400">
            Escala da logo dentro da área ({Math.round(editing.logoScale * 100)}%)
            <input
              type="range"
              min={30}
              max={150}
              value={Math.round(editing.logoScale * 100)}
              onChange={(e) => setEditing({ ...editing, logoScale: Number(e.target.value) / 100 })}
              className="w-full"
            />
          </label>
        </ZoneControls>

        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold text-slate-300">Textos do card ({editing.textLayers.length}/{MAX_TEXT_LAYERS})</div>
          {editing.textLayers.map((layer) => (
            <TextLayerEditor
              key={layer.id}
              layer={layer}
              label={TEXT_KIND_LABEL[layer.kind]}
              color={TEXT_KIND_COLOR[layer.kind]}
              onChange={(patch) => updateTextLayer(layer.id, patch)}
              onRemove={() => removeTextLayer(layer.id)}
            />
          ))}
          {editing.textLayers.length < MAX_TEXT_LAYERS && (
            <button onClick={addNextTextLayer} className="rounded-lg border border-slate-700 px-2 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800">
              + Adicionar texto
            </button>
          )}
        </div>

        <div className="flex gap-2 mt-1">
          <button
            onClick={onSave}
            disabled={saving}
            className="flex-1 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide disabled:opacity-50"
            style={{ background: '#14ff00', color: '#04210a' }}
          >
            {saving ? 'Salvando…' : 'Salvar modelo'}
          </button>
          <button onClick={onCancel} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">
            Cancelar
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-start justify-center">
        <div className="relative w-full max-w-[420px]">
          <div className="relative" onClick={handlePreviewClick} style={{ cursor: previewCursor }}>
            <canvas ref={canvasRef} className="w-full h-auto block rounded-xl" />
            {editing.referenceObjectUrl && (
              <img
                src={editing.referenceObjectUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-fill rounded-xl pointer-events-none"
                style={{ opacity: 0.45 }}
              />
            )}
            {editing.foto.shape.kind !== 'polygon' && <ZoneOutline zone={editing.foto} color={ZONE_COLORS.foto} />}
            <ZoneOutline zone={editing.logo} color={ZONE_COLORS.logo} />
            {editing.textLayers.map((l) => (
              <ZoneOutline key={l.id} zone={l.zone} color={TEXT_KIND_COLOR[l.kind]} />
            ))}
            {editing.foto.shape.kind === 'polygon' && penPoints === null && (
              <PolygonOutline points={editing.foto.shape.points ?? []} color={ZONE_COLORS.foto} />
            )}
            {penPoints !== null && <PolygonOutline points={penPoints} color={ZONE_COLORS.foto} inProgress />}
          </div>
          {penPoints !== null && (
            <p className="text-[11px] text-amber-400 mt-2">
              Clique na imagem para marcar os pontos do recorte da foto ({penPoints.length} até agora — mínimo 3, depois clique em
              "Concluir forma" na coluna ao lado).
            </p>
          )}
          {wandTarget && (
            <p className="text-[11px] text-amber-400 mt-2">
              {wandBusy ? 'Detectando…' : `Clique na imagem sobre a área da ${wandTarget === 'foto' ? 'foto' : 'logo'} para detectá-la automaticamente.`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PolygonOutline({ points, color, inProgress }: { points: { x: number; y: number }[]; color: string; inProgress?: boolean }) {
  if (points.length === 0) return null;
  const pointsAttr = points.map((p) => `${p.x * 100},${p.y * 100}`).join(' ');
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
      {points.length >= 2 ? (
        <polyline points={pointsAttr} fill={inProgress ? 'none' : `${color}33`} stroke={color} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
      ) : null}
      {points.map((p, i) => (
        <circle key={i} cx={p.x * 100} cy={p.y * 100} r={1.2} fill={color} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

function ZoneOutline({ zone, color }: { zone: CardZone; color: string }) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${zone.x * 100}%`,
        top: `${zone.y * 100}%`,
        width: `${zone.w * 100}%`,
        height: `${zone.h * 100}%`,
        border: `2px dashed ${color}`,
        borderRadius: zone.shape.kind === 'circle' || zone.shape.kind === 'pill' ? '999px' : 6,
      }}
    />
  );
}

function extraParamFor(kind: CardZoneShapeKind): 'radius' | 'topInset' | 'notch' | null {
  if (kind === 'roundedRect') return 'radius';
  if (kind === 'trapezoid') return 'topInset';
  if (kind === 'notched') return 'notch';
  return null;
}

function TextLayerEditor({
  layer,
  label,
  color,
  onChange,
  onRemove,
}: {
  layer: CardTextLayer;
  label: string;
  color: string;
  onChange: (patch: Partial<CardTextLayer>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-800 p-2.5 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
          <span className="text-[11px] font-semibold text-slate-300 truncate">{label}</span>
        </div>
        <button onClick={onRemove} className="text-[10px] text-slate-500 hover:text-rose-400 shrink-0">
          Remover
        </button>
      </div>

      {layer.kind === 'custom' && (
        <label className="text-[11px] text-slate-400">
          Texto
          <input
            value={layer.text}
            onChange={(e) => onChange({ text: e.target.value })}
            className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-sm text-slate-100"
          />
        </label>
      )}

      <ZoneControls label="Posição e forma (plano de fundo do texto)" color={color} zone={layer.zone} onChange={(z) => onChange({ zone: z })} />

      <label className="text-[11px] text-slate-400">
        Fonte
        <select
          value={layer.fontFamily}
          onChange={(e) => onChange({ fontFamily: e.target.value })}
          className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs text-slate-100"
          style={{ fontFamily: layer.fontFamily }}
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>
              {f}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <input type="checkbox" checked={layer.useGradient} onChange={(e) => onChange({ useGradient: e.target.checked })} />
        Degradê entre duas cores
      </label>

      {!layer.useGradient ? (
        <label className="text-[11px] text-slate-400 flex items-center gap-2">
          Cor do texto
          <input type="color" value={layer.color} onChange={(e) => onChange({ color: e.target.value })} className="w-8 h-6 rounded border border-slate-700 bg-transparent" />
        </label>
      ) : (
        <div className="flex gap-4">
          <label className="text-[11px] text-slate-400 flex items-center gap-2">
            De
            <input
              type="color"
              value={layer.gradientFrom}
              onChange={(e) => onChange({ gradientFrom: e.target.value })}
              className="w-8 h-6 rounded border border-slate-700 bg-transparent"
            />
          </label>
          <label className="text-[11px] text-slate-400 flex items-center gap-2">
            Para
            <input
              type="color"
              value={layer.gradientTo}
              onChange={(e) => onChange({ gradientTo: e.target.value })}
              className="w-8 h-6 rounded border border-slate-700 bg-transparent"
            />
          </label>
        </div>
      )}
    </div>
  );
}

function ZoneControls({
  label,
  color,
  zone,
  onChange,
  pen,
  wand,
  children,
}: {
  label: string;
  color: string;
  zone: CardZone;
  onChange: (z: CardZone) => void;
  pen?: {
    active: boolean;
    pointCount: number;
    onStart: () => void;
    onFinish: () => void;
    onCancel: () => void;
    onClearCustom: () => void;
  };
  wand?: {
    active: boolean;
    busy: boolean;
    tolerance: number;
    error: string | null;
    onToleranceChange: (t: number) => void;
    onStart: () => void;
    onCancel: () => void;
  };
  /** Extra controls rendered inside this same bordered box, after the
   * position/shape ones — e.g. the logo's own contain-fit scale — so
   * everything about one zone lives in one visible group instead of being
   * split across the sidebar where the scale-only control (right next to
   * the logo upload) reads as the only logo adjustment available. */
  children?: ReactNode;
}) {
  const isCustom = zone.shape.kind === 'polygon';
  const isWandMask = zone.shape.kind === 'image';
  const extraParam = extraParamFor(zone.shape.kind);
  const extraValue = extraParam ? (zone.shape[extraParam] ?? (extraParam === 'radius' ? 0.15 : extraParam === 'topInset' ? 0.15 : 0.12)) : 0;

  function setField(field: 'x' | 'y' | 'w' | 'h', pct: number) {
    onChange({ ...zone, [field]: pct / 100 });
  }

  return (
    <div className="rounded-lg border border-slate-800 p-2.5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-xs font-semibold text-slate-300">{label}</span>
      </div>

      {wand && !wand.active && (
        <button onClick={wand.onStart} className="rounded-lg border border-amber-700 px-2 py-1 text-[11px] text-amber-300 hover:bg-amber-950">
          🪄 Varinha mágica (detectar área)
        </button>
      )}
      {wand?.active && (
        <div className="flex flex-col gap-1.5 border-b border-slate-800 pb-2">
          <div className="text-[10px] text-amber-400">{wand.busy ? 'Detectando…' : 'Clique na pré-visualização sobre a área desejada'}</div>
          <label className="text-[10px] text-slate-500">
            Tolerância ({wand.tolerance})
            <input
              type="range"
              min={4}
              max={100}
              value={wand.tolerance}
              onChange={(e) => wand.onToleranceChange(Number(e.target.value))}
              className="w-full"
            />
          </label>
          {wand.error && <p className="text-[10px] text-rose-400">{wand.error}</p>}
          <button onClick={wand.onCancel} className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800">
            ✕ Concluir / Cancelar
          </button>
        </div>
      )}

      {pen && !pen.active && (
        <div className="flex flex-col gap-1.5 border-b border-slate-800 pb-2">
          {!isCustom ? (
            <button onClick={pen.onStart} className="rounded-lg border border-cyan-700 px-2 py-1 text-[11px] text-cyan-300 hover:bg-cyan-950">
              ✏️ Desenhar recorte manual
            </button>
          ) : (
            <>
              <div className="text-[10px] text-cyan-300">Forma customizada (desenhada à mão)</div>
              <div className="flex gap-2">
                <button onClick={pen.onStart} className="flex-1 rounded-lg border border-cyan-700 px-2 py-1 text-[11px] text-cyan-300 hover:bg-cyan-950">
                  ✏️ Redesenhar
                </button>
                <button onClick={pen.onClearCustom} className="flex-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800">
                  Usar forma pronta
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {pen?.active && (
        <div className="flex flex-col gap-1.5 border-b border-slate-800 pb-2">
          <div className="text-[10px] text-amber-400">Clique na pré-visualização pra marcar os pontos ({pen.pointCount}, mínimo 3)</div>
          <div className="flex gap-2">
            <button
              onClick={pen.onFinish}
              disabled={pen.pointCount < 3}
              className="flex-1 rounded-lg border border-emerald-700 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-950 disabled:opacity-40"
            >
              ✓ Concluir forma
            </button>
            <button onClick={pen.onCancel} className="flex-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800">
              ✕ Cancelar
            </button>
          </div>
        </div>
      )}

      {isWandMask ? (
        <p className="text-[10px] text-slate-500">Área detectada pela varinha mágica — use a varinha de novo pra refazer, ou escolha uma forma pronta abaixo.</p>
      ) : null}

      {!isCustom ? (
        <>
          <label className="text-[11px] text-slate-400">
            Forma
            <select
              value={zone.shape.kind === 'image' ? 'none' : zone.shape.kind}
              onChange={(e) => onChange({ ...zone, shape: { kind: e.target.value as CardZoneShapeKind } })}
              className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-1 text-xs text-slate-100"
            >
              {isWandMask && <option value="none">Máscara detectada (varinha)</option>}
              {SHAPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            {(['x', 'y', 'w', 'h'] as const).map((field) => (
              <label key={field} className="text-[10px] text-slate-500">
                {field === 'x' ? 'Posição X' : field === 'y' ? 'Posição Y' : field === 'w' ? 'Largura' : 'Altura'} ({Math.round(zone[field] * 100)}%)
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(zone[field] * 100)}
                  onChange={(e) => setField(field, Number(e.target.value))}
                  className="w-full"
                />
              </label>
            ))}
          </div>

          {extraParam && (
            <label className="text-[10px] text-slate-500">
              Ajuste da forma ({Math.round(extraValue * 100)}%)
              <input
                type="range"
                min={0}
                max={50}
                value={Math.round(extraValue * 100)}
                onChange={(e) => onChange({ ...zone, shape: { ...zone.shape, [extraParam]: Number(e.target.value) / 100 } })}
                className="w-full"
              />
            </label>
          )}
        </>
      ) : (
        <p className="text-[10px] text-slate-500">Posição e tamanho seguem os pontos desenhados — use "Redesenhar" pra ajustar.</p>
      )}
      {children}
    </div>
  );
}
