import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import type { BioWeights } from '../../lib/business/types';
import { useAddSpecialListProduct, useDeleteSpecialListProduct, useUpdateBioWeights } from '../../lib/mutations';
import { useSpecialListRows, useStoreSettings } from '../../lib/queries';

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

  if (!rows || !storeSettings) return <div className="text-sm text-slate-500 p-6">Carregando…</div>;
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
    <div className="flex flex-col gap-4">
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
    </div>
  );
}
