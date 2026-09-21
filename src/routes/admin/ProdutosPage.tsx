import { useMemo, useRef, useState } from 'react';
import { PageLoading } from '../../components/PageLoading';
import { useAuth } from '../../auth/AuthContext';
import { HelpTip } from '../../components/HelpTip';
import { SimpleSheetImportPanel } from '../../components/admin/SimpleSheetImportPanel';
import { CATEGORY_COLOR, useCategoryLabelMap } from '../../lib/business/categoryLabels';
import {
  CAT_KEYS,
  classifyProductTier,
  GENERIC_MARKERS,
  matchesGenericSubstance,
  normalizeCategoriaImport,
  type CategoryKey,
} from '../../lib/business/classification';
import { normalize } from '../../lib/business/normalize';
import { buildClassificationInputs } from '../../lib/mappers';
import { fmtMoney } from '../../lib/format';
import {
  useBulkInsertGenericSubstances,
  useBulkInsertProducts,
  useBulkPromoteFromSales,
  useDeleteRow,
  useInsertRow,
  useReclassifyProdutos,
  useUpdateRow,
  useUpdateStoreSettings,
} from '../../lib/mutations';
import {
  useBrandKeywords,
  useCatalog,
  useExclusiveBrands,
  useGenericSubstances,
  useProducts,
  useSales,
  useStore,
  useStoreSettings,
} from '../../lib/queries';

type Tab = 'produtos' | 'catalogo' | 'classificados' | 'palavras' | 'substancias';
const TABS: { id: Tab; label: string }[] = [
  { id: 'produtos', label: 'Produtos' },
  { id: 'catalogo', label: 'Catálogo' },
  { id: 'classificados', label: 'Classificados' },
  { id: 'palavras', label: 'Palavras-chave' },
  { id: 'substancias', label: 'Substâncias' },
];

export function ProdutosPage() {
  const [tab, setTab] = useState<Tab>('produtos');
  const [group, setGroup] = useState<CategoryKey>('DERM');

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3 py-1.5 text-sm ${tab === t.id ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
            >
              {t.label}
            </button>
          ))}
          <HelpTip
            helpKey={`produtos.aba_${tab}`}
            fallback={
              tab === 'produtos'
                ? 'Cadastro manual de produtos por categoria (Dermo/Genérico/Marcas Exclusivas), um de cada vez.'
                : tab === 'catalogo'
                  ? 'Lista de produtos exatos já reconhecidos automaticamente na importação de vendas.'
                  : tab === 'classificados'
                    ? 'Todo produto já visto em alguma venda, com a categoria que o sistema identificou — reclassifique aqui se algo saiu errado.'
                    : tab === 'palavras'
                      ? 'Palavras-chave usadas para reconhecer produtos novos automaticamente, sem precisar cadastrar um a um. Em Marcas Exclusivas, qualquer palavra cadastrada aqui sempre vence, mesmo sobre outra categoria.'
                      : 'Substâncias usadas para reconhecer produtos Genéricos automaticamente pelo nome.'
            }
          />
        </div>
      </div>

      {tab === 'produtos' && <ProdutosTab group={group} setGroup={setGroup} />}
      {tab === 'catalogo' && <CatalogoTab />}
      {tab === 'classificados' && <ClassificadosTab />}
      {tab === 'palavras' && <PalavrasTab group={group} setGroup={setGroup} />}
      {tab === 'substancias' && <SubstanciasTab />}
    </div>
  );
}

/** Surfaces a mutation failure (RLS denial, constraint violation, network
 * error, …) that would otherwise vanish silently — an "Adicionar" click
 * that does nothing is indistinguishable from a broken button unless the
 * actual error reaches the screen. */
