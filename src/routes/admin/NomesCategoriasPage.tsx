import { useEffect, useState } from 'react';
import { PageLoading } from '../../components/PageLoading';
import { useAuth } from '../../auth/AuthContext';
import { CATEGORY_LABEL_KEYS, DEFAULT_CATEGORY_LABELS } from '../../lib/business/categoryLabels';
import { useSetCategoryLabel } from '../../lib/mutations';
import { useCategoryLabels } from '../../lib/queries';

/** Lets a store's ADM rename any of the 6 fixed categories (DERM/GEN/MP/
 * MER/LEVMEL/CHIP) — the label chosen here is read by every screen via
 * useCategoryLabelMap() (src/lib/business/categoryLabels.ts) instead of
 * each screen's own hardcoded name. Renaming only changes what's
 * *displayed*; it never changes the underlying key used for classification,
 * goals, commissions, etc. — same "override, not replace" pattern already
 * used by IconesPage.tsx for custom icons. */
export function NomesCategoriasPage() {
  const { profile } = useAuth();
  const { data: overrides } = useCategoryLabels();
  const setLabel = useSetCategoryLabel(profile?.store_id);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!overrides) return;
    setDrafts((prev) => {
      const next = { ...prev };
      CATEGORY_LABEL_KEYS.forEach((key) => {
        if (next[key] === undefined) next[key] = overrides[key] || DEFAULT_CATEGORY_LABELS[key];
      });
      return next;
    });
  }, [overrides]);

  if (!overrides) return <PageLoading />;

  async function handleSave(key: string) {
    const label = (drafts[key] || '').trim();
    if (!label) return;
    setError(null);
    setSavingKey(key);
    try {
      await setLabel.mutateAsync({ categoryKey: key, label });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar o nome.');
    } finally {
      setSavingKey(null);
    }
  }

  function handleReset(key: string) {
    setDrafts((prev) => ({ ...prev, [key]: DEFAULT_CATEGORY_LABELS[key as keyof typeof DEFAULT_CATEGORY_LABELS] }));
    setLabel.mutate({ categoryKey: key, label: DEFAULT_CATEGORY_LABELS[key as keyof typeof DEFAULT_CATEGORY_LABELS] });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-1">Nomes das Categorias</h3>
        <p className="text-xs text-slate-500">
          Renomeie como cada categoria fixa aparece em todo o sistema (menus, telas de ranking, metas, comissões,
          etc.). Isso só muda o nome exibido — a forma como as vendas são classificadas continua a mesma.
        </p>
        {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-col gap-3">
          {CATEGORY_LABEL_KEYS.map((key) => {
            const isDefault = !overrides[key];
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-[11px] font-mono text-slate-500">{key}</span>
                <input
                  value={drafts[key] ?? ''}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-sm text-slate-100"
                />
                <button
                  onClick={() => handleSave(key)}
                  disabled={savingKey === key || (drafts[key] || '').trim() === (overrides[key] || DEFAULT_CATEGORY_LABELS[key])}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                >
                  {savingKey === key ? 'Salvando…' : 'Salvar'}
                </button>
                {!isDefault && (
                  <button onClick={() => handleReset(key)} className="text-[11px] text-slate-500 hover:text-rose-400">
                    Restaurar padrão
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
