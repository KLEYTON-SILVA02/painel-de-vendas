import { useEffect, useMemo, useRef, useState } from 'react';
import { PageLoading } from '../../components/PageLoading';
import { useAuth } from '../../auth/AuthContext';
import { HelpTip } from '../../components/HelpTip';
import { SimpleSheetImportPanel } from '../../components/admin/SimpleSheetImportPanel';
import { MetricsFilterBar, type MfbStatCard } from '../../components/MetricsFilterBar';
import { DateRangeProvider, useDateRange } from '../DateRangeContext';
import { todayISO } from '../../lib/dateRange';
import { CATEGORY_COLOR, useCategoryLabelMap } from '../../lib/business/categoryLabels';
import {
  CAT_KEYS,
  classifyProductTier,
  GENERIC_MARKERS,
  matchesGenericSubstance,
  normalizeCategoriaImport,
  type CategoryKey,
} from '../../lib/business/classification';
import { aggregateClassifiedProductsChunk, type ClassifiedProductAgg } from '../../lib/business/classifiedProductsAggregate';
import { suggestKeyword } from '../../lib/business/keywordSuggestion';
import { normalize } from '../../lib/business/normalize';
import type { Sale } from '../../lib/business/types';
import { buildClassificationInputs } from '../../lib/mappers';
import { fmtDateBR, fmtMoney } from '../../lib/format';
import { isMobileDevice } from '../../lib/whatsapp';
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
      {tab === 'palavras' && <PalavrasTab />}
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
  // Lista compacta (AJUSTE 1) — um produto só expande pra mostrar as
  // palavras-chave quando o ADM clica nele, em vez de todo produto já vir
  // com seu card + chips aberto. Com milhares de produtos (ex.: 2292 em
  // Dermocosméticos), essa é a maior parte do peso de DOM da tela.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (!products) return <PageLoading />;
  const groupProducts = products.filter((p) => p.categoria === group);
  const sugestaoAutomatica = suggestKeyword(nome);

  function handleAdd() {
    if (!nome.trim()) return;
    insertProduct.mutate({ categoria: group, nome: nome.trim(), padrao: padrao.trim() || null, palavras: [padrao.trim() || nome.trim()] } as never);
    setNome('');
    setCodigo('');
    setPadrao('');
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addKeyword(productId: string, currentPalavras: string[], explicit?: string) {
    const kw = (explicit ?? kwDrafts[productId] ?? '').trim();
    if (!kw) return;
    updateProduct.mutate({ id: productId, patch: { palavras: [...currentPalavras, kw] } });
    if (!explicit) setKwDrafts((prev) => ({ ...prev, [productId]: '' }));
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
            <input
              value={padrao}
              onChange={(e) => setPadrao(e.target.value)}
              placeholder={sugestaoAutomatica || undefined}
              className="input"
            />
            {sugestaoAutomatica && !padrao && (
              <button
                type="button"
                onClick={() => setPadrao(sugestaoAutomatica)}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 mt-1"
                title="Sugestão automática por regra fixa (maior trecho do nome, ignorando números/unidades) — confira antes de usar."
              >
                Usar sugestão: "{sugestaoAutomatica}"
              </button>
            )}
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
          <div className="flex flex-col gap-1 max-h-[70vh] overflow-y-auto">
            {groupProducts.map((p) => {
              const isOpen = expanded.has(p.id);
              const sugestao = isOpen ? suggestKeyword(p.nome) : null;
              const jaTemSugestao = sugestao ? p.palavras.some((kw) => normalize(kw) === normalize(sugestao)) : true;
              return (
                <div key={p.id} className="rounded-lg bg-slate-950/60 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(p.id)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
                  >
                    <span className="text-sm truncate">{p.nome}</span>
                    <span className="flex items-center gap-2 shrink-0 text-xs text-slate-500">
                      {p.palavras.length} palavra(s)
                      <span className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 border-t border-slate-800 pt-2">
                      <div className="flex items-center justify-end mb-2">
                        <button onClick={() => deleteProduct.mutate(p.id)} className="text-xs text-slate-500 hover:text-rose-400">
                          ✕ Excluir produto
                        </button>
                      </div>
                      <div className="text-xs text-slate-500 mb-1">Palavras-chave:</div>
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
                        {sugestao && !jaTemSugestao && (
                          <button
                            type="button"
                            onClick={() => addKeyword(p.id, p.palavras, sugestao)}
                            className="text-xs rounded-full px-2 py-1 border border-cyan-500/60 text-cyan-400"
                            title="Sugestão automática por regra fixa — confira antes de usar."
                          >
                            + Sugestão: {sugestao}
                          </button>
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
                  )}
                </div>
              );
            })}
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
          // AJUSTE 2 — duas colunas lado a lado em telas largas para
          // aproveitar o espaço horizontal (uma coluna em mobile). Split
          // simples primeira-metade/segunda-metade, não intercalado — lê
          // como duas colunas de jornal, de cima pra baixo em cada uma.
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {splitInHalf(list).map((half, i) => (
              <div key={i} className="overflow-x-auto">
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
                    {half.map((c) => (
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
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/** Split a list into two halves (not interleaved) for a two-column layout —
 * first half reads top-to-bottom in column 1, then continues in column 2,
 * like a newspaper. Returns a single-element array (no second column) when
 * the list is too short to bother splitting. */
function splitInHalf<T>(list: T[]): T[][] {
  if (list.length < 2) return [list];
  const half = Math.ceil(list.length / 2);
  return [list.slice(0, half), list.slice(half)];
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
/** Same export/import logic as before, pulled out of its own card (AJUSTE
 * 3d — the triggers become small icon buttons living in the product list's
 * header, opposite corner from the main action buttons, instead of a
 * separate full-width card) so the two pieces that need this state —
 * ExportImportIcons (the buttons + export confirmation popup) and
 * ExportImportDiffPanel (the import-review table, only rendered once
 * there's something to show) — can be placed in different spots of the
 * page while sharing one source of truth. */
function useExportImportCatalogo({
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
  const [exportError, setExportError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [ignorados, setIgnorados] = useState(0);
  const [diffs, setDiffs] = useState<{ produto: string; atual: CategoryKey; proposta: CategoryKey }[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      const XLSX = await import('xlsx');
      const rows = produtosVisiveis.map((p) => ({ Produto: p.produto, Categoria: CAT_LABEL[p.categoria] }));
      const ws = XLSX.utils.json_to_sheet(rows, { header: ['Produto', 'Categoria'] });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Classificados');
      const filename = `classificados-${new Date().toISOString().slice(0, 10)}.xlsx`;

      // XLSX.writeFile's browser path relies on an <a download> click, which
      // mobile contexts (iOS Safari in standalone/PWA mode, an in-app
      // WebView) often ignore with no error and no visible effect — exactly
      // the "não consigo exportar" symptom, since the old code also had no
      // catch to surface it. Same device-share fallback already proven for
      // file delivery on mobile elsewhere in the app (shareImageToWhatsApp,
      // src/lib/whatsapp.ts): hand the generated file to the OS share sheet,
      // which works in those same contexts.
      if (isMobileDevice()) {
        const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
        const file = new File([buffer], filename, {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
        if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
          await nav.share({ files: [file] });
          return;
        }
      }
      XLSX.writeFile(wb, filename);
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        setExportError('Não foi possível exportar a planilha neste dispositivo. Tente novamente.');
      }
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

  return {
    CAT_LABEL,
    fileInputRef,
    exporting,
    exportError,
    fileName,
    reading,
    importError,
    ignorados,
    diffs,
    selected,
    progress,
    exportConfirmOpen,
    setExportConfirmOpen,
    produtosVisiveis,
    handleExport,
    handleFile,
    handleApply,
    toggle,
    setSelected,
  };
}

type ExportImportState = ReturnType<typeof useExportImportCatalogo>;

/** Estimativa grosseira de tamanho do .xlsx — cada linha (nome + categoria)
 * gira em torno de 60-90 bytes de conteúdo real, mas o formato .xlsx
 * (XML comprimido + overhead de zip/estrutura) tem um piso de alguns KB
 * mesmo para poucas linhas. Suficiente para dar uma ideia antes de gerar
 * o arquivo — não precisa ser exato. */
function estimateXlsxSizeLabel(rows: number): string {
  const bytes = 6_000 + rows * 70;
  const mb = bytes / (1024 * 1024);
  return mb < 0.1 ? '< 0,1 MB' : `~${mb.toFixed(1)} MB`;
}

/** Export/Import como botões-ícone pequenos (AJUSTE 3d) — ficam no canto
 * oposto aos botões principais da lista (ordenar/aplicar aos
 * selecionados), com um respiro visual (gap) entre os dois grupos. Export
 * abre um popup de confirmação com quantidade/data/tamanho estimado antes
 * de gerar o arquivo. */
function ExportImportIcons({ s }: { s: ExportImportState }) {
  return (
    <>
      <div className="flex items-center gap-1.5 ml-3 pl-3 border-l border-slate-800">
        <button
          type="button"
          onClick={() => s.setExportConfirmOpen(true)}
          disabled={s.exporting || s.produtosVisiveis.length === 0}
          title="Exportar planilha"
          className="rounded-md border border-slate-700 w-8 h-8 flex items-center justify-center text-sm text-slate-300 disabled:opacity-50"
        >
          ⬇️
        </button>
        <input
          ref={s.fileInputRef}
          type="file"
          accept=".xlsx,.xls,.xlsm,.csv,.ods"
          onChange={(e) => e.target.files?.[0] && s.handleFile(e.target.files[0])}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          onClick={() => s.fileInputRef.current?.click()}
          disabled={s.reading}
          title="Importar planilha para comparar"
          className="rounded-md border border-slate-700 w-8 h-8 flex items-center justify-center text-sm text-slate-300 disabled:opacity-50"
        >
          ⬆️
        </button>
      </div>

      {s.exportConfirmOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => s.setExportConfirmOpen(false)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-sm mb-3">⬇️ Exportar planilha</h3>
            <div className="text-xs text-slate-300 flex flex-col gap-1.5 mb-4">
              <p>
                Produtos na lista atual: <b>{s.produtosVisiveis.length}</b>
              </p>
              <p>
                Data: <b>{fmtDateBR(todayISO())}</b>
              </p>
              <p>
                Tamanho estimado: <b>{estimateXlsxSizeLabel(s.produtosVisiveis.length)}</b>
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => s.setExportConfirmOpen(false)} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300">
                Cancelar
              </button>
              <button
                onClick={async () => {
                  await s.handleExport();
                  s.setExportConfirmOpen(false);
                }}
                disabled={s.exporting}
                className="rounded-md bg-amber-500 text-slate-950 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {s.exporting ? 'Gerando…' : 'Confirmar e exportar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Resultado da importação (erros, progresso, divergências pra aprovar) —
 * só ocupa espaço na tela quando há algo pra mostrar. */
function ExportImportDiffPanel({ s }: { s: ExportImportState }) {
  if (!s.exportError && !s.importError && !s.progress && !s.diffs) return null;
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      {s.exportError && <p className="text-xs text-rose-400 mb-2">{s.exportError}</p>}
      {s.importError && <p className="text-xs text-rose-400 mb-2">{s.importError}</p>}

      {s.progress && (
        <div className="mb-3">
          <div style={{ height: 6, borderRadius: 6, background: '#0f172a', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.round((s.progress.done / s.progress.total) * 100)}%`,
                background: 'linear-gradient(90deg, #00f0ff, #a82bff)',
                transition: 'width 0.2s ease',
              }}
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Aplicando… {s.progress.done} de {s.progress.total} produto(s)
          </p>
        </div>
      )}

      {s.diffs &&
        (s.diffs.length === 0 ? (
          <div className="text-xs text-slate-500 py-2">
            Nenhuma diferença encontrada — a planilha já bate com a classificação atual.
            {s.ignorados > 0 && ` (${s.ignorados} produto(s) da planilha não foram encontrados no sistema e foram ignorados.)`}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-slate-500">
                {s.diffs.length} divergência(s) encontrada(s)
                {s.ignorados > 0 && ` · ${s.ignorados} produto(s) não encontrado(s), ignorado(s)`}. Marque as que quer
                aplicar.
              </p>
              <button
                onClick={s.handleApply}
                disabled={s.selected.size === 0 || !!s.progress}
                className="rounded-md bg-amber-500 text-slate-950 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                Aplicar selecionadas ({s.selected.size})
              </button>
            </div>
            <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-lg border border-slate-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-800 sticky top-0 bg-slate-950">
                    <th className="py-1.5 px-2">
                      <input
                        type="checkbox"
                        checked={s.diffs.every((d) => s.selected.has(d.produto))}
                        onChange={(e) => s.setSelected(e.target.checked ? new Set(s.diffs!.map((d) => d.produto)) : new Set())}
                      />
                    </th>
                    <th className="py-1.5 px-2">Produto</th>
                    <th className="py-1.5 px-2">Categoria atual</th>
                    <th className="py-1.5 px-2">Categoria na planilha</th>
                  </tr>
                </thead>
                <tbody>
                  {s.diffs.map((d) => (
                    <tr key={d.produto} className="border-b border-slate-900">
                      <td className="py-1.5 px-2">
                        <input type="checkbox" checked={s.selected.has(d.produto)} onChange={() => s.toggle(d.produto)} />
                      </td>
                      <td className="py-1.5 px-2">{d.produto}</td>
                      <td className="py-1.5 px-2">
                        <span style={{ color: CATEGORY_COLOR[d.atual] }}>{s.CAT_LABEL[d.atual]}</span>
                      </td>
                      <td className="py-1.5 px-2">
                        <span style={{ color: CATEGORY_COLOR[d.proposta] }}>{s.CAT_LABEL[d.proposta]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
    </div>
  );
}

const CLASSIFY_CHUNK_SIZE = 1500;

type BuildInputsParams = Parameters<typeof buildClassificationInputs>;

/** Same aggregation this tab always ran in one synchronous pass over
 * `sales` — now split so a SMALL filtered slice (the common case, since
 * the view below defaults to a single day) still resolves synchronously
 * via useMemo, with zero extra render/flash, while a LARGE one (a wider
 * period deliberately chosen) runs through chunks with a yield between
 * them in an effect, so it can't block the main thread long enough to
 * freeze the tab (previously measured at 12-20s). `progress` is non-null
 * only while a chunked run is in flight — that's what drives the
 * full-screen pause overlay below. */
function useChunkedClassification(
  sales: Sale[] | undefined,
  catalog: BuildInputsParams[0] | undefined,
  products: BuildInputsParams[1] | undefined,
  brandKeywords: BuildInputsParams[2] | undefined,
  exclusiveBrands: BuildInputsParams[3] | undefined,
  dateFrom: string,
  dateTo: string,
) {
  const filtered = useMemo(() => {
    if (!sales) return null;
    return sales.filter((s) => !!s.produto && !(s.dataISO && (s.dataISO < dateFrom || s.dataISO > dateTo)));
  }, [sales, dateFrom, dateTo]);

  const inputs = useMemo(() => {
    if (!catalog || !products || !brandKeywords || !exclusiveBrands) return null;
    return buildClassificationInputs(catalog, products, brandKeywords, exclusiveBrands);
  }, [catalog, products, brandKeywords, exclusiveBrands]);

  const syncResult = useMemo(() => {
    if (!filtered || !inputs || filtered.length > CLASSIFY_CHUNK_SIZE) return null;
    const map = new Map<string, ClassifiedProductAgg>();
    aggregateClassifiedProductsChunk(filtered, 0, filtered.length, inputs, map);
    return Array.from(map.values());
  }, [filtered, inputs]);

  const [chunkedResult, setChunkedResult] = useState<ClassifiedProductAgg[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const runRef = useRef(0);

  useEffect(() => {
    if (!filtered || !inputs || filtered.length <= CLASSIFY_CHUNK_SIZE) {
      setChunkedResult(null);
      setProgress(null);
      return;
    }
    const runId = ++runRef.current;
    const map = new Map<string, ClassifiedProductAgg>();
    setChunkedResult(null);
    setProgress({ done: 0, total: filtered.length });
    let i = 0;
    const step = () => {
      if (runRef.current !== runId) return;
      const end = Math.min(i + CLASSIFY_CHUNK_SIZE, filtered.length);
      aggregateClassifiedProductsChunk(filtered, i, end, inputs, map);
      i = end;
      if (i < filtered.length) {
        setProgress({ done: i, total: filtered.length });
        setTimeout(step, 0);
      } else {
        setProgress(null);
        setChunkedResult(Array.from(map.values()));
      }
    };
    setTimeout(step, 0);
  }, [filtered, inputs]);

  return { data: syncResult ?? chunkedResult, progress };
}

/** Cobre a tela inteira e bloqueia qualquer clique enquanto uma
 * classificação grande está sendo processada em pedaços — o "modo de
 * pausa" pedido pelo usuário. É só uma camada visual: nenhuma lógica de
 * negócio nem gravação no banco depende disso, e os próprios controles de
 * reclassificar ficam bloqueados de graça, porque esta camada cobre a
 * tela toda, inclusive eles. */
function PauseOverlay({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div
      className="fixed inset-0 z-[200] bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center gap-3 px-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-xs">
        <div style={{ height: 8, borderRadius: 8, background: '#0f172a', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #00f0ff, #a82bff)',
              transition: 'width 0.15s ease',
            }}
          />
        </div>
      </div>
      <p className="text-sm text-slate-200">
        Carregando produtos… {done} de {total}
      </p>
      <p className="text-xs text-slate-500 text-center max-w-xs">
        Processando em partes para não travar o navegador — aguarde um instante.
      </p>
    </div>
  );
}

function ClassificadosTab() {
  // Instância LOCAL do date-range, independente do contexto global usado
  // pelo Dashboard/Ranking/Metas/DSM (DateRangeProvider já envolve toda a
  // árvore do admin) — trocar o dia aqui não deve mudar o que essas outras
  // telas mostram quando o ADM voltar pra elas. Começa já em "hoje"
  // (Ideia A da análise), em vez do padrão de mês inteiro que as outras
  // telas usam.
  return (
    <DateRangeProvider initialDay={todayISO()}>
      <ClassificadosInner />
    </DateRangeProvider>
  );
}

function ClassificadosInner() {
  const CAT_LABEL = useCategoryLabelMap();
  const { data: sales } = useSales();
  const { data: catalog } = useCatalog();
  const { data: products } = useProducts();
  const { data: brandKeywords } = useBrandKeywords();
  const { data: exclusiveBrands } = useExclusiveBrands();
  const { profile } = useAuth();
  const reclassifyMutation = useReclassifyProdutos(profile?.store_id);
  // Escopo de VISUALIZAÇÃO (dia/período escolhido no MetricsFilterBar) —
  // controla só o que é processado/exibido, por performance.
  const { dashFrom: viewFrom, dashTo: viewTo } = useDateRange();
  const [filtro, setFiltro] = useState<CategoryKey | 'ALL'>('ALL');
  const [busca, setBusca] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategoria, setBulkCategoria] = useState<CategoryKey>('DERM');
  const [ordem, setOrdem] = useState<'ocorrencias' | 'alfabetica' | 'valor'>('ocorrencias');
  const [page, setPage] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  // Escopo da CORREÇÃO retroativa — campo separado e colapsado por padrão
  // (AJUSTE 3b), de propósito independente do escopo de visualização
  // acima: em branco (o padrão) continua corrigindo todo o histórico
  // disponível do produto, igual ao comportamento de sempre, mesmo que a
  // visualização esteja mostrando só o dia de hoje. Só restringe a
  // correção quando o ADM abre este painel e escolhe um período aqui.
  const [restrictOpen, setRestrictOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dermoScanning, setDermoScanning] = useState(false);
  const [dermoSuggestions, setDermoSuggestions] = useState<string[] | null>(null);
  const [dateLookupProduto, setDateLookupProduto] = useState<string | null>(null);
  const PAGE_SIZE = 500;

  const { data: classifiedProducts, progress } = useChunkedClassification(
    sales,
    catalog,
    products,
    brandKeywords,
    exclusiveBrands,
    viewFrom,
    viewTo,
  );

  // Datas de venda do produto aberto em "Ver datas" — um dia por linha, com
  // qtd/valor somados quando o mesmo produto vendeu mais de uma vez no
  // mesmo dia. Respeita o mesmo escopo de visualização da tabela acima
  // (senão os totais da linha e a lista de datas do modal se
  // contradiriam). Só calcula quando o modal está de fato aberto —
  // `sales` tem dezenas de milhares de linhas, não vale a pena rodar isso
  // a cada clique na tabela.
  const dateLookupRows = useMemo(() => {
    if (!dateLookupProduto || !sales) return null;
    const map = new Map<string, { dataISO: string; qtd: number; valor: number }>();
    sales.forEach((s) => {
      if (s.produto !== dateLookupProduto) return;
      if (s.dataISO && (s.dataISO < viewFrom || s.dataISO > viewTo)) return;
      const key = s.dataISO ?? '—';
      const existing = map.get(key);
      if (existing) {
        existing.qtd += s.qtd;
        existing.valor += s.valor;
      } else {
        map.set(key, { dataISO: key, qtd: s.qtd, valor: s.valor });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.dataISO.localeCompare(a.dataISO));
  }, [dateLookupProduto, sales, viewFrom, viewTo]);

  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<CategoryKey, number>> = {};
    (classifiedProducts ?? []).forEach((p) => {
      counts[p.categoria] = (counts[p.categoria] ?? 0) + 1;
    });
    return counts;
  }, [classifiedProducts]);

  let list = (classifiedProducts ?? []).slice().sort((a, b) =>
    ordem === 'alfabetica'
      ? a.produto.localeCompare(b.produto, 'pt-BR')
      : ordem === 'valor'
        ? b.valor - a.valor
        : b.ocorrencias - a.ocorrencias,
  );
  if (filtro !== 'ALL') list = list.filter((p) => p.categoria === filtro);
  const buscaNormalizada = normalize(busca.trim());
  if (buscaNormalizada) list = list.filter((p) => normalize(p.produto).includes(buscaNormalizada));

  const exportImport = useExportImportCatalogo({
    produtosVisiveis: list,
    produtosCompletos: classifiedProducts ?? [],
    catalog: catalog ?? [],
    sales: sales ?? [],
    reclassifyMutation,
  });

  if (!sales || !catalog || !products || !brandKeywords || !exclusiveBrands) {
    return <PageLoading />;
  }

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
    // the "Restringir correção" field below when the ADM opened it and set
    // one — em branco (o padrão) continua corrigindo todo o histórico do
    // produto, independente de qual dia/período está sendo VISUALIZADO.
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
      const candidates = (classifiedProducts ?? [])
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

  const statCards: MfbStatCard[] = CAT_KEYS.map((k) => ({
    label: CAT_LABEL[k],
    value: String(categoryCounts[k] ?? 0),
    color: CATEGORY_COLOR[k],
  }));

  return (
    <>
      {progress && <PauseOverlay done={progress.done} total={progress.total} />}

      <MetricsFilterBar statCards={statCards} />

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-1 text-sm">Produtos classificados (a partir das vendas importadas)</h3>
        <button
          type="button"
          onClick={() => setInfoOpen((v) => !v)}
          className="text-xs text-cyan-400 hover:text-cyan-300 mb-2"
        >
          {infoOpen ? '▾ Ocultar explicação' : '▸ Como funciona a reclassificação'}
        </button>
        {infoOpen && (
          <p className="text-xs text-slate-500 mb-3">
            Mostra cada produto distinto que já apareceu numa venda, com a categoria que o sistema atribuiu. Selecione
            um ou mais e reclassifique — isso cria/atualiza entradas no Catálogo (prioridade máxima) e{' '}
            <b>também transfere retroativamente o valor de todas as vendas já importadas desse produto</b> da
            categoria antiga para a nova. Ex.: se um produto estava em Marcas Exclusivas mas pertence a
            Dermocosméticos, ao reclassificá-lo o valor sai do total de Marcas Exclusivas e passa a contar em
            Dermocosméticos — em rankings, comissões e no Dashboard.
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 mb-3">
          {(['ALL', ...CAT_KEYS] as const).map((k) => (
            <button
              key={k}
              onClick={() => {
                setFiltro(k);
                setPage(0);
              }}
              className={`w-full rounded-lg px-3 py-1.5 text-xs ${filtro === k ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
            >
              {k === 'ALL' ? 'Todos' : CAT_LABEL[k]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setRestrictOpen((v) => !v)}
          className="text-xs text-cyan-400 hover:text-cyan-300"
        >
          {restrictOpen ? '▾ Ocultar' : '▸'} Restringir a correção a um período específico {dateFrom || dateTo ? `(ativo: ${dateFrom || '…'} a ${dateTo || '…'})` : '(opcional)'}
        </button>
        {restrictOpen && (
          <div className="flex flex-wrap items-end gap-3 mt-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1">De</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Até</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input" />
            </div>
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300">
                Limpar
              </button>
            )}
            <p className="text-[11px] text-slate-500 max-w-xs">
              Em branco (o padrão) = a reclassificação corrige todo o histórico disponível do produto, mesmo que a
              lista acima esteja mostrando só o dia de hoje. Defina um período aqui só se quiser restringir a
              correção a ele — igual à Auditoria.
            </p>
          </div>
        )}
      </div>

      <ExportImportDiffPanel s={exportImport} />

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
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-xs text-slate-500">{list.length} produto(s)</div>
            <select
              value={ordem}
              onChange={(e) => {
                setOrdem(e.target.value as 'ocorrencias' | 'alfabetica' | 'valor');
                setPage(0);
              }}
              className="input"
              title="Ordenar por"
            >
              <option value="ocorrencias">Mais vendidos</option>
              <option value="valor">Maior valor (R$)</option>
              <option value="alfabetica">A-Z</option>
            </select>
            <button
              onClick={handleScanDermo}
              disabled={dermoScanning}
              className="rounded-md border border-pink-500/60 text-pink-400 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              title="Procura, entre os produtos já classificados em outra categoria, quem também bate com alguma palavra/padrão de Dermocosméticos. Só sugere — nada é reclassificado sem confirmar."
            >
              {dermoScanning ? 'Analisando…' : '🔍 Analisar Dermos'}
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
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
            <ExportImportIcons s={exportImport} />
          </div>
        </div>
        {dermoSuggestions && (
          <div className="mb-3">
            {dermoSuggestions.length === 0 ? (
              <div className="text-xs text-slate-500 py-2">Nenhuma sugestão encontrada — nada fora do lugar.</div>
            ) : (
              <div className="flex flex-col gap-1.5">
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
          </div>
        )}
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
                  <th className="py-1.5 pr-3">Datas</th>
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
                      <button
                        type="button"
                        onClick={() => setDateLookupProduto(p.produto)}
                        className="rounded-md border border-cyan-500/60 text-cyan-400 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
                      >
                        📅 Ver datas
                      </button>
                    </td>
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

      {dateLookupProduto && (
        <DateLookupModal
          produto={dateLookupProduto}
          rows={dateLookupRows}
          onClose={() => setDateLookupProduto(null)}
        />
      )}
    </>
  );
}

/** Modal da função "Ver datas" (ClassificadosTab) — lista cada dia em que o
 * produto vendeu, dentro do mesmo filtro De/Até da tela. Período em branco
 * só enxerga o mês vigente: vendas de meses anteriores já viraram subtotal
 * (REGRA 2, ver CLAUDE.md) e não têm mais detalhe por produto/dia. */
function DateLookupModal({
  produto,
  rows,
  onClose,
}: {
  produto: string;
  rows: { dataISO: string; qtd: number; valor: number }[] | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="font-semibold text-sm">📅 Datas de venda</h3>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-rose-400" title="Fechar">
            ✕
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-3">{produto}</p>
        {!rows || rows.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            Nenhuma venda deste produto no período filtrado. Vendas de meses anteriores ao vigente só ficam
            guardadas como subtotal, sem data por produto.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-800">
                <th className="py-1.5 pr-3">Data</th>
                <th className="py-1.5 pr-3 text-right">Qtd</th>
                <th className="py-1.5 pr-3 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.dataISO} className="border-b border-slate-900">
                  <td className="py-1.5 pr-3 font-mono">{r.dataISO === '—' ? '—' : fmtDateBR(r.dataISO)}</td>
                  <td className="py-1.5 pr-3 font-mono text-right">{r.qtd}</td>
                  <td className="py-1.5 pr-3 font-mono text-right">{fmtMoney(r.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
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
 * classificados hoje — por isso a fusão aqui é só de tela: quando a coluna é
 * Marcas Exclusivas, ela lê/escreve em `exclusive_brands` (a mesma tabela
 * que a extinta aba já usava) em vez de `brand_keywords`; as outras 2
 * colunas continuam exatamente como antes.
 *
 * AJUSTE 4 — "Mercadoria Geral" (MER) nunca aparece aqui: é só o destino
 * automático de quem não bate com nenhuma categoria (normalizeCategoriaImport),
 * nunca teve palavra-chave própria pra cadastrar. E em vez de abas que
 * trocam qual grupo está visível, as 3 categorias que de fato têm
 * palavra-chave (Dermo/Genérico/Marcas Exclusivas) ficam em 3 colunas
 * simultâneas — cada uma com seu próprio estado (PalavrasColumn), igual à
 * lógica de sempre, só exibida em paralelo em vez de uma por vez. */
const PALAVRAS_CATEGORIES: readonly CategoryKey[] = ['DERM', 'GEN', 'MP'];

function PalavrasTab() {
  return (
    <>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="text-xs text-slate-500">
          Tier 3 — palavras-chave de marca por categoria. Para <b>Genérico</b>, o nome do produto também precisa
          conter um marcador de genérico (ex: "generico", "similar", "gen", "gn"). <b>Marcas Exclusivas</b> funciona
          diferente das outras duas: qualquer palavra cadastrada ali sempre vence, mesmo sobre uma categoria já
          definida por outra regra.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {PALAVRAS_CATEGORIES.map((categoria) => (
          <PalavrasColumn key={categoria} categoria={categoria} />
        ))}
      </div>
    </>
  );
}

function PalavrasColumn({ categoria }: { categoria: CategoryKey }) {
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

  if (!brandKeywords || !exclusiveBrands) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <PageLoading />
      </div>
    );
  }
  const isMP = categoria === 'MP';
  const groupKeywords = isMP ? exclusiveBrands : brandKeywords.filter((b) => b.categoria === categoria);
  const insertMutation = isMP ? insertExclusive : insertKw;
  const deleteMutation = isMP ? deleteExclusive : deleteKw;
  const dadosProntos = !!sales && !!catalog;

  function handleAdd() {
    if (!kw.trim()) return;
    if (isMP) {
      insertExclusive.mutate({ palavra: kw.trim() } as never);
    } else {
      insertKw.mutate({ categoria, palavra: kw.trim() } as never);
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
          if (categoria === 'GEN' && !GENERIC_MARKERS.some((m) => n.includes(m.trim()))) return;
          const existing = porProduto.get(n);
          if (existing) {
            if (s.grupo !== categoria) existing.precisaCorrigir = true;
          } else {
            porProduto.set(n, {
              produto: s.produto,
              categoriaAtual: s.grupo ?? 'MER',
              palavrasBatidas,
              precisaCorrigir: s.grupo !== categoria,
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
    await reclassifyMutation.mutateAsync({ produtos: produtoNomes, categoria, catalog, sales });
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
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col gap-3">
      <h3 className="font-semibold text-sm" style={{ color: CATEGORY_COLOR[categoria] }}>
        {CAT_LABEL[categoria]}
      </h3>

      <div>
        <div className="flex gap-2 mb-2">
          <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="ex: NIVEA" className="input flex-1" />
          <button onClick={handleAdd} className="rounded-md bg-amber-500 text-slate-950 px-3 py-1.5 text-xs font-medium whitespace-nowrap">
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

      <div>
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
          className="w-full rounded-md bg-cyan-500 text-slate-950 font-medium px-4 py-1.5 text-sm disabled:opacity-50"
        >
          {scanning ? 'Escaneando…' : '🔍 Escanear'}
        </button>
        <p className="text-[11px] text-slate-500 mt-1">
          Procura quem bate com alguma palavra-chave acima mas ainda tem vendas fora de {CAT_LABEL[categoria]}. Nada
          é reclassificado sozinho.
        </p>
        <MutationError error={reclassifyMutation.error} />
      </div>

      {scanResults &&
        (scanResults.length === 0 ? (
          <div className="text-xs text-slate-500 py-2">Nenhum produto novo encontrado.</div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={selected.size === scanResults.length}
                  onChange={(e) => setSelected(e.target.checked ? new Set(scanResults.map((c) => c.produto)) : new Set())}
                />
                Todos ({scanResults.length})
              </label>
              <button
                onClick={() => reclassify(Array.from(selected))}
                disabled={selected.size === 0 || reclassifyMutation.isPending}
                className="rounded-md bg-amber-500 text-slate-950 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {reclassifyMutation.isPending ? 'Aplicando…' : `Aplicar (${selected.size})`}
              </button>
            </div>
            <div className="flex flex-col gap-1.5 max-h-[50vh] overflow-y-auto">
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
