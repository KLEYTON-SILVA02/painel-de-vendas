import { useState } from 'react';
import { PageLoading } from '../../components/PageLoading';
import { useAuth } from '../../auth/AuthContext';
import type { BioWeights } from '../../lib/business/types';
import { monthName } from '../../lib/format';
import { monthFirstISO, monthLastISO } from '../../lib/dateRange';
import {
  useAddSpecialListProduct,
  useBulkDeleteTable,
  useDeleteSpecialListProduct,
  useUpdateBioWeights,
  type BulkDeletableTable,
} from '../../lib/mutations';
import { countRowsInRange, useSpecialListRows, useStoreSettings } from '../../lib/queries';

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
                levmel.map((p) => (
                  <span key={p.id} className="text-xs bg-slate-800 rounded-full px-2 py-1 flex items-center gap-1.5">
                    {p.nome}
                    <button onClick={() => deleteProduct.mutate(p.id)} className="text-slate-500 hover:text-rose-400">
                      ✕
                    </button>
                  </span>
                ))
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
                chip.map((p) => (
                  <span key={p.id} className="text-xs bg-slate-800 rounded-full px-2 py-1 flex items-center gap-1.5">
                    {p.nome}
                    <button onClick={() => deleteProduct.mutate(p.id)} className="text-slate-500 hover:text-rose-400">
                      ✕
                    </button>
                  </span>
                ))
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

      <DangerZoneCard />
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
