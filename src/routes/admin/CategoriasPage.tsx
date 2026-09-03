import { useState } from 'react';
import { PageLoading } from '../../components/PageLoading';
import { useAuth } from '../../auth/AuthContext';
import { useCreateCategoryType } from '../../lib/mutations';
import { useCategoryTypes, useCollaborators } from '../../lib/queries';

/** Gerenciar Categorias — lets the ADM create a new partnership category
 * (like BIOSINTÉTICA) that automatically gets the same mechanics: its own
 * groups/products with keyword classification, its own scoring, and a
 * sidebar button (Sidebar.tsx renders one per row here beyond
 * 'biosintetica'). See CategoryTypePage.tsx for the screen a new category
 * actually gets. Deleting a category isn't offered yet — that needs the
 * ADM login/password re-confirmation gate planned for every deletion in
 * the system, not built yet. */
export function CategoriasPage() {
  const { profile } = useAuth();
  const { data: categoryTypes } = useCategoryTypes();
  const { data: collaborators } = useCollaborators();
  const createCategory = useCreateCategoryType(profile?.store_id);
  const [creating, setCreating] = useState(false);
  const [nome, setNome] = useState('');
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [setores, setSetores] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const knownSetores = Array.from(new Set((collaborators ?? []).map((c) => c.setor).filter((s): s is string => !!s))).sort();

  function toggleSetor(s: string) {
    setSetores((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function resetForm() {
    setNome('');
    setIconFile(null);
    setIconPreview(null);
    setSetores([]);
    setCreating(false);
  }

  async function handleCreate() {
    if (!nome.trim()) {
      setError('Informe um nome para a categoria.');
      return;
    }
    if (setores.length === 0) {
      setError('Selecione ao menos um setor elegível.');
      return;
    }
    setError(null);
    try {
      await createCategory.mutateAsync({ nome: nome.trim(), setoresElegiveis: setores, iconFile });
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao criar categoria.');
    }
  }

  if (!categoryTypes || !collaborators) {
    return <PageLoading />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-1">Gerenciar Categorias</h3>
        <p className="text-xs text-slate-500">
          Crie uma nova categoria de parceria (como a Biosintética) — ela já nasce com a mesma mecânica: grupos
          próprios com produtos classificados por palavra-chave, pontuação própria e um botão dedicado no menu
          lateral.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            className="rounded-lg bg-amber-500 text-slate-950 px-4 py-2 text-sm font-medium"
          >
            + Criar Nova Categoria
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold">Nova categoria</h4>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nome da categoria</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Parceria XYZ" className="input" />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Ícone (opcional)</label>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                  {iconPreview ? <img src={iconPreview} alt="" className="w-8 h-8 object-contain" /> : <span className="text-slate-600 text-xs">—</span>}
                </div>
                <label>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setIconFile(file);
                      setIconPreview(file ? URL.createObjectURL(file) : null);
                      e.target.value = '';
                    }}
                  />
                  <span className="inline-block rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer">
                    {iconFile ? 'Trocar imagem' : 'Carregar imagem'}
                  </span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Setor(es) elegível(is) — só colaboradores desses setores entram no ranking desta categoria
              </label>
              {knownSetores.length === 0 ? (
                <p className="text-xs text-slate-500">Nenhum setor cadastrado ainda em Colaboradores.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {knownSetores.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSetor(s)}
                      className={`rounded-lg px-3 py-1.5 text-xs ${setores.includes(s) ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="text-xs text-rose-400">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={createCategory.isPending}
                className="rounded-lg bg-amber-500 text-slate-950 px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {createCategory.isPending ? 'Criando…' : 'Criar categoria'}
              </button>
              <button
                onClick={() => {
                  resetForm();
                  setError(null);
                }}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h4 className="text-sm font-semibold mb-3">Categorias existentes</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {categoryTypes.map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center overflow-hidden">
                {c.icone_url ? <img src={c.icone_url} alt="" className="w-7 h-7 object-contain" /> : <span className="text-slate-600 text-xs">—</span>}
              </div>
              <div className="text-xs text-center text-slate-300">{c.nome}</div>
              {c.sistema && <div className="text-[10px] text-slate-600 uppercase tracking-wide">Sistema</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
