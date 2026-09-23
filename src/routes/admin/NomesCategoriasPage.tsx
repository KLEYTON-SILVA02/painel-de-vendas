import { useEffect, useState } from 'react';
import { PageLoading } from '../../components/PageLoading';
import { useAuth } from '../../auth/AuthContext';
import { CATEGORY_LABEL_KEYS, DEFAULT_CATEGORY_LABELS } from '../../lib/business/categoryLabels';
import { useSetCategoryLabel, useUpdateCategoryTypeAtivo, useUpdateStoreSettings } from '../../lib/mutations';
import { useCategoryLabels, useCategoryTypes, useStoreSettings } from '../../lib/queries';
import { errorMessage } from '../../lib/errors';

/** Lets a store's ADM rename any of the 6 fixed categories (DERM/GEN/MP/
 * MER/LEVMEL/CHIP) — the label chosen here is read by every screen via
 * useCategoryLabelMap() (src/lib/business/categoryLabels.ts) instead of
 * each screen's own hardcoded name. Renaming only changes what's
 * *displayed*; it never changes the underlying key used for classification,
 * goals, commissions, etc. — same "override, not replace" pattern already
 * used by IconesPage.tsx for custom icons.
 *
 * Also hosts the "ocultar categoria" toggle for the same 6 fixed keys
 * (store_settings.hidden_categories, 0089_hidden_categories.sql) — removes
 * the category from the Sidebar and from the Dashboard's category filter
 * bar, without touching any data: sales classification, goals, comissões
 * and the /categoria/:chave screen itself keep working exactly the same,
 * only the two navigation entry points disappear. Biosintética gets the
 * same toggle below (reusing category_types.ativo, same mechanism DSM
 * already uses) since it's the other category the ADM asked to be able to
 * hide — it just isn't part of the fixed 6 so it needs its own section. */
export function NomesCategoriasPage() {
  const { profile } = useAuth();
  const { data: overrides } = useCategoryLabels();
  const { data: storeSettings } = useStoreSettings();
  const { data: categoryTypes } = useCategoryTypes();
  const setLabel = useSetCategoryLabel(profile?.store_id);
  const updateStoreSettings = useUpdateStoreSettings(profile?.store_id);
  const updateCategoryTypeAtivo = useUpdateCategoryTypeAtivo();
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

  if (!overrides || !storeSettings) return <PageLoading />;

  const hiddenCategories = storeSettings.hidden_categories;
  const bioCategory = categoryTypes?.find((c) => c.chave === 'biosintetica');

  function toggleHidden(key: string) {
    const next = hiddenCategories.includes(key) ? hiddenCategories.filter((k) => k !== key) : [...hiddenCategories, key];
    updateStoreSettings.mutate({ hidden_categories: next });
  }

  async function handleSave(key: string) {
    const label = (drafts[key] || '').trim();
    if (!label) return;
    setError(null);
    setSavingKey(key);
    try {
      await setLabel.mutateAsync({ categoryKey: key, label });
    } catch (e) {
      setError(errorMessage(e, 'Falha ao salvar o nome.'));
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
        <h3 className="font-semibold mb-1">Nomes e Visibilidade das Categorias</h3>
        <p className="text-xs text-slate-500">
          Renomeie como cada categoria fixa aparece em todo o sistema (menus, telas de ranking, metas, comissões,
          etc.) e escolha quais ficam visíveis no menu lateral e nos filtros da tela Início. Isso nunca apaga dado
          nenhum — uma categoria oculta continua classificando vendas normalmente por baixo, só some dos dois
          atalhos de navegação.
        </p>
        {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-col gap-3">
          {CATEGORY_LABEL_KEYS.map((key) => {
            const isDefault = !overrides[key];
            const isHidden = hiddenCategories.includes(key);
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
                <button
                  onClick={() => toggleHidden(key)}
                  disabled={updateStoreSettings.isPending}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-medium disabled:opacity-40 ${
                    isHidden ? 'bg-cyan-500 text-slate-950' : 'border border-slate-700 text-slate-300'
                  }`}
                >
                  {isHidden ? 'Mostrar' : 'Ocultar'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {bioCategory && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-sm">{bioCategory.nome} no menu lateral</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {bioCategory.ativo
                ? 'A tela de Biosintética está visível no menu lateral.'
                : 'A tela de Biosintética está oculta do menu lateral.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => updateCategoryTypeAtivo.mutate({ id: bioCategory.id, ativo: !bioCategory.ativo })}
            disabled={updateCategoryTypeAtivo.isPending}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60 ${
              bioCategory.ativo ? 'border border-slate-700 text-slate-300' : 'bg-cyan-500 text-slate-950'
            }`}
          >
            {bioCategory.ativo ? 'Ocultar do menu' : 'Mostrar no menu'}
          </button>
        </div>
      )}
    </div>
  );
}
