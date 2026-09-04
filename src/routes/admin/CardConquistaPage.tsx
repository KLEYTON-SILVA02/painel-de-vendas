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
/** Collapsible/expandable bar used as the outer shell for every function
 * group in the editor (name, uploads, zones, text layers) — click the
 * header to toggle. `headerRight` renders extra controls (e.g. a "Remover"
 * button) beside the toggle, outside the collapsible area so they stay
 * reachable even when collapsed. */
function CollapsibleBox({
  title,
  colorDot,
  defaultOpen = true,
  headerRight,
  children,
}: {
  title: string;
  colorDot?: string;
  defaultOpen?: boolean;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-slate-800 overflow-hidden">
      <div className="w-full flex items-center gap-2 px-2.5 py-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          {colorDot && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorDot }} />}
          <span className="text-xs font-semibold text-slate-300 truncate">{title}</span>
          <span className={`ml-auto text-slate-500 transition-transform shrink-0 ${open ? '' : '-rotate-90'}`}>▾</span>
        </button>
        {headerRight}
      </div>
      {open && <div className="px-2.5 pb-2.5 flex flex-col gap-2">{children}</div>}
    </div>
  );
}

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
    fontSize: 0.024,
    color: '#0b0e1d',
    useGradient: false,
    gradientFrom: '#ffb700',
    gradientTo: '#ff3df0',
    gradientAngle: 45,
  };
}

const DEFAULT_FOTO_ZONE = () => newZone('notched', 0.0742, 0.0334, 0.8509, 0.7963);
const DEFAULT_LOGO_ZONE = () => newZone('pill', 0.3168, 0.0274, 0.3663, 0.0321);

function defaultTextLayers(): CardTextLayer[] {
  return [
    newTextLayer('tier', newZone('trapezoid', 0.1531, 0.8362, 0.6939, 0.0459)),
    newTextLayer('categoria', newZone('none', 0.1531, 0.8821, 0.6939, 0.0459)),
  ];
}

/** The 1º/2º textos (tier/categoria) are permanent columns in the editor —
 * not part of a removable list — so "Restaurar" on either needs a single
 * default to fall back to, and the 3º (custom) needs one too for its own
 * restore/re-add. */
function defaultTextLayer(kind: CardTextKind): CardTextLayer {
  if (kind === 'custom') return newTextLayer('custom', newZone('none', 0.15, 0.05, 0.7, 0.06));
  const [tier, categoria] = defaultTextLayers();
  return kind === 'tier' ? tier : categoria;
}

/** Guarantees the 1º/2º textos are present (synthesizing whichever is
 * missing from its default) while preserving an existing 3º texto —
 * template rows saved before tier/categoria became permanent could in
 * theory be missing one. */
function ensureCoreTextLayers(layers: CardTextLayer[]): CardTextLayer[] {
  const tier = layers.find((l) => l.kind === 'tier') ?? defaultTextLayer('tier');
  const categoria = layers.find((l) => l.kind === 'categoria') ?? defaultTextLayer('categoria');
  const custom = layers.find((l) => l.kind === 'custom');
  return custom ? [tier, categoria, custom] : [tier, categoria];
}

function typographyPatch(l: CardTextLayer): Partial<CardTextLayer> {
  return {
    text: l.text,
    fontFamily: l.fontFamily,
    fontSize: l.fontSize,
    color: l.color,
    useGradient: l.useGradient,
    gradientFrom: l.gradientFrom,
    gradientTo: l.gradientTo,
    gradientAngle: l.gradientAngle,
  };
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
    logo: DEFAULT_LOGO_ZONE(),
    textLayers: ensureCoreTextLayers(defaultTextLayers()),
  };
}

// Undo/redo snapshots are coalesced within this window so dragging a range
// slider (which fires dozens of onChange events) produces one history step,
// not one per pixel of movement.
const HISTORY_DEBOUNCE_MS = 600;
const HISTORY_LIMIT = 50;

