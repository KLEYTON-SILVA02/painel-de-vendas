import { useMemo, useState } from 'react';
import { PageLoading } from '../../components/PageLoading';
import { useAuth } from '../../auth/AuthContext';
import { SimpleSheetImportPanel } from '../../components/admin/SimpleSheetImportPanel';
import { useCategoryLabelMap } from '../../lib/business/categoryLabels';
import {
  CAT_KEYS,
  classifyProductTier,
  matchesGenericSubstance,
  normalizeCategoriaImport,
  type CategoryKey,
} from '../../lib/business/classification';
import { normalize } from '../../lib/business/normalize';
import { buildClassificationInputs } from '../../lib/mappers';
import { fmtMoney } from '../../lib/format';
import { useBulkInsertGenericSubstances, useBulkInsertProducts, useDeleteRow, useInsertRow, useReclassifyProdutos, useUpdateRow } from '../../lib/mutations';
import { useBrandKeywords, useCatalog, useExclusiveBrands, useGenericSubstances, useProducts, useSales } from '../../lib/queries';

type Tab = 'produtos' | 'catalogo' | 'classificados' | 'palavras' | 'exclusivas' | 'substancias';
const TABS: { id: Tab; label: string }[] = [
  { id: 'produtos', label: 'Produtos' },
  { id: 'catalogo', label: 'Catálogo' },
  { id: 'classificados', label: 'Classificados' },
  { id: 'palavras', label: 'Palavras-chave' },
  { id: 'exclusivas', label: 'Marcas Excl.' },
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
        </div>
      </div>

      {tab === 'produtos' && <ProdutosTab group={group} setGroup={setGroup} />}
      {tab === 'catalogo' && <CatalogoTab />}
      {tab === 'classificados' && <ClassificadosTab />}
      {tab === 'palavras' && <PalavrasTab group={group} setGroup={setGroup} />}
      {tab === 'exclusivas' && <ExclusivasTab />}
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
  const insertCatalog = useInsertRow('catalog', profile?.store_id, 'catalog');
  const deleteCatalog = useDeleteRow('catalog', 'catalog');
  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [categoria, setCategoria] = useState<CategoryKey>('DERM');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Cadastrados (manual) e Via Substância (inseridos pela varredura da aba
  // Substâncias, ver SubstanciasTab) ficam na mesma tabela `catalog` e
  // valem igualmente como Tier 1 — só a listagem é separada, para que os
  // dois grupos não se misturem visualmente ("ficará isolado", como pedido).
  const [origemTab, setOrigemTab] = useState<'manual' | 'substancia'>('manual');

  if (!catalog) return <PageLoading />;
  const manualCount = catalog.filter((c) => c.origem !== 'substancia').length;
  const substanciaCount = catalog.length - manualCount;
  const list = catalog.filter((c) => (origemTab === 'substancia' ? c.origem === 'substancia' : c.origem !== 'substancia'));

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
              Cadastrados ({manualCount})
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
              Via Substância ({substanciaCount})
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
            {origemTab === 'substancia' ? 'Nenhum item identificado via substância ainda.' : 'Nenhum item cadastrado.'}
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategoria, setBulkCategoria] = useState<CategoryKey>('DERM');
  const [ordem, setOrdem] = useState<'ocorrencias' | 'alfabetica'>('ocorrencias');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 500;

  // classifyProductTier() runs once per distinct product across the
  // *entire* sales history here (thousands of products × the full
  // keyword-matching pass) — without this memo it re-ran from scratch on
  // every render of this tab (ticking a checkbox, changing the sort order,
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
  }, [sales, catalog, products, brandKeywords, exclusiveBrands]);

  if (!sales || !catalog || !products || !brandKeywords || !exclusiveBrands || !classifiedProducts) {
    return <PageLoading />;
  }

  let list = classifiedProducts.slice().sort((a, b) =>
    ordem === 'alfabetica' ? a.produto.localeCompare(b.produto, 'pt-BR') : b.ocorrencias - a.ocorrencias,
  );
  if (filtro !== 'ALL') list = list.filter((p) => p.categoria === filtro);
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages - 1);
  const pageList = list.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE);

  async function reclassify(produtoNomes: string[], categoria: CategoryKey) {
    // Also retroactively updates every already-imported sale for these
    // products (sales.grupo) — updating only `catalog` fixes future imports
    // but leaves the value already sold stuck under the old category
    // forever, since sales.grupo is written once at import time and never
    // recomputed on its own. Without this, the totals shown for each
    // category would never reflect a reclassification made here.
    await reclassifyMutation.mutateAsync({ produtos: produtoNomes, categoria, catalog: catalog!, sales: sales! });
    setSelected(new Set());
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
        <div className="flex flex-wrap gap-1">
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
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
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
          <div className="text-sm text-slate-500 py-4 text-center">Nenhum produto encontrado. Importe uma planilha de vendas primeiro.</div>
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
                      <span className="bg-slate-800 rounded-full px-2 py-0.5">{CAT_LABEL[p.categoria]}</span>
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
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-slate-500">
                  Página {pageSafe + 1} de {totalPages} — mostrando {pageList.length} de {list.length} produtos
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={pageSafe === 0}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-40"
                  >
                    ← Anterior
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={pageSafe >= totalPages - 1}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-40"
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

function PalavrasTab({ group, setGroup }: { group: CategoryKey; setGroup: (k: CategoryKey) => void }) {
  const CAT_LABEL = useCategoryLabelMap();
  const { profile } = useAuth();
  const { data: brandKeywords } = useBrandKeywords();
  const insertKw = useInsertRow('brand_keywords', profile?.store_id, 'brand_keywords');
  const deleteKw = useDeleteRow('brand_keywords', 'brand_keywords');
  const [kw, setKw] = useState('');

  if (!brandKeywords) return <PageLoading />;
  const groupKeywords = brandKeywords.filter((b) => b.categoria === group);

  function handleAdd() {
    if (!kw.trim()) return;
    insertKw.mutate({ categoria: group, palavra: kw.trim() } as never);
    setKw('');
  }

  return (
    <>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <CategoryTabs group={group} setGroup={setGroup} />
        <p className="text-xs text-slate-500">
          Tier 3 — palavras-chave de marca por categoria. Para <b>Genérico</b>, o nome do produto
          também precisa conter um marcador de genérico (ex: "generico", "similar", "gen", "gn").
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
        <MutationError error={insertKw.error} />
        <div className="flex flex-wrap gap-1.5">
          {groupKeywords.length === 0 ? (
            <span className="text-xs text-slate-500">Nenhuma palavra-chave cadastrada.</span>
          ) : (
            groupKeywords.map((k) => (
              <span key={k.id} className="text-xs bg-slate-800 rounded-full px-2 py-1 flex items-center gap-1.5">
                {k.palavra}
                <button onClick={() => deleteKw.mutate(k.id)} className="text-slate-500 hover:text-rose-400">
                  ✕
                </button>
              </span>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function ExclusivasTab() {
  const { profile } = useAuth();
  const { data: exclusiveBrands } = useExclusiveBrands();
  const insertBrand = useInsertRow('exclusive_brands', profile?.store_id, 'exclusive_brands');
  const deleteBrand = useDeleteRow('exclusive_brands', 'exclusive_brands');
  const [palavra, setPalavra] = useState('');

  if (!exclusiveBrands) return <PageLoading />;

  function handleAdd() {
    if (!palavra.trim()) return;
    insertBrand.mutate({ palavra: palavra.trim() } as never);
    setPalavra('');
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="font-semibold mb-1 text-sm">Marcas Exclusivas (recategorização automática)</h3>
      <p className="text-xs text-slate-500 mb-3">
        Produtos cujo nome contém qualquer uma destas palavras são <b>sempre</b> reclassificados como Marcas
        Exclusivas (MP), mesmo que já tenham caído em outra categoria pelas regras acima.
      </p>
      <div className="flex gap-2 mb-3 max-w-md">
        <input value={palavra} onChange={(e) => setPalavra(e.target.value)} className="input flex-1" />
        <button onClick={handleAdd} className="rounded-md bg-amber-500 text-slate-950 px-4 py-1.5 text-sm font-medium">
          + Adicionar
        </button>
      </div>
      <MutationError error={insertBrand.error} />
      <div className="flex flex-wrap gap-1.5">
        {exclusiveBrands.map((b) => (
          <span key={b.id} className="text-xs bg-slate-800 rounded-full px-2 py-1 flex items-center gap-1.5">
            {b.palavra.toUpperCase()}
            <button onClick={() => deleteBrand.mutate(b.id)} className="text-slate-500 hover:text-rose-400">
              ✕
            </button>
          </span>
        ))}
      </div>
    </div>
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
  const insertSubstance = useInsertRow('generic_substances', profile?.store_id, 'generic_substances');
  const bulkInsertSubstances = useBulkInsertGenericSubstances(profile?.store_id);
  const deleteSubstance = useDeleteRow('generic_substances', 'generic_substances');
  const reclassify = useReclassifyProdutos(profile?.store_id);
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
