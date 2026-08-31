import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import {
  BUILT_IN_TEMPLATE,
  renderConquistaCard,
  type CardZone,
  type CardZoneShapeKind,
  type ConquistaCardTemplate,
} from '../../lib/conquistaCardRender';
import {
  useDeleteConquistaCardTemplate,
  useSaveConquistaCardTemplate,
  useSetDefaultConquistaCardTemplate,
} from '../../lib/mutations';
import { useConquistaCardTemplates, useStore, type ConquistaCardTemplateRow } from '../../lib/queries';
import { uploadConquistaCardBackground } from '../../lib/storage';
import type { Json } from '../../types/database';

// Manual configuration tool for Galeria de Conquistas card templates. Each
// template's photo/logo/tier-banner zones are built from shape primitives
// (not raster masks) so the admin can manipulate them with shape/scale/
// position controls, matching the request in full: mask-building tools,
// scale, position, an optional reference image used only for on-screen
// alignment (never persisted — it's a local object URL, discarded on save
// or when the editor closes), and a gallery to create/edit/delete templates
// and mark one as the default the live cards render with.

const SHAPE_OPTIONS: { value: CardZoneShapeKind; label: string }[] = [
  { value: 'circle', label: 'Círculo' },
  { value: 'roundedRect', label: 'Retângulo arredondado' },
  { value: 'pill', label: 'Cápsula (pílula)' },
  { value: 'trapezoid', label: 'Trapézio (faixa)' },
  { value: 'notched', label: 'Cantos cortados (cartão)' },
];

const ZONE_COLORS = { foto: '#00f0ff', logo: '#ffb700', texto: '#ff3df0' } as const;
const ZONE_LABELS = { foto: 'Foto do colaborador', logo: 'Logo da loja', texto: 'Faixa de texto (nível)' } as const;

interface EditorState {
  id: string;
  isNew: boolean;
  name: string;
  backgroundUrl: string | null;
  uploadingBackground: boolean;
  referenceObjectUrl: string | null;
  foto: CardZone;
  logo: CardZone;
  texto: CardZone;
}

function newZone(shape: CardZoneShapeKind, x: number, y: number, w: number, h: number): CardZone {
  return { shape: { kind: shape }, x, y, w, h };
}

function blankEditor(): EditorState {
  return {
    id: crypto.randomUUID(),
    isNew: true,
    name: '',
    backgroundUrl: null,
    uploadingBackground: false,
    referenceObjectUrl: null,
    foto: newZone('notched', 0.0742, 0.0334, 0.8509, 0.7963),
    logo: newZone('pill', 0.3168, 0.0274, 0.3663, 0.0321),
    texto: newZone('trapezoid', 0.1531, 0.8362, 0.6939, 0.0917),
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
    setEditing({
      id: t.id,
      isNew: false,
      name: t.name,
      backgroundUrl: t.backgroundUrl,
      uploadingBackground: false,
      referenceObjectUrl: null,
      foto: t.foto,
      logo: t.logo,
      texto: t.texto,
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
        foto: editing.foto as unknown as Json,
        logo: editing.logo as unknown as Json,
        texto: editing.texto as unknown as Json,
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
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-1">Modelos de Card — Galeria de Conquistas</h3>
        <p className="text-xs text-slate-500">
          Crie modelos visuais para o card de conquista: monte as máscaras da foto, da logo e da faixa de nível escolhendo uma forma e
          ajustando escala e posição. A imagem de referência é usada apenas para alinhar na tela e nunca é salva — só o plano de fundo
          final enviado é gravado.
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
    renderConquistaCard(template, { photoUrl: null, logoUrl: logoUrl ?? null, tierText: 'EXEMPLO 3K', color: '#ffb700' }).then((rendered) => {
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
  onUploadReference: (file: File) => void;
  onRemoveReference: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewTemplate: ConquistaCardTemplate = {
    id: editing.id,
    name: editing.name,
    backgroundUrl: editing.backgroundUrl ?? BUILT_IN_TEMPLATE.backgroundUrl,
    foto: editing.foto,
    logo: editing.logo,
    texto: editing.texto,
  };

  useEffect(() => {
    let active = true;
    renderConquistaCard(previewTemplate, { photoUrl: null, logoUrl: logoUrl ?? null, tierText: 'EXEMPLO 3K', color: '#ffb700' }).then((rendered) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing.backgroundUrl, editing.foto, editing.logo, editing.texto, logoUrl]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col lg:flex-row gap-5">
      <div className="flex flex-col gap-3 lg:w-[340px] shrink-0">
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
          <div className="text-xs font-semibold text-slate-300">Imagem de referência (só nesta tela)</div>
          <p className="text-[11px] text-slate-500">
            Carregue um print/rascunho para servir de guia enquanto você posiciona as formas abaixo. Ela nunca é salva — some ao trocar
            ou ao sair da edição.
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

        <ZoneControls label={ZONE_LABELS.foto} color={ZONE_COLORS.foto} zone={editing.foto} onChange={(z) => setEditing({ ...editing, foto: z })} />
        <ZoneControls label={ZONE_LABELS.logo} color={ZONE_COLORS.logo} zone={editing.logo} onChange={(z) => setEditing({ ...editing, logo: z })} />
        <ZoneControls label={ZONE_LABELS.texto} color={ZONE_COLORS.texto} zone={editing.texto} onChange={(z) => setEditing({ ...editing, texto: z })} />

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
          <canvas ref={canvasRef} className="w-full h-auto block rounded-xl" />
          {editing.referenceObjectUrl && (
            <img
              src={editing.referenceObjectUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-fill rounded-xl pointer-events-none"
              style={{ opacity: 0.45 }}
            />
          )}
          <ZoneOutline zone={editing.foto} color={ZONE_COLORS.foto} />
          <ZoneOutline zone={editing.logo} color={ZONE_COLORS.logo} />
          <ZoneOutline zone={editing.texto} color={ZONE_COLORS.texto} />
        </div>
      </div>
    </div>
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

function ZoneControls({ label, color, zone, onChange }: { label: string; color: string; zone: CardZone; onChange: (z: CardZone) => void }) {
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

      <label className="text-[11px] text-slate-400">
        Forma
        <select
          value={zone.shape.kind}
          onChange={(e) => onChange({ ...zone, shape: { kind: e.target.value as CardZoneShapeKind } })}
          className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-1 text-xs text-slate-100"
        >
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
    </div>
  );
}