export function CardConquistaPage() {
  const { profile } = useAuth();
  const { data: store } = useStore();
  const { data: templates } = useConquistaCardTemplates();
  const saveTemplate = useSaveConquistaCardTemplate(profile?.store_id);
  const deleteTemplate = useDeleteConquistaCardTemplate();
  const setDefault = useSetDefaultConquistaCardTemplate(profile?.store_id);

  const [editing, setEditingRaw] = useState<EditorState | null>(null);
  const [history, setHistory] = useState<EditorState[]>([]);
  const [redoStack, setRedoStack] = useState<EditorState[]>([]);
  const lastPushRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return () => {
      if (editing?.referenceObjectUrl) URL.revokeObjectURL(editing.referenceObjectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetHistory() {
    setHistory([]);
    setRedoStack([]);
    lastPushRef.current = 0;
  }

  /** Replaces the editor state, pushing the previous one onto the undo
   * history — unless the last push was under HISTORY_DEBOUNCE_MS ago, so a
   * slider drag collapses into a single undo step. */
  function commitEdit(next: EditorState) {
    if (editing) {
      const now = Date.now();
      if (now - lastPushRef.current > HISTORY_DEBOUNCE_MS) {
        setHistory((h) => [...h.slice(-(HISTORY_LIMIT - 1)), editing]);
        setRedoStack([]);
      }
      lastPushRef.current = now;
    }
    setEditingRaw(next);
  }

  function undo() {
    if (!editing || history.length === 0) return;
    const prevState = history[history.length - 1];
    setHistory(history.slice(0, -1));
    setRedoStack([...redoStack, editing]);
    setEditingRaw(prevState);
    lastPushRef.current = 0;
  }

  function redo() {
    if (!editing || redoStack.length === 0) return;
    const nextState = redoStack[redoStack.length - 1];
    setRedoStack(redoStack.slice(0, -1));
    setHistory([...history, editing]);
    setEditingRaw(nextState);
    lastPushRef.current = 0;
  }

  function startNew() {
    setError(null);
    setEditingRaw(blankEditor());
    resetHistory();
  }

  function startEdit(t: ConquistaCardTemplateRow) {
    setError(null);
    const textLayers = ensureCoreTextLayers(
      t.textLayers && t.textLayers.length > 0 ? t.textLayers : synthesizeTextLayersFromLegacy(t.texto, t.textFontFamily),
    );
    setEditingRaw({
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
    resetHistory();
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
    setEditingRaw({
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
      textLayers: ensureCoreTextLayers(synthesizeTextLayersFromLegacy(BUILT_IN_TEMPLATE.texto, BUILT_IN_TEMPLATE.textFontFamily)),
    });
    resetHistory();
  }

  function closeEditor() {
    if (editing?.referenceObjectUrl) URL.revokeObjectURL(editing.referenceObjectUrl);
    setEditingRaw(null);
    setError(null);
    resetHistory();
  }

  async function handleBackgroundUpload(file: File) {
    if (!profile?.store_id || !editing) return;
    setEditingRaw({ ...editing, uploadingBackground: true });
    try {
      const url = await uploadConquistaCardBackground(profile.store_id, editing.id, file);
      setEditingRaw((ed) => (ed ? { ...ed, backgroundUrl: url, uploadingBackground: false } : ed));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao enviar o plano de fundo.');
      setEditingRaw((ed) => (ed ? { ...ed, uploadingBackground: false } : ed));
    }
  }

  async function handleLogoUpload(file: File) {
    if (!profile?.store_id || !editing) return;
    setEditingRaw({ ...editing, uploadingLogo: true });
    try {
      const url = await uploadConquistaCardLogo(profile.store_id, editing.id, file);
      setEditingRaw((ed) => (ed ? { ...ed, logoUrl: url, uploadingLogo: false } : ed));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao enviar a logo.');
      setEditingRaw((ed) => (ed ? { ...ed, uploadingLogo: false } : ed));
    }
  }

  function handleReferenceUpload(file: File) {
    if (!editing) return;
    if (editing.referenceObjectUrl) URL.revokeObjectURL(editing.referenceObjectUrl);
    setEditingRaw({ ...editing, referenceObjectUrl: URL.createObjectURL(file) });
  }

  function removeReference() {
    if (!editing?.referenceObjectUrl) return;
    URL.revokeObjectURL(editing.referenceObjectUrl);
    setEditingRaw({ ...editing, referenceObjectUrl: null });
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
          setEditing={commitEdit}
          logoUrl={store?.logo_url}
          saving={saving}
          onCancel={closeEditor}
          onSave={handleSave}
          onUploadBackground={handleBackgroundUpload}
          onUploadLogo={handleLogoUpload}
          onRemoveLogo={() => commitEdit({ ...editing, logoUrl: null })}
          onUploadReference={handleReferenceUpload}
          onRemoveReference={removeReference}
          onUndo={undo}
          onRedo={redo}
          canUndo={history.length > 0}
          canRedo={redoStack.length > 0}
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

/** Small solid-button pair every staged adjustment module ends with —
 * "Restaurar" resets that one module straight to its default (an
 * immediate commit, its own undo step), "Aplicar ajuste" commits whatever
 * is currently in that module's local slider draft. Disabling "Aplicar"
 * when the draft already matches what's committed avoids a no-op undo
 * step and signals nothing's pending. */
function ActionBar({ onRestore, onApply, applyDisabled }: { onRestore: () => void; onApply: () => void; applyDisabled?: boolean }) {
  return (
    <div className="flex gap-2 pt-1">
      <button
        onClick={onRestore}
        className="flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold"
        style={{ background: '#c2410c33', color: '#fdba74', border: '1px solid #c2410c' }}
      >
        Restaurar
      </button>
      <button
        onClick={onApply}
        disabled={applyDisabled}
        className="flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold disabled:opacity-40"
        style={{ background: '#f5a623', color: '#231a02' }}
      >
        Aplicar ajuste
      </button>
    </div>
  );
}

/** Outer shell for a "Configurações de texto N" column — a centered title
 * plus the property header (colored bullet + which text this is) above
 * whatever position/typography modules are passed as children. */
/** Header cell shared by every column of the central tools grid — just a
 * centered title for "Máscaras de imagens" (col 1), or a title plus the
 * colored-bullet property line ("1º texto — Nível...") for the two text
 * columns. Rendered as its own grid item (row 0) so all three column
 * headers sit on the exact same row regardless of how tall each is. */
function ColumnHeader({ title, propertyLabel, color }: { title: string; propertyLabel?: string; color?: string }) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <h4 className="text-center text-xs font-bold uppercase tracking-wide text-slate-300">{title}</h4>
      {propertyLabel && color && (
        <div className="flex items-center gap-2 px-1">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
          <span className="text-[11px] text-slate-400">{propertyLabel}</span>
        </div>
      )}
    </div>
  );
}

/** The "Tipografia e estilo" staged box every text layer (1º/2º/3º texto)
 * gets — font/size/color/gradient, staged via typeDraft, with its own
 * Restaurar/Aplicar ajuste pair. The "Posição e forma" box is just a
 * plain ZoneControls call at each call site (not wrapped here) so both
 * boxes can be placed as independent grid items — that's what lets the
 * central grid line the Máscaras column up with the two texto columns
 * row by row. `onRemove` only passed for the optional 3º texto. */
function TypographyBox({
  committed,
  color,
  typeDraft,
  onTypeDraftChange,
  onApplyType,
  onRestoreType,
  onRemove,
}: {
  committed: CardTextLayer;
  color: string;
  typeDraft: CardTextLayer;
  onTypeDraftChange: (l: CardTextLayer) => void;
  onApplyType: () => void;
  onRestoreType: () => void;
  onRemove?: () => void;
}) {
  const typeChanged = JSON.stringify(typographyPatch(typeDraft)) !== JSON.stringify(typographyPatch(committed));
  return (
      <CollapsibleBox
        title="Tipografia e estilo"
        colorDot={color}
        headerRight={
          onRemove ? (
            <button onClick={onRemove} className="text-[10px] text-slate-500 hover:text-rose-400 shrink-0">
              Remover
            </button>
          ) : undefined
        }
      >
        {typeDraft.kind === 'custom' && (
          <label className="text-[11px] text-slate-400">
            Texto
            <input
              value={typeDraft.text}
              onChange={(e) => onTypeDraftChange({ ...typeDraft, text: e.target.value })}
              className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-sm text-slate-100"
            />
          </label>
        )}

        <label className="text-[11px] text-slate-400">
          Fonte
          <select
            value={typeDraft.fontFamily}
            onChange={(e) => onTypeDraftChange({ ...typeDraft, fontFamily: e.target.value })}
            className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs text-slate-100"
            style={{ fontFamily: typeDraft.fontFamily }}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>
                {f}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[11px] text-slate-400">
          Tamanho do texto ({(Math.round((typeDraft.fontSize ?? 0.024) * 1000) / 10).toFixed(1)}%)
          <input
            type="range"
            min={10}
            max={60}
            value={Math.round((typeDraft.fontSize ?? 0.024) * 1000)}
            onChange={(e) => onTypeDraftChange({ ...typeDraft, fontSize: Number(e.target.value) / 1000 })}
            className="w-full"
          />
        </label>

        <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <input type="checkbox" checked={typeDraft.useGradient} onChange={(e) => onTypeDraftChange({ ...typeDraft, useGradient: e.target.checked })} />
          Degradê cores do texto
        </label>

        {!typeDraft.useGradient ? (
          <label className="text-[11px] text-slate-400 flex items-center gap-2">
            Cor do texto
            <input
              type="color"
              value={typeDraft.color}
              onChange={(e) => onTypeDraftChange({ ...typeDraft, color: e.target.value })}
              className="w-8 h-6 rounded border border-slate-700 bg-transparent"
            />
          </label>
        ) : (
          <>
            <div className="flex gap-4">
              <label className="text-[11px] text-slate-400 flex items-center gap-2">
                De
                <input
                  type="color"
                  value={typeDraft.gradientFrom}
                  onChange={(e) => onTypeDraftChange({ ...typeDraft, gradientFrom: e.target.value })}
                  className="w-8 h-6 rounded border border-slate-700 bg-transparent"
                />
              </label>
              <label className="text-[11px] text-slate-400 flex items-center gap-2">
                Para
                <input
                  type="color"
                  value={typeDraft.gradientTo}
                  onChange={(e) => onTypeDraftChange({ ...typeDraft, gradientTo: e.target.value })}
                  className="w-8 h-6 rounded border border-slate-700 bg-transparent"
                />
              </label>
            </div>
            <label className="text-[11px] text-slate-400">
              Orientação do degradê ({typeDraft.gradientAngle ?? 45}°)
              <input
                type="range"
                min={0}
                max={359}
                value={typeDraft.gradientAngle ?? 45}
                onChange={(e) => onTypeDraftChange({ ...typeDraft, gradientAngle: Number(e.target.value) })}
                className="w-full"
              />
            </label>
          </>
        )}

        <ActionBar onRestore={onRestoreType} onApply={onApplyType} applyDisabled={!typeChanged} />
      </CollapsibleBox>
  );
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
  onUndo,
  onRedo,
  canUndo,
  canRedo,
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
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Bounding box every drag/click coordinate on the preview is measured
  // against — the same element the wand/pen click math already uses via
  // e.currentTarget, but drag needs it independently since mousemove/mouseup
  // are tracked on `window`, not on that element.
  const previewBoxRef = useRef<HTMLDivElement>(null);
  // Freehand "pen" tool for the photo cutout: null = not drawing; an array
  // (possibly empty) = actively tracing, one point per click on the preview.
  const [penPoints, setPenPoints] = useState<{ x: number; y: number }[] | null>(null);
  // Magic-wand tool: which zone a click on the preview should feed a
  // flood-fill selection into. Mutually exclusive with the pen tool.
  const [wandTarget, setWandTarget] = useState<'foto' | 'logo' | null>(null);
  const [wandTolerance, setWandTolerance] = useState(32);
  const [wandBusy, setWandBusy] = useState(false);
  const [wandError, setWandError] = useState<string | null>(null);
  // Preview zoom is a single-step toggle (100% <-> 150%), not continuous —
  // matches the footer's "Aumentar/Diminuir zoom" being one-shot buttons.
  const [zoomed, setZoomed] = useState(false);

  // Every adjustment module (foto/logo masks, 1º/2º/3º texto) edits a local
  // draft here first — sliders write into the draft, which drives the
  // dashed outline overlays on the preview for live feedback, while the
  // actual rendered card (the canvas effect below) only reflects what's
  // been committed to `editing` via that module's own "Aplicar ajuste".
  // Each draft re-syncs from its committed source whenever that source
  // changes for any other reason (Aplicar/Restaurar itself, undo/redo, the
  // magic wand, the pen tool, "Restaurar tudo", or switching templates).
  const text1 = editing.textLayers.find((l) => l.kind === 'tier')!;
  const text2 = editing.textLayers.find((l) => l.kind === 'categoria')!;
  const text3 = editing.textLayers.find((l) => l.kind === 'custom') ?? null;

  const [fotoDraft, setFotoDraft] = useState<CardZone>(editing.foto);
  useEffect(() => setFotoDraft(editing.foto), [editing.foto]);
  const [logoDraft, setLogoDraft] = useState<CardZone>(editing.logo);
  useEffect(() => setLogoDraft(editing.logo), [editing.logo]);

  const [t1ZoneDraft, setT1ZoneDraft] = useState<CardZone>(text1.zone);
  useEffect(() => setT1ZoneDraft(text1.zone), [text1]);
  const [t1TypeDraft, setT1TypeDraft] = useState<CardTextLayer>(text1);
  useEffect(() => setT1TypeDraft(text1), [text1]);

  const [t2ZoneDraft, setT2ZoneDraft] = useState<CardZone>(text2.zone);
  useEffect(() => setT2ZoneDraft(text2.zone), [text2]);
  const [t2TypeDraft, setT2TypeDraft] = useState<CardTextLayer>(text2);
  useEffect(() => setT2TypeDraft(text2), [text2]);

  const [t3ZoneDraft, setT3ZoneDraft] = useState<CardZone | null>(text3?.zone ?? null);
  useEffect(() => setT3ZoneDraft(text3?.zone ?? null), [text3]);
  const [t3TypeDraft, setT3TypeDraft] = useState<CardTextLayer | null>(text3);
  useEffect(() => setT3TypeDraft(text3), [text3]);

  function updateTextLayer(id: string, patch: Partial<CardTextLayer>) {
    setEditing({ ...editing, textLayers: editing.textLayers.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  }

  function restoreAllTools() {
    setEditing({ ...editing, foto: DEFAULT_FOTO_ZONE(), logo: DEFAULT_LOGO_ZONE(), textLayers: defaultTextLayers() });
  }

  function addCustomText() {
    if (text3) return;
    setEditing({ ...editing, textLayers: [...editing.textLayers, defaultTextLayer('custom')] });
  }

  function removeCustomText() {
    setEditing({ ...editing, textLayers: editing.textLayers.filter((l) => l.kind !== 'custom') });
  }

  // Dragging a text layer directly on the preview — the X/Y sliders still
  // work (staged, via Aplicar ajuste), but a mouse drag is a more direct
  // gesture: it moves the zone live (same draft the sliders write into, so
  // the dashed outline tracks the cursor) and commits the instant the
  // mouse is released, no separate "Aplicar ajuste" click needed. While
  // dragging, the layer's own center is compared to the card's center —
  // within SNAP_THRESHOLD it locks onto exact 50%, with a cyan guide line
  // shown for whichever axis (or both) is currently snapped.
  const SNAP_THRESHOLD = 0.02;
  const [dragText, setDragText] = useState<{ kind: CardTextKind; startClientX: number; startClientY: number; startZone: CardZone } | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const dragZoneRef = useRef<CardZone | null>(null);

  useEffect(() => {
    if (!dragText) return;
    function zoneForEvent(e: MouseEvent): CardZone {
      const rect = previewBoxRef.current!.getBoundingClientRect();
      const { startClientX, startClientY, startZone } = dragText!;
      const w = startZone.w;
      const h = startZone.h;
      let x = startZone.x + (e.clientX - startClientX) / rect.width;
      let y = startZone.y + (e.clientY - startClientY) / rect.height;
      const snapX = Math.abs(x + w / 2 - 0.5) < SNAP_THRESHOLD;
      const snapY = Math.abs(y + h / 2 - 0.5) < SNAP_THRESHOLD;
      if (snapX) x = 0.5 - w / 2;
      if (snapY) y = 0.5 - h / 2;
      x = Math.max(0, Math.min(1, x));
      y = Math.max(0, Math.min(1, y));
      setSnapGuides({ x: snapX, y: snapY });
      return { ...startZone, x, y };
    }
    function onMove(e: MouseEvent) {
      const zone = zoneForEvent(e);
      dragZoneRef.current = zone;
      if (dragText!.kind === 'tier') setT1ZoneDraft(zone);
      else if (dragText!.kind === 'categoria') setT2ZoneDraft(zone);
      else setT3ZoneDraft(zone);
    }
    function onUp() {
      const zone = dragZoneRef.current ?? dragText!.startZone;
      if (dragText!.kind === 'tier') updateTextLayer(text1.id, { zone });
      else if (dragText!.kind === 'categoria') updateTextLayer(text2.id, { zone });
      else if (text3) updateTextLayer(text3.id, { zone });
      dragZoneRef.current = null;
      setDragText(null);
      setSnapGuides({ x: false, y: false });
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragText]);

  function startTextDrag(kind: CardTextKind, zone: CardZone) {
    return (e: ReactMouseEvent) => {
      if (penPoints !== null || wandTarget) return;
      e.preventDefault();
      e.stopPropagation();
      setDragText({ kind, startClientX: e.clientX, startClientY: e.clientY, startZone: zone });
    };
  }

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

  const previewCursor = penPoints !== null || wandTarget ? 'crosshair' : undefined;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col gap-4">
      {/* Faixa superior — identificação do modelo e uploads */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch">
        <div className="flex-1 min-w-0 rounded-lg border border-slate-800 px-3 py-2 flex items-center gap-2">
          <span className="text-[11px] text-slate-500 shrink-0">Nome do modelo</span>
          <input
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="Modelo sem nome"
            className="flex-1 min-w-0 bg-transparent text-sm text-slate-100 outline-none"
          />
        </div>

        <div className="flex-1 min-w-0 rounded-lg border border-slate-800 px-3 py-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500 truncate">Plano de fundo final (card)</span>
          <label className="shrink-0 cursor-pointer text-[11px] font-semibold px-2 py-1 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800">
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
            {editing.uploadingBackground ? 'Enviando…' : editing.backgroundUrl ? 'Substituir plano de fundo' : 'Carregar plano de fundo'}
          </label>
        </div>

        <div className="flex-1 min-w-0 rounded-lg border border-slate-800 px-3 py-2 flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500 truncate">Logo deste card (opcional)</span>
            <label className="shrink-0 cursor-pointer text-[11px] font-semibold px-2 py-1 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800">
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
              {editing.uploadingLogo ? 'Enviando…' : editing.logoUrl ? 'Substituir logo' : 'Carregar logo'}
            </label>
          </div>
          {editing.logoUrl && (
            <button onClick={onRemoveLogo} className="self-start text-[10px] text-slate-500 hover:text-rose-400">
              Usar a logo da loja
            </button>
          )}
        </div>

        <div className="sm:w-[190px] shrink-0 rounded-lg border border-slate-800 px-3 py-2">
          <label className="text-[10px] uppercase tracking-wide text-slate-500">Escala da logo ({Math.round(editing.logoScale * 100)}%)</label>
          <input
            type="range"
            min={30}
            max={150}
            value={Math.round(editing.logoScale * 100)}
            onChange={(e) => setEditing({ ...editing, logoScale: Number(e.target.value) / 100 })}
            className="w-full"
            style={{ accentColor: '#a855f7' }}
          />
        </div>
      </div>

      <CollapsibleBox title="Imagem de referência (só nesta tela, opcional)" defaultOpen={false}>
        <p className="text-[11px] text-slate-500">
          Carregue um print/rascunho para servir de guia enquanto você posiciona as formas abaixo (a varinha mágica e a caneta também
          traçam sobre ela quando presente). Ela nunca é salva — só o plano de fundo final acima é gravado.
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
      </CollapsibleBox>

      {/* Área central — colunas de controles alinhadas em grid + preview.
          Um único CSS grid (não 3 colunas flex independentes) para que o
          card de "Foto do colaborador" fique na mesma fileira que os dois
          cards de "Posição e forma" dos textos, "Logo da loja" na mesma
          fileira que os dois de "Tipografia", etc. — a ordem de saída dos
          itens abaixo segue exatamente a ordem de preenchimento do grid
          (fileira a fileira, da esquerda pra direita). */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          <ColumnHeader title="Máscaras de imagens" />
          <ColumnHeader title="Configurações de texto 1" propertyLabel={TEXT_KIND_LABEL.tier} color={TEXT_KIND_COLOR.tier} />
          <ColumnHeader title="Configurações de texto 2" propertyLabel={TEXT_KIND_LABEL.categoria} color={TEXT_KIND_COLOR.categoria} />

          <ZoneControls
            label={ZONE_LABELS.foto}
            color={ZONE_COLORS.foto}
            zone={fotoDraft}
            onChange={setFotoDraft}
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
          >
            <ActionBar
              onRestore={() => setEditing({ ...editing, foto: DEFAULT_FOTO_ZONE() })}
              onApply={() => setEditing({ ...editing, foto: fotoDraft })}
              applyDisabled={JSON.stringify(fotoDraft) === JSON.stringify(editing.foto)}
            />
          </ZoneControls>

          <ZoneControls label="Posição e forma (plano de fundo do texto)" color={TEXT_KIND_COLOR.tier} zone={t1ZoneDraft} onChange={setT1ZoneDraft}>
            <p className="text-[10px] text-slate-500">Dica: arraste a caixa tracejada direto na prévia pra mover — encaixa sozinho no centro.</p>
            <ActionBar
              onRestore={() => updateTextLayer(text1.id, { zone: defaultTextLayer('tier').zone })}
              onApply={() => updateTextLayer(text1.id, { zone: t1ZoneDraft })}
              applyDisabled={JSON.stringify(t1ZoneDraft) === JSON.stringify(text1.zone)}
            />
          </ZoneControls>

          <ZoneControls
            label="Posição e forma (plano de fundo do texto)"
            color={TEXT_KIND_COLOR.categoria}
            zone={t2ZoneDraft}
            onChange={setT2ZoneDraft}
          >
            <p className="text-[10px] text-slate-500">Dica: arraste a caixa tracejada direto na prévia pra mover — encaixa sozinho no centro.</p>
            <ActionBar
              onRestore={() => updateTextLayer(text2.id, { zone: defaultTextLayer('categoria').zone })}
              onApply={() => updateTextLayer(text2.id, { zone: t2ZoneDraft })}
              applyDisabled={JSON.stringify(t2ZoneDraft) === JSON.stringify(text2.zone)}
            />
          </ZoneControls>

          <ZoneControls
            label={ZONE_LABELS.logo}
            color={ZONE_COLORS.logo}
            zone={logoDraft}
            onChange={setLogoDraft}
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
              Redimensionamento proporcional geral ({Math.round(editing.logoScale * 100)}%)
              <input
                type="range"
                min={30}
                max={150}
                value={Math.round(editing.logoScale * 100)}
                onChange={(e) => setEditing({ ...editing, logoScale: Number(e.target.value) / 100 })}
                className="w-full"
                style={{ accentColor: '#a855f7' }}
              />
            </label>
            <ActionBar
              onRestore={() => setEditing({ ...editing, logo: DEFAULT_LOGO_ZONE() })}
              onApply={() => setEditing({ ...editing, logo: logoDraft })}
              applyDisabled={JSON.stringify(logoDraft) === JSON.stringify(editing.logo)}
            />
          </ZoneControls>

          <TypographyBox
            committed={text1}
            color={TEXT_KIND_COLOR.tier}
            typeDraft={t1TypeDraft}
            onTypeDraftChange={setT1TypeDraft}
            onApplyType={() => updateTextLayer(text1.id, typographyPatch(t1TypeDraft))}
            onRestoreType={() => updateTextLayer(text1.id, typographyPatch(defaultTextLayer('tier')))}
          />

          <TypographyBox
            committed={text2}
            color={TEXT_KIND_COLOR.categoria}
            typeDraft={t2TypeDraft}
            onTypeDraftChange={setT2TypeDraft}
            onApplyType={() => updateTextLayer(text2.id, typographyPatch(t2TypeDraft))}
            onRestoreType={() => updateTextLayer(text2.id, typographyPatch(defaultTextLayer('categoria')))}
          />

          {text3 && t3ZoneDraft ? (
            <ZoneControls label="Posição e forma (plano de fundo do texto)" color={TEXT_KIND_COLOR.custom} zone={t3ZoneDraft} onChange={setT3ZoneDraft}>
              <p className="text-[10px] text-slate-500">Dica: arraste a caixa tracejada direto na prévia pra mover — encaixa sozinho no centro.</p>
              <ActionBar
                onRestore={() => updateTextLayer(text3.id, { zone: defaultTextLayer('custom').zone })}
                onApply={() => updateTextLayer(text3.id, { zone: t3ZoneDraft })}
                applyDisabled={JSON.stringify(t3ZoneDraft) === JSON.stringify(text3.zone)}
              />
            </ZoneControls>
          ) : (
            <button onClick={addCustomText} className="rounded-lg border border-slate-700 px-2 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800 h-fit">
              + Adicionar 3º texto (opcional, texto livre)
            </button>
          )}
          <div />
          <div />

          {text3 && t3TypeDraft && (
            <>
              <TypographyBox
                committed={text3}
                color={TEXT_KIND_COLOR.custom}
                typeDraft={t3TypeDraft}
                onTypeDraftChange={setT3TypeDraft}
                onApplyType={() => updateTextLayer(text3.id, typographyPatch(t3TypeDraft))}
                onRestoreType={() => updateTextLayer(text3.id, typographyPatch(defaultTextLayer('custom')))}
                onRemove={removeCustomText}
              />
              <div />
              <div />
            </>
          )}
        </div>

        <div className="flex flex-col items-center gap-2">
          <div
            className="relative w-full max-w-[420px]"
            style={{ overflow: zoomed ? 'auto' : 'visible', maxHeight: zoomed ? 620 : undefined, borderRadius: 12 }}
          >
            <div style={{ transform: zoomed ? 'scale(1.5)' : 'scale(1)', transformOrigin: 'top center', transition: 'transform .15s ease' }}>
              <div className="relative" ref={previewBoxRef} onClick={handlePreviewClick} style={{ cursor: previewCursor }}>
                <canvas ref={canvasRef} className="w-full h-auto block rounded-xl" />
                {editing.referenceObjectUrl && (
                  <img
                    src={editing.referenceObjectUrl}
                    alt=""
                    className="absolute inset-0 w-full h-full object-fill rounded-xl pointer-events-none"
                    style={{ opacity: 0.45 }}
                  />
                )}
                {fotoDraft.shape.kind !== 'polygon' && <ZoneOutline zone={fotoDraft} color={ZONE_COLORS.foto} />}
                <ZoneOutline zone={logoDraft} color={ZONE_COLORS.logo} />
                <ZoneOutline zone={t1ZoneDraft} color={TEXT_KIND_COLOR.tier} onMouseDown={startTextDrag('tier', t1ZoneDraft)} />
                <ZoneOutline zone={t2ZoneDraft} color={TEXT_KIND_COLOR.categoria} onMouseDown={startTextDrag('categoria', t2ZoneDraft)} />
                {t3ZoneDraft && <ZoneOutline zone={t3ZoneDraft} color={TEXT_KIND_COLOR.custom} onMouseDown={startTextDrag('custom', t3ZoneDraft)} />}
                {editing.foto.shape.kind === 'polygon' && penPoints === null && (
                  <PolygonOutline points={editing.foto.shape.points ?? []} color={ZONE_COLORS.foto} />
                )}
                {penPoints !== null && <PolygonOutline points={penPoints} color={ZONE_COLORS.foto} inProgress />}
                {dragText && snapGuides.x && (
                  <div
                    className="absolute top-0 bottom-0 pointer-events-none"
                    style={{ left: '50%', width: 1, background: '#22d3ee', boxShadow: '0 0 6px #22d3ee' }}
                  />
                )}
                {dragText && snapGuides.y && (
                  <div
                    className="absolute left-0 right-0 pointer-events-none"
                    style={{ top: '50%', height: 1, background: '#22d3ee', boxShadow: '0 0 6px #22d3ee' }}
                  />
                )}
              </div>
            </div>
          </div>
          {penPoints !== null && (
            <p className="text-[11px] text-amber-400">
              Clique na imagem para marcar os pontos do recorte da foto ({penPoints.length} até agora — mínimo 3, depois clique em
              "Concluir forma" na coluna ao lado).
            </p>
          )}
          {wandTarget && (
            <p className="text-[11px] text-amber-400">
              {wandBusy ? 'Detectando…' : `Clique na imagem sobre a área da ${wandTarget === 'foto' ? 'foto' : 'logo'} para detectá-la automaticamente.`}
            </p>
          )}
          {dragText && (
            <p className="text-[11px] text-cyan-400">
              Arrastando o texto — solte pra aplicar a nova posição. {(snapGuides.x || snapGuides.y) && 'Encaixado no centro.'}
            </p>
          )}
        </div>
      </div>

      {/* Rodapé — utilitários globais, histórico e finalização */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
        <button
          onClick={restoreAllTools}
          className="rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wide"
          style={{ background: '#f5a623', color: '#231a02' }}
        >
          Restaurar tudo
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setZoomed(true)}
            disabled={zoomed}
            className="rounded-full border border-slate-700 px-3 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          >
            🔍+ Aumentar zoom
          </button>
          <button
            onClick={() => setZoomed(false)}
            disabled={!zoomed}
            className="rounded-full border border-slate-700 px-3 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          >
            🔍− Diminuir zoom
          </button>
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="rounded-full border border-slate-700 px-3 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          >
            ↶ Voltar uma etapa
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="rounded-full border border-slate-700 px-3 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          >
            Avançar uma etapa ↷
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wide disabled:opacity-50"
            style={{ background: '#14ff00', color: '#04210a' }}
          >
            {saving ? 'Salvando…' : 'Salvar modelo'}
          </button>
          <button onClick={onCancel} className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800">
            Cancelar
          </button>
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

/** `onMouseDown` (only passed for the draggable text zones) turns this
 * from a purely visual indicator into a grab handle: enables pointer
 * events and a move cursor so the outline itself can be dragged directly
 * on the preview, instead of only through the X/Y sliders. */
function ZoneOutline({ zone, color, onMouseDown }: { zone: CardZone; color: string; onMouseDown?: (e: ReactMouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="absolute"
      style={{
        left: `${zone.x * 100}%`,
        top: `${zone.y * 100}%`,
        width: `${zone.w * 100}%`,
        height: `${zone.h * 100}%`,
        border: `2px dashed ${color}`,
        borderRadius: zone.shape.kind === 'circle' || zone.shape.kind === 'pill' ? '999px' : 6,
        pointerEvents: onMouseDown ? 'auto' : 'none',
        cursor: onMouseDown ? 'move' : undefined,
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
    <CollapsibleBox title={label} colorDot={color}>
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
    </CollapsibleBox>
  );
}
