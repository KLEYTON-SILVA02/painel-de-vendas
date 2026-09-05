import { useEffect, useRef, useState } from 'react';
import { PageLoading } from '../../components/PageLoading';
import { useAuth } from '../../auth/AuthContext';
import type { BioWeights } from '../../lib/business/types';
import type { Json } from '../../types/database';
import { monthName } from '../../lib/format';
import { monthFirstISO, monthLastISO } from '../../lib/dateRange';
import {
  useAddSpecialListProduct,
  useBulkDeleteTable,
  useDeleteSpecialListProduct,
  useUpdateBioWeights,
  useUpdateStoreSettings,
  type BulkDeletableTable,
} from '../../lib/mutations';
import { countRowsInRange, useSpecialListRows, useStoreSettings } from '../../lib/queries';
import { uploadRankingPodiumBackground } from '../../lib/storage';
import podiumPremiumBg from '../../assets/ranking/podium-premium-bg.jpg';
import {
  DEFAULT_PODIUM_SPOTS,
  PODIUM_BG_RATIO,
  type PodiumRankSpot,
  type PodiumSpots,
} from '../../components/ranking/PodiumSplit';

// Keyword lists only ever render a bounded page at a time — a store that's
// accumulated hundreds/thousands of Levmel/Chip keywords over time (bulk
// imports, years of manual additions, never pruned) would otherwise render
// every single one as its own DOM node + click handler on every load of
// this screen, which is real, avoidable jank for no benefit (an ADM
// reviewing this list isn't scanning all of them at once anyway).
const KEYWORD_PAGE_SIZE = 100;