function MutationError({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return <p className="text-xs text-rose-400 mt-2">Falha ao salvar: {message}</p>;
}

function CategoryTabs({ group, setGroup }: { group: CategoryKey; setGroup: (k: CategoryKey) => void }) {
  const CAT_LABEL = useCategoryLabelMap();
  return (
    <div className="flex gap-1 mb-1">
      {CAT_KEYS.map((k) => (
        <button
          key={k}
          onClick={() => setGroup(k)}
          className={`rounded-lg px-3 py-1.5 text-xs ${group === k ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
        >
          {CAT_LABEL[k]}
        </button>
      ))}
    </div>
  );
}

function ProdutosTab({ group, setGroup }: { group: CategoryKey; setGroup: (k: CategoryKey) => void }) {
  const CAT_LABEL = useCategoryLabelMap();
  const { profile } = useAuth();
  const { data: products } = useProducts();
  const insertProduct = useInsertRow('products', profile?.store_id, 'products');
  const bulkInsertProducts = useBulkInsertProducts(profile?.store_id);
  const updateProduct = useUpdateRow('products', 'products');
  const deleteProduct = useDeleteRow('products', 'products');
  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [padrao, setPadrao] = useState('');
  const [kwDrafts, setKwDrafts] = useState<Record<string, string>>({});

  if (!products) return <PageLoading />;
  const groupProducts = products.filter((p) => p.categoria === group);

  function handleAdd() {
    if (!nome.trim()) return;
    insertProduct.mutate({ categoria: group, nome: nome.trim(), padrao: padrao.trim() || null, palavras: [padrao.trim() || nome.trim()] } as never);
    setNome('');
    setCodigo('');
    setPadrao('');
  }

  function addKeyword(productId: string, currentPalavras: string[]) {
    const kw = (kwDrafts[productId] || '').trim();
    if (!kw) return;
    updateProduct.mutate({ id: productId, patch: { palavras: [...currentPalavras, kw] } });
    setKwDrafts((prev) => ({ ...prev, [productId]: '' }));
  }

  function removeKeyword(productId: string, palavras: string[], kw: string) {
    updateProduct.mutate({ id: productId, patch: { palavras: palavras.filter((p) => p !== kw) } });
  }

  return (
    <>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <CategoryTabs group={group} setGroup={setGroup} />
        <p className="text-xs text-slate-500">
          Tier 2 — cada produto pode ter várias palavras-chave. Se qualquer uma delas aparecer no nome do produto da
          planilha, ele é classificado nesta categoria.
        </p>
      </div>
      <SimpleSheetImportPanel
        title="Importar planilha de produtos (Dermo/Genérico/Marcas Exclusivas)"
        columns={['Nome do produto', 'Categoria', 'Tipo']}
        onConfirm={async (rows) => {
          const valid = rows.filter((r) => r[0]?.trim());
          if (valid.length === 0) return { count: 0, skipped: rows.length };
          await bulkInsertProducts.mutateAsync(
            valid.map((r) => ({
              nome: r[0].trim(),
              categoria: normalizeCategoriaImport(r[1] || ''),
              palavras: [r[2]?.trim() || r[0].trim()],
            })),
          );
          return { count: valid.length, skipped: rows.length - valid.length };
        }}
      />

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-3 text-sm">Adicionar produto em {CAT_LABEL[group]}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Nome do produto</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Código (opcional)</label>
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Primeira palavra-chave (opcional)</label>
            <input value={padrao} onChange={(e) => setPadrao(e.target.value)} className="input" />
          </div>
          <button onClick={handleAdd} className="rounded-md bg-amber-500 text-slate-950 px-4 py-1.5 text-sm font-medium">
            + Adicionar
          </button>
        </div>
        <MutationError error={insertProduct.error} />
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-3 text-sm">
          Produtos — {CAT_LABEL[group]} ({groupProducts.length})
        </h3>
        <MutationError error={updateProduct.error} />
        {groupProducts.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">Nenhum produto cadastrado.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {groupProducts.map((p) => (
              <div key={p.id} className="rounded-lg bg-slate-950/60 border border-slate-800 p-3">
                <div className="flex items-center justify-between">
                  <b className="text-sm">{p.nome}</b>
                  <button onClick={() => deleteProduct.mutate(p.id)} className="text-slate-500 hover:text-rose-400">
                    ✕
                  </button>
                </div>
                <div className="text-xs text-slate-500 mt-1.5 mb-1">Palavras-chave:</div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {p.palavras.length === 0 ? (
                    <span className="text-xs text-slate-500">Nenhuma</span>
                  ) : (
                    p.palavras.map((kw) => (
                      <span key={kw} className="text-xs bg-slate-800 rounded-full px-2 py-1 flex items-center gap-1.5">
                        {kw}
                        <button onClick={() => removeKeyword(p.id, p.palavras, kw)} className="text-slate-500 hover:text-rose-400">
                          ✕
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    value={kwDrafts[p.id] || ''}
                    onChange={(e) => setKwDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    placeholder="nova palavra-chave"
                    className="input flex-1"
                  />
                  <button onClick={() => addKeyword(p.id, p.palavras)} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300">
                    + Adicionar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function CatalogoTab() {
  const CAT_LABEL = useCategoryLabelMap();
  const { profile } = useAuth();
  const { data: catalog } = useCatalog();
  const { data: sales } = useSales();
  const { data: store } = useStore();
  const insertCatalog = useInsertRow('catalog', profile?.store_id, 'catalog');
  const deleteCatalog = useDeleteRow('catalog', 'catalog');
  const promoteFromSales = useBulkPromoteFromSales(profile?.store_id, store?.modelo_catalogo);
  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [categoria, setCategoria] = useState<CategoryKey>('DERM');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Cadastrados (manual), Via Substância (varredura da aba Substâncias),
  // Da Lista de Vendas (aprovados abaixo) e Multilojas (recebidos
  // automaticamente de uma loja irmã do mesmo modelo_catalogo — ver
  // migration 0082) ficam todos na mesma tabela `catalog` e valem
  // igualmente como Tier 1 — só a listagem é separada por origem, para que
  // os grupos não se misturem visualmente.
  const [origemTab, setOrigemTab] = useState<'manual' | 'substancia' | 'vendas' | 'multilojas'>('manual');
  const [vendasCategoria, setVendasCategoria] = useState<CategoryKey>('DERM');
  const [candidatos, setCandidatos] = useState<Set<string>>(new Set());

  const candidatosVendas = useMemo(() => {
    if (!sales || !catalog) return [];
    const known = new Set(catalog.map((c) => normalize(c.nome)));
    const seen = new Set<string>();
    const result: string[] = [];
    sales.forEach((s) => {
      if (!s.produto || s.grupo !== vendasCategoria) return;
      const n = normalize(s.produto);
      if (known.has(n) || seen.has(n)) return;
      seen.add(n);
      result.push(s.produto);
    });
    return result.sort((a, b) => a.localeCompare(b));
  }, [sales, catalog, vendasCategoria]);

  if (!catalog) return <PageLoading />;
  const counts = {
    manual: catalog.filter((c) => c.origem === 'manual').length,
    substancia: catalog.filter((c) => c.origem === 'substancia').length,
    vendas: catalog.filter((c) => c.origem === 'vendas').length,
    multilojas: catalog.filter((c) => c.origem === 'multilojas').length,
  };
  const list = catalog.filter((c) => c.origem === origemTab);

  function handleAdd() {
    if (!nome.trim()) return;
    insertCatalog.mutate({ nome: nome.trim(), codigo: codigo.trim() || null, categoria } as never);
    setNome('');
    setCodigo('');
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCandidato(produto: string) {
    setCandidatos((prev) => {
      const next = new Set(prev);
      if (next.has(produto)) next.delete(produto);
      else next.add(produto);
      return next;
    });
  }

  async function handlePromote() {
    if (candidatos.size === 0) return;
    await promoteFromSales.mutateAsync({ produtos: Array.from(candidatos), categoria: vendasCategoria });
    setCandidatos(new Set());
  }

  return (
    <>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-1 text-sm">Catálogo de Produtos (classificação manual)</h3>
        <p className="text-xs text-slate-500 mb-3">
          Tier 1 — prioridade máxima. Use para forçar a categoria exata de um produto específico, por nome ou código.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Nome do produto (como aparece na planilha)</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Código (opcional)</label>
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Categoria</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoryKey)} className="input">
              {CAT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {CAT_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <button onClick={handleAdd} className="rounded-md bg-amber-500 text-slate-950 px-4 py-1.5 text-sm font-medium">
            + Adicionar
          </button>
        </div>
        <MutationError error={insertCatalog.error} />
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex gap-1">
            <button
              onClick={() => {
                setOrigemTab('manual');
                setSelected(new Set());
                setSelectMode(false);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs ${origemTab === 'manual' ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
            >
              Cadastrados ({counts.manual})
            </button>
            <button
              onClick={() => {
                setOrigemTab('substancia');
                setSelected(new Set());
                setSelectMode(false);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs ${origemTab === 'substancia' ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
              title="Produtos inseridos automaticamente pela varredura da aba Substâncias"
            >
              Via Substância ({counts.substancia})
            </button>
            <button
              onClick={() => {
                setOrigemTab('vendas');
                setSelected(new Set());
                setSelectMode(false);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs ${origemTab === 'vendas' ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
              title="Produtos que a Lista de Vendas já resolve para uma categoria, aprovados manualmente aqui"
            >
              Da Lista de Vendas ({counts.vendas})
            </button>
            <button
              onClick={() => {
                setOrigemTab('multilojas');
                setSelected(new Set());
                setSelectMode(false);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs ${origemTab === 'multilojas' ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
              title="Produtos recebidos automaticamente de uma loja irmã do mesmo modelo de catálogo (Minha Loja)"
            >
              Multilojas ({counts.multilojas})
            </button>
          </div>
          {list.length > 0 && (
            <button
              onClick={() => {
                setSelectMode(!selectMode);
                setSelected(new Set());
              }}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
            >
              {selectMode ? 'Cancelar' : 'Selecionar'}
            </button>
          )}
        </div>
        {origemTab === 'vendas' && (
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 mb-3">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <label className="text-xs text-slate-400">Categoria</label>
              <select
                value={vendasCategoria}
                onChange={(e) => {
                  setVendasCategoria(e.target.value as CategoryKey);
                  setCandidatos(new Set());
                }}
                className="input w-auto"
              >
                {CAT_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {CAT_LABEL[k]}
                  </option>
                ))}
              </select>
              {candidatosVendas.length > 0 && (
                <>
                  <button
                    onClick={() =>
                      setCandidatos((prev) => (prev.size === candidatosVendas.length ? new Set() : new Set(candidatosVendas)))
                    }
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                  >
                    {candidatos.size === candidatosVendas.length ? 'Desmarcar todos' : 'Selecionar todos'}
                  </button>
                  <button
                    onClick={handlePromote}
                    disabled={candidatos.size === 0 || promoteFromSales.isPending}
                    className="rounded-lg bg-amber-500 text-slate-950 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                  >
                    Adicionar selecionados ({candidatos.size})
                  </button>
                </>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-2">
              Produtos que a Lista de Vendas já resolve para {CAT_LABEL[vendasCategoria]} mas ainda não estão no Catálogo.
              Aprovar aqui torna a classificação instantânea nas próximas importações, em vez de sempre re-derivada por
              palavra-chave/heurística{store?.modelo_catalogo ? ' — e também contribui para as lojas irmãs do grupo.' : '.'}
            </p>
            <MutationError error={promoteFromSales.error} />
            {candidatosVendas.length === 0 ? (
              <div className="text-sm text-slate-500 py-2 text-center">Nenhum candidato novo encontrado.</div>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {candidatosVendas.map((produto) => (
                      <tr key={produto} className="border-b border-slate-900">
                        <td className="py-1 pr-3 w-6">
                          <input type="checkbox" checked={candidatos.has(produto)} onChange={() => toggleCandidato(produto)} />
                        </td>
                        <td className="py-1 pr-3">{produto}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {selectMode && selected.size > 0 && (
          <button
            onClick={() => {
              selected.forEach((id) => deleteCatalog.mutate(id));
              setSelected(new Set());
              setSelectMode(false);
            }}
            className="mb-3 rounded-lg bg-rose-600 text-white px-3 py-1.5 text-xs font-medium"
          >
            Excluir selecionados ({selected.size})
          </button>
        )}
        {list.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">
            {origemTab === 'substancia'
              ? 'Nenhum item identificado via substância ainda.'
              : origemTab === 'vendas'
                ? 'Nenhum item aprovado da lista de vendas ainda.'
                : origemTab === 'multilojas'
                  ? 'Nenhum item recebido de outra loja do grupo ainda.'
                  : 'Nenhum item cadastrado.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-800">
                  {selectMode && <th className="py-1.5 pr-3"></th>}
                  <th className="py-1.5 pr-3">Nome</th>
                  <th className="py-1.5 pr-3">Código</th>
                  <th className="py-1.5 pr-3">Categoria</th>
                  <th className="py-1.5 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className="border-b border-slate-900">
                    {selectMode && (
                      <td className="py-1.5 pr-3">
                        <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                      </td>
                    )}
                    <td className="py-1.5 pr-3">{c.nome}</td>
                    <td className="py-1.5 pr-3 font-mono">{c.codigo || '-'}</td>
                    <td className="py-1.5 pr-3">
                      <span className="bg-slate-800 rounded-full px-2 py-0.5">{CAT_LABEL[c.categoria as CategoryKey]}</span>
                    </td>
                    <td className="py-1.5 pr-3">
                      <button onClick={() => deleteCatalog.mutate(c.id)} className="text-slate-500 hover:text-rose-400">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/** Numbered page buttons with an ellipsis window instead of just Anterior/
 * Próxima — always shows the first/last page plus a small window around the
 * current one, so a long list (hundreds of pages) doesn't render hundreds
 * of buttons. */
function pageWindow(current: number, total: number): (number | '...')[] {
  const pages = new Set<number>([0, total - 1, current - 1, current, current + 1]);
  const sorted = Array.from(pages).filter((p) => p >= 0 && p < total).sort((a, b) => a - b);
  const result: (number | '...')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push('...');
    result.push(p);
  });
  return result;
}

/** Exportar/Importar planilha de Classificados (nome + categoria) — ideia
 * do usuário para analisar/editar a classificação fora do sistema (Excel/
 * Sheets) e trazer de volta as correções. Import nunca aplica direto: lê a
 * planilha, compara com a classificação atual e lista as divergências para
 * o ADM selecionar e aprovar — mesmo requisito de segurança "de forma
 * pacífica" discutido para toda esta função. */
function ExportImportCard({
  produtosVisiveis,
  produtosCompletos,
  catalog,
  sales,
  reclassifyMutation,
}: {
  produtosVisiveis: { produto: string; categoria: CategoryKey }[];
  produtosCompletos: { produto: string; categoria: CategoryKey }[];
  catalog: { id: string; nome: string }[];
  sales: { id: string; produto: string; dataISO?: string | null }[];
  reclassifyMutation: ReturnType<typeof useReclassifyProdutos>;
}) {
  const CAT_LABEL = useCategoryLabelMap();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [ignorados, setIgnorados] = useState(0);
  const [diffs, setDiffs] = useState<{ produto: string; atual: CategoryKey; proposta: CategoryKey }[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function handleExport() {
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const rows = produtosVisiveis.map((p) => ({ Produto: p.produto, Categoria: CAT_LABEL[p.categoria] }));
      const ws = XLSX.utils.json_to_sheet(rows, { header: ['Produto', 'Categoria'] });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Classificados');
      XLSX.writeFile(wb, `classificados-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  function resetImport() {
    setFileName('');
    setDiffs(null);
    setSelected(new Set());
    setImportError(null);
    setIgnorados(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleFile(file: File) {
    setImportError(null);
    setDiffs(null);
    setFileName(file.name);
    setReading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const XLSX = await import('xlsx');
        const data = new Uint8Array(ev.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const body = (XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as unknown[][]).slice(1);

        const atualByNome = new Map<string, { produto: string; categoria: CategoryKey }>();
        produtosCompletos.forEach((p) => atualByNome.set(normalize(p.produto), p));

        const found: { produto: string; atual: CategoryKey; proposta: CategoryKey }[] = [];
        let naoEncontrados = 0;
        body.forEach((row) => {
          const nomePlanilha = String(row[0] ?? '').trim();
          const categoriaPlanilha = String(row[1] ?? '').trim();
          if (!nomePlanilha || !categoriaPlanilha) return;
          const existente = atualByNome.get(normalize(nomePlanilha));
          if (!existente) {
            naoEncontrados += 1;
            return;
          }
          const proposta = normalizeCategoriaImport(categoriaPlanilha);
          if (proposta !== existente.categoria) {
            found.push({ produto: existente.produto, atual: existente.categoria, proposta });
          }
        });
        setDiffs(found);
        setSelected(new Set(found.map((d) => d.produto)));
        setIgnorados(naoEncontrados);
      } catch {
        setImportError('Falha ao ler o arquivo. Confira se é uma planilha válida (.xlsx, .xls, .csv, .ods) com Produto na coluna A e Categoria na coluna B.');
      } finally {
        setReading(false);
      }
    };
    reader.onerror = () => {
      setImportError('Falha ao ler o arquivo.');
      setReading(false);
    };
    reader.readAsArrayBuffer(file);
  }

  function toggle(produto: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(produto)) next.delete(produto);
      else next.add(produto);
      return next;
    });
  }

  async function handleApply() {
    if (!diffs) return;
    const aplicar = diffs.filter((d) => selected.has(d.produto));
    if (aplicar.length === 0) return;
    // Agrupado por categoria proposta — useReclassifyProdutos aceita uma
    // categoria por chamada, então uma planilha que propõe duas categorias
    // diferentes vira duas chamadas sequenciais, uma por grupo.
    const grupos = new Map<CategoryKey, string[]>();
    aplicar.forEach((d) => {
      const arr = grupos.get(d.proposta) ?? [];
      arr.push(d.produto);
      grupos.set(d.proposta, arr);
    });
    setProgress({ done: 0, total: aplicar.length });
    for (const [categoria, produtos] of grupos) {
      await reclassifyMutation.mutateAsync({ produtos, categoria, catalog, sales });
      setProgress((p) => (p ? { done: p.done + produtos.length, total: p.total } : p));
    }
    setProgress(null);
    resetImport();
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="font-semibold mb-1 text-sm">📊 Exportar / Importar planilha</h3>
      <p className="text-xs text-slate-500 mb-3">
        Exporte os produtos classificados (nome na coluna A, categoria na coluna B) para analisar fora do sistema.
        Depois, importe a planilha de volta — o sistema compara com a classificação atual e lista só as diferenças,
        para você aprovar uma a uma antes de aplicar.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={handleExport}
          disabled={exporting || produtosVisiveis.length === 0}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-50"
        >
          {exporting ? 'Gerando planilha…' : `⬇ Exportar (${produtosVisiveis.length} produto(s) na lista atual)`}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.xlsm,.csv,.ods"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          style={{ display: 'none' }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={reading}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-50"
        >
          {reading ? 'Lendo planilha…' : '⬆ Importar planilha para comparar'}
        </button>
        {fileName && !reading && <span className="text-xs text-slate-500">{fileName}</span>}
      </div>

      {importError && <p className="text-xs text-rose-400 mb-2">{importError}</p>}

      {progress && (
        <div className="mb-3">
          <div style={{ height: 6, borderRadius: 6, background: '#0f172a', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.round((progress.done / progress.total) * 100)}%`,
                background: 'linear-gradient(90deg, #00f0ff, #a82bff)',
                transition: 'width 0.2s ease',
              }}
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Aplicando… {progress.done} de {progress.total} produto(s)
          </p>
        </div>
      )}

      {diffs && (
        diffs.length === 0 ? (
          <div className="text-xs text-slate-500 py-2">
            Nenhuma diferença encontrada — a planilha já bate com a classificação atual.
            {ignorados > 0 && ` (${ignorados} produto(s) da planilha não foram encontrados no sistema e foram ignorados.)`}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-slate-500">
                {diffs.length} divergência(s) encontrada(s){ignorados > 0 && ` · ${ignorados} produto(s) não encontrado(s), ignorado(s)`}.
                Marque as que quer aplicar.
              </p>
              <button
                onClick={handleApply}
                disabled={selected.size === 0 || !!progress}
                className="rounded-md bg-amber-500 text-slate-950 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                Aplicar selecionadas ({selected.size})
              </button>
            </div>
            <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-lg border border-slate-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-800 sticky top-0 bg-slate-950">
                    <th className="py-1.5 px-2">
                      <input
                        type="checkbox"
                        checked={diffs.every((d) => selected.has(d.produto))}
                        onChange={(e) => setSelected(e.target.checked ? new Set(diffs.map((d) => d.produto)) : new Set())}
                      />
                    </th>
                    <th className="py-1.5 px-2">Produto</th>
                    <th className="py-1.5 px-2">Categoria atual</th>
                    <th className="py-1.5 px-2">Categoria na planilha</th>
                  </tr>
                </thead>
                <tbody>
                  {diffs.map((d) => (
                    <tr key={d.produto} className="border-b border-slate-900">
                      <td className="py-1.5 px-2">
                        <input type="checkbox" checked={selected.has(d.produto)} onChange={() => toggle(d.produto)} />
                      </td>
                      <td className="py-1.5 px-2">{d.produto}</td>
                      <td className="py-1.5 px-2">
                        <span style={{ color: CATEGORY_COLOR[d.atual] }}>{CAT_LABEL[d.atual]}</span>
                      </td>
                      <td className="py-1.5 px-2">
                        <span style={{ color: CATEGORY_COLOR[d.proposta] }}>{CAT_LABEL[d.proposta]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}

function ClassificadosTab() {
  const CAT_LABEL = useCategoryLabelMap();
  const { data: sales } = useSales();
  const { data: catalog } = useCatalog();
  const { data: products } = useProducts();
  const { data: brandKeywords } = useBrandKeywords();
  const { data: exclusiveBrands } = useExclusiveBrands();
  const { profile } = useAuth();
  const reclassifyMutation = useReclassifyProdutos(profile?.store_id);
  const [filtro, setFiltro] = useState<CategoryKey | 'ALL'>('ALL');
  const [busca, setBusca] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategoria, setBulkCategoria] = useState<CategoryKey>('DERM');
  const [ordem, setOrdem] = useState<'ocorrencias' | 'alfabetica'>('ocorrencias');
  const [page, setPage] = useState(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dermoScanning, setDermoScanning] = useState(false);
  const [dermoSuggestions, setDermoSuggestions] = useState<string[] | null>(null);
  const PAGE_SIZE = 500;

  // classifyProductTier() runs once per distinct product across the sales
  // history in scope here (thousands of products × the full keyword-
  // matching pass) — without this memo it re-ran from scratch on every
  // render of this tab (ticking a checkbox, changing the sort order,
  // turning a page), measured at 12-20s of main-thread blocking on a real
  // store's history. Same fix already applied to Colaboradores/Auditoria/
  // AdminLandingPage (see commit c992cbf) — this tab was the one screen
  // that hadn't received it yet.
  const classifiedProducts = useMemo(() => {
    if (!sales || !catalog || !products || !brandKeywords || !exclusiveBrands) return null;
    const inputs = buildClassificationInputs(catalog, products, brandKeywords, exclusiveBrands);
    const map = new Map<string, { produto: string; qtd: number; valor: number; ocorrencias: number; categoria: CategoryKey }>();
    sales.forEach((s) => {
      if (!s.produto) return;
      if (dateFrom && s.dataISO && s.dataISO < dateFrom) return;
      if (dateTo && s.dataISO && s.dataISO > dateTo) return;
      const existing = map.get(s.produto);
      if (existing) {
        existing.qtd += s.qtd;
        existing.valor += s.valor;
        existing.ocorrencias += 1;
      } else {
        map.set(s.produto, {
          produto: s.produto,
          qtd: s.qtd,
          valor: s.valor,
          ocorrencias: 1,
          // useFallback defaults to true, so categoria is guaranteed non-null.
          categoria: classifyProductTier(s.produto, s.codigo, inputs).categoria!,
        });
      }
    });
    return Array.from(map.values());
  }, [sales, catalog, products, brandKeywords, exclusiveBrands, dateFrom, dateTo]);

  if (!sales || !catalog || !products || !brandKeywords || !exclusiveBrands || !classifiedProducts) {
    return <PageLoading />;
  }

  let list = classifiedProducts.slice().sort((a, b) =>
    ordem === 'alfabetica' ? a.produto.localeCompare(b.produto, 'pt-BR') : b.ocorrencias - a.ocorrencias,
  );
  if (filtro !== 'ALL') list = list.filter((p) => p.categoria === filtro);
  const buscaNormalizada = normalize(busca.trim());
  if (buscaNormalizada) list = list.filter((p) => normalize(p.produto).includes(buscaNormalizada));
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages - 1);
  const pageList = list.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE);

  async function reclassify(produtoNomes: string[], categoria: CategoryKey) {
    // Also retroactively updates every already-imported sale for these
    // products (sales.grupo) — updating only `catalog` fixes future imports
    // but leaves the value already sold stuck under the old category
    // forever, since sales.grupo is written once at import time and never
    // recomputed on its own. Without this, the totals shown for each
    // category would never reflect a reclassification made here. Scoped by
    // the De/Até filter above when set, same convention as Auditoria — in
    // branco (o padrão) continua corrigindo todo o histórico do produto.
    await reclassifyMutation.mutateAsync({
      produtos: produtoNomes,
      categoria,
      catalog: catalog!,
      sales: sales!,
      dateRange: { from: dateFrom || undefined, to: dateTo || undefined },
    });
    setSelected(new Set());
  }

  // "Sugestões Dermo" — segunda análise, manual, dos produtos JÁ
  // classificados em outra categoria. classifyProductTier já roda a mesma
  // busca por palavra-chave de Dermocosméticos automaticamente (Tier 2),
  // mas duas regras podem esconder um sinal genuíno de Dermo do resultado
  // final: o override de Marcas Exclusivas (sempre vence, não importa o
  // tier) e o "maior trecho vence" entre categorias empatadas. Este scanner
  // ignora as duas — olha só "esse nome bate com alguma palavra/padrão
  // cadastrado para Dermo?" — e lista os achados para o ADM aceitar um a
  // um, nunca aplica sozinho.
  function handleScanDermo() {
    setDermoScanning(true);
    try {
      const inputs = buildClassificationInputs(catalog!, products!, brandKeywords!, exclusiveBrands!);
      const dermoWords = [
        ...(inputs.productsByCategory.DERM || []).flatMap((p) => (p.palavras?.length ? p.palavras : [p.padrao || p.nome])),
        ...(inputs.brandKeywordsByCategory.DERM || []),
      ]
        .map((kw) => normalize(kw))
        .filter((kw) => kw.length >= 3);
      const candidates = classifiedProducts!
        .filter((p) => p.categoria !== 'DERM')
        .filter((p) => {
          const n = normalize(p.produto);
          return dermoWords.some((kw) => n.includes(kw));
        })
        .map((p) => p.produto);
      setDermoSuggestions(candidates);
    } finally {
      setDermoScanning(false);
    }
  }

  return (
    <>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-1 text-sm">Produtos classificados (a partir das vendas importadas)</h3>
        <p className="text-xs text-slate-500 mb-3">
          Mostra cada produto distinto que já apareceu numa venda, com a categoria que o sistema atribuiu. Selecione
          um ou mais e reclassifique — isso cria/atualiza entradas no Catálogo (prioridade máxima) e{' '}
          <b>também transfere retroativamente o valor de todas as vendas já importadas desse produto</b> da
          categoria antiga para a nova. Ex.: se um produto estava em Marcas Exclusivas mas pertence a
          Dermocosméticos, ao reclassificá-lo o valor sai do total de Marcas Exclusivas e passa a contar em
          Dermocosméticos — em rankings, comissões e no Dashboard.
        </p>
        <div className="flex flex-wrap gap-1 mb-3">
          {(['ALL', ...CAT_KEYS] as const).map((k) => (
            <button
              key={k}
              onClick={() => {
                setFiltro(k);
                setPage(0);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs ${filtro === k ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
            >
              {k === 'ALL' ? 'Todos' : CAT_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">De</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(0);
              }}
              className="input"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Até</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(0);
              }}
              className="input"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => {
                setDateFrom('');
                setDateTo('');
                setPage(0);
              }}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
            >
              Limpar período
            </button>
          )}
          <p className="text-[11px] text-slate-500">
            Em branco = todo o histórico de vendas. Com período definido, a reclassificação feita abaixo também fica
            restrita a ele — igual à Auditoria.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h3 className="font-semibold text-sm">🔍 Sugestões Dermo (segunda análise, manual)</h3>
          <button
            onClick={handleScanDermo}
            disabled={dermoScanning}
            className="rounded-md border border-pink-500/60 text-pink-400 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {dermoScanning ? 'Escaneando…' : 'Escanear'}
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-2">
          Procura, entre os produtos já classificados em outra categoria, quem também bate com alguma palavra ou
          padrão cadastrado para Dermocosméticos — inclusive casos que a classificação automática decidiu para outro
          lado (ex.: uma Marca Exclusiva que também é Dermo). Só sugere: nada é reclassificado sem você confirmar.
        </p>
        {dermoSuggestions && (
          <>
            {dermoSuggestions.length === 0 ? (
              <div className="text-xs text-slate-500 py-2">Nenhuma sugestão encontrada — nada fora do lugar.</div>
            ) : (
              <div className="flex flex-col gap-1.5 mt-2">
                {dermoSuggestions.map((nome) => (
                  <div
                    key={nome}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5"
                  >
                    <span className="text-xs">{nome}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={async () => {
                          await reclassify([nome], 'DERM');
                          setDermoSuggestions((prev) => (prev ? prev.filter((n) => n !== nome) : prev));
                        }}
                        className="rounded-md bg-pink-500 text-slate-950 px-2.5 py-1 text-[11px] font-medium"
                      >
                        Reclassificar p/ Dermo
                      </button>
                      <button
                        onClick={() => setDermoSuggestions((prev) => (prev ? prev.filter((n) => n !== nome) : prev))}
                        className="text-[11px] text-slate-500 hover:text-slate-300"
                      >
                        Ignorar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <ExportImportCard
        produtosVisiveis={list}
        produtosCompletos={classifiedProducts}
        catalog={catalog}
        sales={sales}
        reclassifyMutation={reclassifyMutation}
      />

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <input
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setPage(0);
          }}
          placeholder="Buscar produto já classificado…"
          className="input w-full mb-3"
        />
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="text-xs text-slate-500">{list.length} produto(s)</div>
            <button
              onClick={() => {
                setOrdem((o) => (o === 'alfabetica' ? 'ocorrencias' : 'alfabetica'));
                setPage(0);
              }}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
              title="Alternar ordenação"
            >
              {ordem === 'alfabetica' ? 'A-Z ▾' : 'Mais vendidos ▾'}
            </button>
          </div>
          <div className="flex gap-2">
            <select value={bulkCategoria} onChange={(e) => setBulkCategoria(e.target.value as CategoryKey)} className="input">
              {CAT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {CAT_LABEL[k]}
                </option>
              ))}
            </select>
            <button
              onClick={() => reclassify(Array.from(selected), bulkCategoria)}
              disabled={selected.size === 0}
              className="rounded-md bg-amber-500 text-slate-950 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              Aplicar aos selecionados
            </button>
          </div>
        </div>
        {list.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">
            {buscaNormalizada || filtro !== 'ALL' ? 'Nenhum produto encontrado para esse filtro.' : 'Nenhum produto encontrado. Importe uma planilha de vendas primeiro.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-800">
                  <th className="py-1.5 pr-3">
                    <input
                      type="checkbox"
                      checked={pageList.length > 0 && pageList.every((p) => selected.has(p.produto))}
                      onChange={(e) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          pageList.forEach((p) => (e.target.checked ? next.add(p.produto) : next.delete(p.produto)));
                          return next;
                        })
                      }
                      title="Selecionar todos desta página"
                    />
                  </th>
                  <th className="py-1.5 pr-3">Produto</th>
                  <th className="py-1.5 pr-3">Categoria atual</th>
                  <th className="py-1.5 pr-3">Ocorrências</th>
                  <th className="py-1.5 pr-3">Qtd</th>
                  <th className="py-1.5 pr-3">Valor</th>
                  <th className="py-1.5 pr-3">Reclassificar</th>
                </tr>
              </thead>
              <tbody>
                {pageList.map((p) => (
                  <tr key={p.produto} className="border-b border-slate-900">
                    <td className="py-1.5 pr-3">
                      <input
                        type="checkbox"
                        checked={selected.has(p.produto)}
                        onChange={() =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(p.produto)) next.delete(p.produto);
                            else next.add(p.produto);
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className="py-1.5 pr-3">{p.produto}</td>
                    <td className="py-1.5 pr-3">
                      <span
                        className="rounded-full px-2 py-0.5 font-medium"
                        style={{ color: CATEGORY_COLOR[p.categoria], background: `${CATEGORY_COLOR[p.categoria]}22` }}
                      >
                        {CAT_LABEL[p.categoria]}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 font-mono">{p.ocorrencias}</td>
                    <td className="py-1.5 pr-3 font-mono">{p.qtd}</td>
                    <td className="py-1.5 pr-3 font-mono">{fmtMoney(p.valor)}</td>
                    <td className="py-1.5 pr-3">
                      <select
                        defaultValue={p.categoria}
                        onChange={(e) => reclassify([p.produto], e.target.value as CategoryKey)}
                        className="input"
                      >
                        {CAT_KEYS.map((k) => (
                          <option key={k} value={k}>
                            {CAT_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                <span className="text-xs text-slate-500">
                  Página {pageSafe + 1} de {totalPages} — mostrando {pageList.length} de {list.length} produtos
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={pageSafe === 0}
                    className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 disabled:opacity-40"
                  >
                    ← Anterior
                  </button>
                  {pageWindow(pageSafe, totalPages).map((p, i) =>
                    p === '...' ? (
                      <span key={`ellipsis-${i}`} className="px-1 text-xs text-slate-600">
                        …
                      </span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`rounded-lg px-2.5 py-1.5 text-xs min-w-[28px] ${
                          p === pageSafe ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'
                        }`}
                      >
                        {p + 1}
                      </button>
                    ),
                  )}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={pageSafe >= totalPages - 1}
                    className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 disabled:opacity-40"
                  >
                    Próxima →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/** Escanear produtos correspondentes — pedido do usuário: depois de
 * cadastrar uma palavra-chave, disparar uma varredura nos produtos já
 * vendidos para achar quem bate com ela e ainda não está em {group}. Mesmo
 * espírito do "Sugestões Dermo" (ClassificadosTab) e "Aplicar/Escanear"
 * (SubstanciasTab), mas: (a) generalizado para qualquer categoria/palavra-
 * chave cadastrada aqui, não só Dermo; (b) nunca aplica sozinho — sempre
 * lista para o ADM aprovar, individualmente ou em massa (diferente de
 * SubstanciasTab, que aplica direto). Escaneia contra TODAS as
 * palavras-chave já cadastradas no grupo, não só a mais recente — cobre
 * também palavras antigas cujo produto correspondente só passou a ser
 * vendido depois, sem precisar re-escanear uma por uma.
 */
/** Palavras-chave (Tier 3), incluindo Marcas Exclusivas — antes duas telas
 * separadas (esta e a extinta "Marcas Excl."), unificadas aqui a pedido do
 * usuário: cadastrar uma marca em "Marcas Excl." não aparecia na lista
 * desta aba quando o grupo "Marcas Exclusivas" era selecionado, porque cada
 * tela lia de uma tabela diferente. A causa raiz não era um bug de UI —
 * `exclusive_brands` (o `EXCLUSIVE_BRANDS_DEFAULT` override, ver
 * classification.ts) e `brand_keywords` com `categoria='MP'` sempre foram
 * dois mecanismos distintos: o primeiro SEMPRE vence, mesmo sobre um
 * catálogo Tier 1; o segundo é só mais um candidato Tier 3, que pode perder
 * para outra categoria pelo "trecho mais longo vence". Fundir os dados
 * (jogar um dentro do outro) mudaria como produtos de OUTRAS lojas já são
 * classificados hoje — por isso a fusão aqui é só de tela: quando o grupo é
 * 'MP', a lista e o formulário passam a ler/escrever em `exclusive_brands`
 * (a mesma tabela que a extinta aba já usava) em vez de `brand_keywords`;
 * os outros 3 grupos continuam exatamente como antes.
 */
function PalavrasTab({ group, setGroup }: { group: CategoryKey; setGroup: (k: CategoryKey) => void }) {
  const CAT_LABEL = useCategoryLabelMap();
  const { profile } = useAuth();
  const { data: brandKeywords } = useBrandKeywords();
  const { data: sales } = useSales();
  const { data: catalog } = useCatalog();
  const { data: exclusiveBrands } = useExclusiveBrands();
  const insertKw = useInsertRow('brand_keywords', profile?.store_id, 'brand_keywords');
  const deleteKw = useDeleteRow('brand_keywords', 'brand_keywords');
  const insertExclusive = useInsertRow('exclusive_brands', profile?.store_id, 'exclusive_brands');
  const deleteExclusive = useDeleteRow('exclusive_brands', 'exclusive_brands');
  const reclassifyMutation = useReclassifyProdutos(profile?.store_id);
  const [kw, setKw] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<
    { produto: string; categoriaAtual: CategoryKey; palavrasBatidas: string[] }[] | null
  >(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (!brandKeywords || !exclusiveBrands) return <PageLoading />;
  const isMP = group === 'MP';
  const groupKeywords = isMP ? exclusiveBrands : brandKeywords.filter((b) => b.categoria === group);
  const insertMutation = isMP ? insertExclusive : insertKw;
  const deleteMutation = isMP ? deleteExclusive : deleteKw;
  const dadosProntos = !!sales && !!catalog;

  function handleAdd() {
    if (!kw.trim()) return;
    if (isMP) {
      insertExclusive.mutate({ palavra: kw.trim() } as never);
    } else {
      insertKw.mutate({ categoria: group, palavra: kw.trim() } as never);
    }
    setKw('');
    // Uma lista já escaneada some ao mudar as palavras-chave — evita o ADM
    // aplicar uma lista que não reflete mais o que está cadastrado.
    setScanResults(null);
    setSelected(new Set());
  }

  function handleScan() {
    if (!sales) return;
    setScanning(true);
    try {
      // Mantém o texto original de cada palavra-chave ao lado da versão
      // normalizada — o candidato mostra qual palavra-chave bateu (não só
      // "produto X apareceu"), pra o ADM enxergar se é um match de verdade
      // ou uma coincidência (ex.: a palavra-chave "GN-" bate em "...GN-SAN"
      // sem que isso signifique nada relacionado a Genéricos ali).
      const keywords = groupKeywords
        .map((k) => ({ original: k.palavra, normalizada: normalize(k.palavra) }))
        .filter((k) => k.normalizada.length >= 3);
      // Compara contra o `grupo` já GRAVADO em cada venda, não contra uma
      // classificação recém-calculada — decisão importante, não só um
      // detalhe de implementação: uma classificação recém-calculada já
      // reflete a própria palavra-chave sendo escaneada (via Tier 1
      // catálogo ou Tier 3), então ela nunca vai divergir do grupo-alvo
      // para um produto que bate com a palavra — o scan sempre voltaria
      // vazio, mesmo com centenas de vendas ainda presas na categoria
      // antiga. O `grupo` gravado é o que realmente aparece hoje em
      // rankings/totais, e é exatamente isso que "Aplicar/Reclassificar"
      // corrige de forma retroativa.
      const porProduto = new Map<
        string,
        { produto: string; categoriaAtual: CategoryKey; palavrasBatidas: string[]; precisaCorrigir: boolean }
      >();
      if (keywords.length > 0) {
        sales.forEach((s) => {
          if (!s.produto) return;
          const n = normalize(s.produto);
          const palavrasBatidas = keywords.filter((kwItem) => n.includes(kwItem.normalizada)).map((kwItem) => kwItem.original);
          if (palavrasBatidas.length === 0) return;
          if (group === 'GEN' && !GENERIC_MARKERS.some((m) => n.includes(m.trim()))) return;
          const existing = porProduto.get(n);
          if (existing) {
            if (s.grupo !== group) existing.precisaCorrigir = true;
          } else {
            porProduto.set(n, {
              produto: s.produto,
              categoriaAtual: s.grupo ?? 'MER',
              palavrasBatidas,
              precisaCorrigir: s.grupo !== group,
            });
          }
        });
      }
      const candidates = Array.from(porProduto.values())
        .filter((c) => c.precisaCorrigir)
        .map(({ produto, categoriaAtual, palavrasBatidas }) => ({ produto, categoriaAtual, palavrasBatidas }));
      setScanResults(candidates);
      setSelected(new Set(candidates.map((c) => c.produto)));
    } finally {
      setScanning(false);
    }
  }

  async function reclassify(produtoNomes: string[]) {
    if (!catalog || !sales || produtoNomes.length === 0) return;
    await reclassifyMutation.mutateAsync({ produtos: produtoNomes, categoria: group, catalog, sales });
    setScanResults((prev) => (prev ? prev.filter((c) => !produtoNomes.includes(c.produto)) : prev));
    setSelected((prev) => {
      const next = new Set(prev);
      produtoNomes.forEach((p) => next.delete(p));
      return next;
    });
  }

  function toggle(produto: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(produto)) next.delete(produto);
      else next.add(produto);
      return next;
    });
  }

  return (
    <>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <CategoryTabs group={group} setGroup={setGroup} />
        <p className="text-xs text-slate-500">
          {isMP
            ? 'Marcas Exclusivas funciona diferente das outras 3: qualquer palavra cadastrada aqui sempre vence, mesmo sobre uma categoria já definida por outra regra.'
            : <>Tier 3 — palavras-chave de marca por categoria. Para <b>Genérico</b>, o nome do produto também precisa conter um marcador de genérico (ex: "generico", "similar", "gen", "gn").</>}
        </p>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-3 text-sm">Adicionar palavra-chave em {CAT_LABEL[group]}</h3>
        <div className="flex gap-2 mb-3">
          <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="ex: NIVEA" className="input flex-1" />
          <button onClick={handleAdd} className="rounded-md bg-amber-500 text-slate-950 px-4 py-1.5 text-sm font-medium">
            + Adicionar
          </button>
        </div>
        <MutationError error={insertMutation.error} />
        <div className="flex flex-wrap gap-1.5">
          {groupKeywords.length === 0 ? (
            <span className="text-xs text-slate-500">Nenhuma palavra-chave cadastrada.</span>
          ) : (
            groupKeywords.map((k) => (
              <span key={k.id} className="text-xs bg-slate-800 rounded-full px-2 py-1 flex items-center gap-1.5">
                {k.palavra}
                <button onClick={() => deleteMutation.mutate(k.id)} className="text-slate-500 hover:text-rose-400">
                  ✕
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h3 className="font-semibold text-sm">🔍 Escanear produtos correspondentes</h3>
          <button
            onClick={handleScan}
            disabled={scanning || !dadosProntos || groupKeywords.length === 0}
            title={
              groupKeywords.length === 0
                ? 'Cadastre pelo menos uma palavra-chave acima para poder escanear.'
                : !dadosProntos
                  ? 'Carregando vendas e catálogo…'
                  : undefined
            }
            className="rounded-md bg-cyan-500 text-slate-950 font-medium px-4 py-1.5 text-sm disabled:opacity-50"
          >
            {scanning ? 'Escaneando…' : 'Escanear'}
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-2">
          Procura, entre os produtos já vendidos, quem bate com alguma das palavras-chave cadastradas acima mas ainda
          tem vendas gravadas fora de {CAT_LABEL[group]}. Nada é reclassificado sozinho — revise a lista e aprove uma
          a uma ou em massa.
        </p>
        {groupKeywords.length === 0 ? (
          <p className="text-[11px] text-amber-400 mb-2">
            Cadastre pelo menos uma palavra-chave acima para habilitar o botão "Escanear".
          </p>
        ) : (
          !dadosProntos && <p className="text-[11px] text-slate-500 mb-2">Carregando vendas e catálogo…</p>
        )}
        <MutationError error={reclassifyMutation.error} />
        {scanResults &&
          (scanResults.length === 0 ? (
            <div className="text-xs text-slate-500 py-2">Nenhum produto novo encontrado.</div>
          ) : (
            <div className="flex flex-col gap-2 mt-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={selected.size === scanResults.length}
                    onChange={(e) => setSelected(e.target.checked ? new Set(scanResults.map((c) => c.produto)) : new Set())}
                  />
                  Selecionar todos ({scanResults.length})
                </label>
                <button
                  onClick={() => reclassify(Array.from(selected))}
                  disabled={selected.size === 0 || reclassifyMutation.isPending}
                  className="rounded-md bg-amber-500 text-slate-950 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  {reclassifyMutation.isPending ? 'Aplicando…' : `Aplicar selecionados (${selected.size})`}
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                {scanResults.map((c) => (
                  <div
                    key={c.produto}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5"
                  >
                    <label className="flex items-start gap-2 text-xs flex-1 min-w-0">
                      <input type="checkbox" checked={selected.has(c.produto)} onChange={() => toggle(c.produto)} className="mt-0.5" />
                      <span className="min-w-0">
                        <span className="block truncate">{c.produto}</span>
                        <span className="block text-slate-500">
                          atualmente {CAT_LABEL[c.categoriaAtual]} — bate com: {c.palavrasBatidas.join(', ')}
                        </span>
                      </span>
                    </label>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => reclassify([c.produto])}
                        disabled={reclassifyMutation.isPending}
                        className="rounded-md bg-cyan-500 text-slate-950 px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
                      >
                        Reclassificar
                      </button>
                      <button
                        onClick={() => {
                          setScanResults((prev) => (prev ? prev.filter((x) => x.produto !== c.produto) : prev));
                          setSelected((prev) => {
                            const next = new Set(prev);
                            next.delete(c.produto);
                            return next;
                          });
                        }}
                        className="text-[11px] text-slate-500 hover:text-slate-300"
                      >
                        Ignorar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>
    </>
  );
}

/** "Substâncias" — função exclusiva de Genéricos: uma lista, em coluna
 * única, de nomes de substâncias (ex.: Dipirona, Paracetamol) mantida pelo
 * ADM. Ela não entra no motor de classificação sozinha — o botão "Aplicar /
 * Escanear" varre os produtos já vendidos (mesma fonte da aba Classificados)
 * procurando os que ainda não são Genéricos mas cujo nome contém alguma
 * substância cadastrada, e reclassifica cada um encontrado com
 * useReclassifyProdutos (mesmo mecanismo do ReclassifyBar): upsert no
 * Catálogo — marcado origem='substancia', para a aba isolada "Via
 * Substância" em Catálogo — e atualização retroativa de sales.grupo, para
 * que o resultado já apareça nos rankings/filtros imediatamente. */
function SubstanciasTab() {
  const { profile } = useAuth();
  const { data: substances } = useGenericSubstances();
  const { data: sales } = useSales();
  const { data: catalog } = useCatalog();
  const { data: products } = useProducts();
  const { data: brandKeywords } = useBrandKeywords();
  const { data: exclusiveBrands } = useExclusiveBrands();
  const { data: storeSettings } = useStoreSettings();
  const insertSubstance = useInsertRow('generic_substances', profile?.store_id, 'generic_substances');
  const bulkInsertSubstances = useBulkInsertGenericSubstances(profile?.store_id);
  const deleteSubstance = useDeleteRow('generic_substances', 'generic_substances');
  const reclassify = useReclassifyProdutos(profile?.store_id);
  const updateStoreSettings = useUpdateStoreSettings(profile?.store_id);
  const [nome, setNome] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string[] | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);

  if (!substances || !sales || !catalog || !products || !brandKeywords || !exclusiveBrands) return <PageLoading />;

  function handleAdd() {
    if (!nome.trim()) return;
    insertSubstance.mutate({ nome: nome.trim() } as never);
    setNome('');
  }

  async function handleBulkAdd() {
    const nomes = bulkText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!nomes.length) return;
    await bulkInsertSubstances.mutateAsync(nomes);
    setBulkText('');
  }

  async function handleBulkDelete() {
    setBulkDeleteError(null);
    const ids = Array.from(selected);
    const results = await Promise.allSettled(ids.map((id) => deleteSubstance.mutateAsync(id)));
    const failedIds = ids.filter((_, i) => results[i].status === 'rejected');
    if (failedIds.length > 0) {
      setBulkDeleteError(`${failedIds.length} de ${ids.length} substância(s) não puderam ser excluídas.`);
      setSelected(new Set(failedIds));
    } else {
      setSelected(new Set());
      setSelectMode(false);
    }
  }

  async function handleScan() {
    setScanning(true);
    setScanResult(null);
    try {
      const inputs = buildClassificationInputs(catalog!, products!, brandKeywords!, exclusiveBrands!);
      const catalogNames = new Set(catalog!.map((c) => normalize(c.nome)));
      const seen = new Set<string>();
      const candidates: string[] = [];
      for (const s of sales!) {
        if (!s.produto) continue;
        const key = normalize(s.produto);
        if (seen.has(key) || catalogNames.has(key)) continue;
        seen.add(key);
        const categoria = classifyProductTier(s.produto, s.codigo, inputs).categoria;
        if (categoria === 'GEN') continue;
        if (matchesGenericSubstance(s.produto, substances!)) candidates.push(s.produto);
      }
      if (candidates.length > 0) {
        await reclassify.mutateAsync({ produtos: candidates, categoria: 'GEN', catalog: catalog!, sales: sales!, origem: 'substancia' });
      }
      updateStoreSettings.mutate({ substances_scan_last_run: new Date().toISOString(), substances_scan_last_count: candidates.length });
      setScanResult(candidates);
    } finally {
      setScanning(false);
    }
  }

  return (
    <>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-1 text-sm">Substâncias — Genéricos</h3>
        <p className="text-xs text-slate-500">
          Cadastre nomes de substâncias (ex.: Dipirona, Paracetamol, Losartana). Depois use "Aplicar / Escanear"
          para identificar, entre os produtos já vendidos, quais contêm alguma dessas substâncias no nome e ainda
          não estão classificados como Genéricos — eles são inseridos automaticamente no Catálogo, isolados na aba
          "Via Substância" (dentro de Catálogo), e as vendas já importadas desses produtos são reclassificadas.
          Além do botão manual, o sistema também roda essa varredura sozinho 5x por dia (07h, 10h, 15h, 18h, 22h).
        </p>
        <p className="text-xs text-cyan-400 mt-2">
          {storeSettings?.substances_scan_last_run
            ? `Última varredura: ${new Date(storeSettings.substances_scan_last_run).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })} — ${storeSettings.substances_scan_last_count} produto(s) identificado(s)`
            : 'Nenhuma varredura rodou ainda.'}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-3 text-sm">Adicionar substância</h3>
        <div className="flex gap-2 mb-3 max-w-md">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="ex: Dipirona"
            className="input flex-1"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <button onClick={handleAdd} className="rounded-md bg-amber-500 text-slate-950 px-4 py-1.5 text-sm font-medium">
            + Adicionar
          </button>
        </div>
        <MutationError error={insertSubstance.error} />
        <label className="block text-xs text-slate-400 mb-1 mt-3">Colar lista (uma substância por linha)</label>
        <textarea
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          rows={4}
          placeholder={'Dipirona\nParacetamol\nLosartana'}
          className="input w-full max-w-md"
        />
        <div className="mt-2">
          <button
            onClick={handleBulkAdd}
            disabled={!bulkText.trim() || bulkInsertSubstances.isPending}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-50"
          >
            {bulkInsertSubstances.isPending ? 'Adicionando…' : '+ Adicionar lista'}
          </button>
        </div>
        <MutationError error={bulkInsertSubstances.error} />
      </div>

      <SimpleSheetImportPanel
        title="Importar planilha de substâncias"
        columns={['Nome da substância']}
        onConfirm={async (rows) => {
          const nomes = rows.map((r) => r[0]?.trim()).filter((n): n is string => !!n);
          if (nomes.length === 0) return { count: 0, skipped: rows.length };
          await bulkInsertSubstances.mutateAsync(nomes);
          return { count: nomes.length, skipped: rows.length - nomes.length };
        }}
      />

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-semibold text-sm">Substâncias cadastradas ({substances.length})</h3>
          {substances.length > 0 && (
            <button
              onClick={() => {
                setSelectMode(!selectMode);
                setSelected(new Set());
              }}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
            >
              {selectMode ? 'Cancelar' : 'Selecionar'}
            </button>
          )}
        </div>
        {selectMode && (
          <div className="flex items-center gap-2 mb-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={selected.size === substances.length}
                onChange={(e) => setSelected(e.target.checked ? new Set(substances.map((s) => s.id)) : new Set())}
              />
              Selecionar todos
            </label>
            {selected.size > 0 && (
              <button
                onClick={handleBulkDelete}
                disabled={deleteSubstance.isPending}
                className="rounded-lg bg-rose-600 text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {deleteSubstance.isPending ? 'Excluindo…' : `Excluir selecionadas (${selected.size})`}
              </button>
            )}
          </div>
        )}
        {bulkDeleteError && <p className="text-xs text-rose-400 mb-3">{bulkDeleteError}</p>}
        {substances.length === 0 ? (
          <span className="text-xs text-slate-500">Nenhuma substância cadastrada.</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {substances.map((s) => (
              <span key={s.id} className="text-xs bg-slate-800 rounded-full px-2 py-1 flex items-center gap-1.5">
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.id)) next.delete(s.id);
                        else next.add(s.id);
                        return next;
                      })
                    }
                  />
                )}
                {s.nome}
                {!selectMode && (
                  <button onClick={() => deleteSubstance.mutate(s.id)} className="text-slate-500 hover:text-rose-400">
                    ✕
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-1 text-sm">Aplicar / Escanear</h3>
        <p className="text-xs text-slate-500 mb-3">
          Varre todo o histórico de vendas já importado em busca de produtos que ainda não são Genéricos, mas cujo
          nome contém uma substância cadastrada acima.
        </p>
        <button
          onClick={handleScan}
          disabled={scanning || substances.length === 0}
          className="rounded-md bg-cyan-500 text-slate-950 font-medium px-4 py-1.5 text-sm disabled:opacity-50"
        >
          {scanning ? 'Escaneando…' : '🔍 Aplicar / Escanear'}
        </button>
        <MutationError error={reclassify.error} />
        {scanResult && (
          <div className="mt-3">
            {scanResult.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum produto novo encontrado.</p>
            ) : (
              <>
                <p className="text-sm text-green-400 mb-2">
                  {scanResult.length} produto(s) identificados e movidos para Genéricos (ver Catálogo &gt; Via Substância):
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                  {scanResult.map((n) => (
                    <span key={n} className="text-xs bg-slate-800 rounded-full px-2 py-1">
                      {n}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