export function ConfiguracoesPage() {
  const { profile } = useAuth();
  const { data: rows } = useSpecialListRows();
  const { data: storeSettings } = useStoreSettings();
  const addProduct = useAddSpecialListProduct(profile?.store_id);
  const deleteProduct = useDeleteSpecialListProduct();
  const updateWeights = useUpdateBioWeights(profile?.store_id);

  const [levmelInput, setLevmelInput] = useState('');
  const [chipInput, setChipInput] = useState('');
  const [weights, setWeights] = useState<BioWeights | null>(null);
  const [saving, setSaving] = useState(false);
  const [levmelShown, setLevmelShown] = useState(KEYWORD_PAGE_SIZE);
  const [chipShown, setChipShown] = useState(KEYWORD_PAGE_SIZE);

  if (!rows || !storeSettings) return <PageLoading />;
  const currentWeights = weights ?? (storeSettings.bio_weights as unknown as BioWeights);
  const levmel = rows.filter((r) => r.tipo === 'levmel');
  const chip = rows.filter((r) => r.tipo === 'chip');

  async function handleSave() {
    setSaving(true);
    try {
      await updateWeights.mutateAsync(currentWeights);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-purple-400 font-semibold mb-1">🎯 Filtros especiais do Ranking — Levmel &amp; Chip</h3>
        <p className="text-xs text-slate-500 mb-3">
          Cadastre os produtos que cada botão de filtro rápido do Ranking deve identificar na lista de vendas.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Produtos "Levmel"</label>
            <div className="flex gap-2">
              <input value={levmelInput} onChange={(e) => setLevmelInput(e.target.value)} placeholder="nome do produto" className="input flex-1" />
              <button
                onClick={() => {
                  if (!levmelInput.trim()) return;
                  addProduct.mutate({ tipo: 'levmel', nome: levmelInput.trim() });
                  setLevmelInput('');
                }}
                className="rounded-md bg-amber-500 text-slate-950 px-3 py-1.5 text-xs font-medium"
              >
                + Add
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {levmel.length === 0 ? (
                <span className="text-xs text-slate-500">Nenhum produto cadastrado.</span>
              ) : (
                levmel.slice(0, levmelShown).map((p) => (
                  <span key={p.id} className="text-xs bg-slate-800 rounded-full px-2 py-1 flex items-center gap-1.5">
                    {p.nome}
                    <button onClick={() => deleteProduct.mutate(p.id)} className="text-slate-500 hover:text-rose-400">
                      ✕
                    </button>
                  </span>
                ))
              )}
              {levmel.length > levmelShown && (
                <button
                  onClick={() => setLevmelShown((n) => n + KEYWORD_PAGE_SIZE)}
                  className="text-xs text-cyan-400 rounded-full px-2 py-1 border border-cyan-800"
                >
                  Mostrar mais ({levmel.length - levmelShown})
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Produtos "Chip"</label>
            <div className="flex gap-2">
              <input value={chipInput} onChange={(e) => setChipInput(e.target.value)} placeholder="nome do produto" className="input flex-1" />
              <button
                onClick={() => {
                  if (!chipInput.trim()) return;
                  addProduct.mutate({ tipo: 'chip', nome: chipInput.trim() });
                  setChipInput('');
                }}
                className="rounded-md bg-amber-500 text-slate-950 px-3 py-1.5 text-xs font-medium"
              >
                + Add
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {chip.length === 0 ? (
                <span className="text-xs text-slate-500">Nenhum produto cadastrado.</span>
              ) : (
                chip.slice(0, chipShown).map((p) => (
                  <span key={p.id} className="text-xs bg-slate-800 rounded-full px-2 py-1 flex items-center gap-1.5">
                    {p.nome}
                    <button onClick={() => deleteProduct.mutate(p.id)} className="text-slate-500 hover:text-rose-400">
                      ✕
                    </button>
                  </span>
                ))
              )}
              {chip.length > chipShown && (
                <button
                  onClick={() => setChipShown((n) => n + KEYWORD_PAGE_SIZE)}
                  className="text-xs text-cyan-400 rounded-full px-2 py-1 border border-cyan-800"
                >
                  Mostrar mais ({chip.length - chipShown})
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-green-400 font-semibold mb-1">🧪 Pesos da BIOSINTÉTICA</h3>
        <p className="text-xs text-slate-500 mb-3">Pontos ganhos por item vendido em cada grupo.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(['G1', 'G2', 'G3', 'G4'] as const).map((g) => (
            <div key={g}>
              <label className="block text-xs text-slate-400 mb-1">{g}</label>
              <input
                type="number"
                step="0.1"
                value={currentWeights[g]}
                onChange={(e) => setWeights({ ...currentWeights, [g]: Number(e.target.value) })}
                className="input"
              />
            </div>
          ))}
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} className="self-start rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm disabled:opacity-50">
        {saving ? 'Salvando…' : 'Salvar configurações'}
      </button>

      <RankingAppearanceCard />

      <DangerZoneCard />
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

const RANK_LABELS = ['1º lugar', '2º lugar', '3º lugar'] as const;

type DragMode =
  | { kind: 'circle-move'; rank: 0 | 1 | 2 }
  | { kind: 'circle-resize'; rank: 0 | 1 | 2 }
  | { kind: 'text-move'; rank: 0 | 1 | 2; field: 'value' | 'nome' };

/** "Varinha mágica" — Configurações → calibração do pódio do Ranking Geral:
 * upload de um fundo próprio (ou uso do padrão) e marcadores arrastáveis
 * sobre a prévia para posicionar o círculo da foto (arraste a alcinha para
 * redimensionar) e o texto de valor/nome de cada colocação, sem depender
 * das coordenadas fixas medidas na arte padrão em PodiumSplit.tsx. Salva em
 * store_settings.ranking_podium_bg_url/ranking_podium_spots — ambos nulos
 * mantém o comportamento atual (arte e posições padrão). */
function RankingAppearanceCard() {
  const { profile } = useAuth();
  const { data: storeSettings } = useStoreSettings();
  const updateSettings = useUpdateStoreSettings(profile?.store_id);
  const containerRef = useRef<HTMLDivElement>(null);

  const [draftBgUrl, setDraftBgUrl] = useState<string | null | undefined>(undefined);
  const [draftSpots, setDraftSpots] = useState<PodiumSpots | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [activeRank, setActiveRank] = useState<0 | 1 | 2>(0);
  const [drag, setDrag] = useState<DragMode | null>(null);

  useEffect(() => {
    if (!drag) return;
    function onMove(e: PointerEvent) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || !drag) return;
      const xPct = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
      const yPct = clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100);
      setDraftSpots((prev) => {
        if (!prev) return prev;
        const spot = { ...prev[drag.rank] };
        if (drag.kind === 'circle-move') {
          spot.left = xPct;
          spot.top = yPct;
        } else if (drag.kind === 'circle-resize') {
          const centerXpx = rect.left + (spot.left / 100) * rect.width;
          const diameterPx = Math.abs(e.clientX - centerXpx) * 2;
          spot.diameter = clamp((diameterPx / rect.width) * 100, 4, 45);
        } else if (drag.field === 'value') {
          spot.valueLeft = xPct;
          spot.valueTop = yPct;
        } else {
          spot.nomeLeft = xPct;
          spot.nomeTop = yPct;
        }
        return { ...prev, [drag.rank]: spot };
      });
    }
    function onUp() {
      setDrag(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag]);

  if (!storeSettings) return null;

  const bgUrl = draftBgUrl !== undefined ? draftBgUrl : storeSettings.ranking_podium_bg_url;
  const spots = draftSpots ?? (storeSettings.ranking_podium_spots as unknown as PodiumSpots | null) ?? DEFAULT_PODIUM_SPOTS;
  const effectiveBg = bgUrl || podiumPremiumBg;

  function startDrag(mode: DragMode) {
    return (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDraftSpots((prev) => prev ?? spots);
      setDrag(mode);
    };
  }

  function updateActiveSpot(patch: Partial<PodiumRankSpot>) {
    setDraftSpots((prev) => {
      const base = prev ?? spots;
      return { ...base, [activeRank]: { ...base[activeRank], ...patch } };
    });
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile?.store_id) return;
    setUploading(true);
    try {
      const url = await uploadRankingPodiumBackground(profile.store_id, file);
      setDraftBgUrl(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao enviar imagem.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function handleReset() {
    setDraftBgUrl(null);
    setDraftSpots(DEFAULT_PODIUM_SPOTS);
  }

  async function handleSave() {
    setSaving(true);
    setSavedFlash(false);
    try {
      await updateSettings.mutateAsync({
        ranking_podium_bg_url: bgUrl ?? null,
        ranking_podium_spots: spots as unknown as Json,
      });
      setDraftBgUrl(undefined);
      setDraftSpots(null);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="text-cyan-400 font-semibold mb-1">🪄 Aparência do Ranking</h3>
      <p className="text-xs text-slate-500 mb-3">
        Envie uma imagem de fundo própria para o pódio do Ranking Geral e arraste os marcadores para posicionar o
        círculo da foto de cada colocação (arraste a alcinha azul para redimensionar) e o texto de valor/nome. Use as
        abas abaixo para trocar entre 1º, 2º e 3º lugar.
      </p>

      <div className="flex gap-2 mb-2">
        {RANK_LABELS.map((label, i) => (
          <button
            key={label}
            onClick={() => setActiveRank(i as 0 | 1 | 2)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              activeRank === i ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 420,
          aspectRatio: PODIUM_BG_RATIO,
          backgroundImage: `url(${effectiveBg})`,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          borderRadius: 12,
          border: '1px solid #334155',
          touchAction: 'none',
        }}
      >
        {([0, 1, 2] as const).map((rank) => {
          const spot = spots[rank];
          const active = rank === activeRank;
          return (
            <div key={rank}>
              <div
                onPointerDown={active ? startDrag({ kind: 'circle-move', rank }) : undefined}
                style={{
                  position: 'absolute',
                  left: `${spot.left}%`,
                  top: `${spot.top}%`,
                  width: `${spot.diameter}%`,
                  aspectRatio: '1/1',
                  transform: 'translate(-50%,-50%)',
                  borderRadius: '50%',
                  border: `2px ${active ? 'solid #22d3ee' : 'dashed rgba(255,255,255,.4)'}`,
                  background: active ? 'rgba(34,211,238,.15)' : 'transparent',
                  cursor: active ? 'move' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: 10, color: '#fff', fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,.8)' }}>{rank + 1}º</span>
                {active && (
                  <div
                    onPointerDown={startDrag({ kind: 'circle-resize', rank })}
                    style={{
                      position: 'absolute',
                      right: -6,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: '#22d3ee',
                      border: '2px solid #0f172a',
                      cursor: 'ew-resize',
                    }}
                  />
                )}
              </div>

              <div
                onPointerDown={active ? startDrag({ kind: 'text-move', rank, field: 'value' }) : undefined}
                style={{
                  position: 'absolute',
                  left: `${spot.valueLeft}%`,
                  top: `${spot.valueTop}%`,
                  transform: 'translate(-50%,-50%)',
                  fontSize: 10,
                  fontWeight: 700,
                  color: active ? '#22d3ee' : 'rgba(255,255,255,.5)',
                  background: 'rgba(15,23,42,.7)',
                  borderRadius: 4,
                  padding: '1px 4px',
                  cursor: active ? 'move' : 'default',
                  whiteSpace: 'nowrap',
                }}
              >
                Valor
              </div>

              <div
                onPointerDown={active ? startDrag({ kind: 'text-move', rank, field: 'nome' }) : undefined}
                style={{
                  position: 'absolute',
                  left: `${spot.nomeLeft}%`,
                  top: `${spot.nomeTop}%`,
                  transform: 'translate(-50%,-50%)',
                  fontSize: 10,
                  fontWeight: 700,
                  color: active ? '#facc15' : 'rgba(255,255,255,.5)',
                  background: 'rgba(15,23,42,.7)',
                  borderRadius: 4,
                  padding: '1px 4px',
                  cursor: active ? 'move' : 'default',
                  whiteSpace: 'nowrap',
                }}
              >
                Nome
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs text-slate-400 max-w-md mt-3">
        <label>
          Tamanho do valor
          <input
            type="range"
            min={2}
            max={7}
            step={0.1}
            value={spots[activeRank].valueSize}
            onChange={(e) => updateActiveSpot({ valueSize: Number(e.target.value) })}
            className="w-full"
          />
        </label>
        <label>
          Largura do valor
          <input
            type="range"
            min={10}
            max={45}
            step={1}
            value={spots[activeRank].valueMaxWidth}
            onChange={(e) => updateActiveSpot({ valueMaxWidth: Number(e.target.value) })}
            className="w-full"
          />
        </label>
        <label>
          Tamanho do nome
          <input
            type="range"
            min={1.5}
            max={5}
            step={0.1}
            value={spots[activeRank].nomeSize}
            onChange={(e) => updateActiveSpot({ nomeSize: Number(e.target.value) })}
            className="w-full"
          />
        </label>
        <label>
          Largura do nome
          <input
            type="range"
            min={10}
            max={35}
            step={1}
            value={spots[activeRank].nomeMaxWidth}
            onChange={(e) => updateActiveSpot({ nomeMaxWidth: Number(e.target.value) })}
            className="w-full"
          />
        </label>
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-3">
        <label className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer">
          {uploading ? 'Enviando…' : '🖼️ Enviar imagem de fundo'}
          <input type="file" accept="image/*" hidden onChange={handleUpload} disabled={uploading} />
        </label>
        <button onClick={handleReset} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
          ↩️ Restaurar padrão
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-1.5 text-xs disabled:opacity-50"
        >
          {saving ? 'Salvando…' : '💾 Salvar calibração'}
        </button>
        {savedFlash && <span className="text-xs text-emerald-400">Calibração salva!</span>}
      </div>
    </div>
  );
}

const DELETE_TARGETS: { key: BulkDeletableTable; label: string; supportsMonth: boolean }[] = [
  { key: 'sales', label: 'Vendas', supportsMonth: true },
  { key: 'products', label: 'Produtos', supportsMonth: false },
  { key: 'collaborators', label: 'Colaboradores', supportsMonth: false },
  { key: 'goals', label: 'Metas', supportsMonth: false },
  { key: 'dynamics', label: 'Dinâmicas', supportsMonth: false },
];

/** Destructive-action card: pick a data type (and, for Vendas, a month) and
 * permanently delete the matching rows. Every other admin bulk-delete in
 * the app only ever removes a small, explicitly-selected set of rows; this
 * one can wipe an entire category, so it always shows an exact row count
 * before asking for confirmation. */
function DangerZoneCard() {
  const now = new Date();
  const [target, setTarget] = useState<BulkDeletableTable>('sales');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [allPeriods, setAllPeriods] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const bulkDelete = useBulkDeleteTable(target, target);

  const targetInfo = DELETE_TARGETS.find((t) => t.key === target)!;
  const scoped = targetInfo.supportsMonth && !allPeriods;
  const from = scoped ? monthFirstISO(year, month) : undefined;
  const to = scoped ? monthLastISO(year, month) : undefined;

  function resetPreview() {
    setPreviewCount(null);
    setResult(null);
  }

  async function handleCheck() {
    setChecking(true);
    setResult(null);
    try {
      const count = await countRowsInRange(target, targetInfo.supportsMonth ? 'data_iso' : undefined, from, to);
      setPreviewCount(count);
    } catch (e) {
      setResult(e instanceof Error ? e.message : 'Falha ao verificar.');
    } finally {
      setChecking(false);
    }
  }

  async function handleDelete() {
    if (previewCount === null) {
      await handleCheck();
      return;
    }
    if (previewCount === 0) {
      setResult('Nada para excluir.');
      return;
    }
    const periodo = scoped ? ` de ${monthName(month)}/${year}` : '';
    const ok = window.confirm(`Excluir ${previewCount} registro(s) de ${targetInfo.label}${periodo}? Essa ação não pode ser desfeita.`);
    if (!ok) return;
    setDeleting(true);
    setResult(null);
    try {
      const deletedCount = await bulkDelete.mutateAsync({ dateColumn: targetInfo.supportsMonth ? 'data_iso' : undefined, from, to });
      setResult(`${deletedCount} registro(s) excluído(s).`);
      setPreviewCount(null);
    } catch (e) {
      setResult(e instanceof Error ? e.message : 'Falha ao excluir.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-rose-900/60 bg-rose-950/10 p-4">
      <h3 className="text-rose-400 font-semibold mb-1">⚠️ Excluir dados</h3>
      <p className="text-xs text-slate-500 mb-3">
        Remove permanentemente dados salvos no sistema — vendas, produtos, colaboradores, metas e dinâmicas. Verifique a
        quantidade antes de confirmar; não é possível desfazer.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3 max-w-xl">
        <label className="text-xs text-slate-400">
          Tipo de dado
          <select
            value={target}
            onChange={(e) => {
              setTarget(e.target.value as BulkDeletableTable);
              resetPreview();
            }}
            className="input mt-1"
          >
            {DELETE_TARGETS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {targetInfo.supportsMonth && (
          <>
            <label className="text-xs text-slate-400">
              Mês
              <select
                disabled={allPeriods}
                value={month}
                onChange={(e) => {
                  setMonth(Number(e.target.value));
                  resetPreview();
                }}
                className="input mt-1 disabled:opacity-50"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i}>
                    {monthName(i)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-400">
              Ano
              <input
                type="number"
                disabled={allPeriods}
                value={year}
                onChange={(e) => {
                  setYear(Number(e.target.value));
                  resetPreview();
                }}
                className="input mt-1 disabled:opacity-50"
              />
            </label>
          </>
        )}
      </div>

      {targetInfo.supportsMonth && (
        <label className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
          <input
            type="checkbox"
            checked={allPeriods}
            onChange={(e) => {
              setAllPeriods(e.target.checked);
              resetPreview();
            }}
          />
          Todos os períodos (excluir tudo, sem filtro de mês)
        </label>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleCheck}
          disabled={checking}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          {checking ? 'Verificando…' : 'Verificar quantidade'}
        </button>
        {previewCount !== null && <span className="text-xs text-amber-400">{previewCount} registro(s) encontrado(s)</span>}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-lg bg-rose-600 text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          {deleting ? 'Excluindo…' : '🗑️ Excluir'}
        </button>
      </div>
      {result && <p className="text-xs text-slate-400 mt-2">{result}</p>}
    </div>
  );
}
