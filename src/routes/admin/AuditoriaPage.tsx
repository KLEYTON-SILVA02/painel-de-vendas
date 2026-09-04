import { useMemo, useState } from 'react';
import { PageLoading } from '../../components/PageLoading';
import { useAuth } from '../../auth/AuthContext';
import { CAT_KEYS, classifyProductTier, type CategoryKey } from '../../lib/business/classification';
import { buildClassificationInputs } from '../../lib/mappers';
import { fmtMoney } from '../../lib/format';
import { useDeleteRow, useReclassifyProdutos } from '../../lib/mutations';
import { useBrandKeywords, useCatalog, useCollaborators, useExclusiveBrands, useProducts, useSales } from '../../lib/queries';

const CAT_LABEL: Record<CategoryKey, string> = {
  DERM: 'Dermocosméticos',
  GEN: 'Genérico',
  MP: 'Marcas Exclusivas',
  MER: 'Mercadoria Geral',
};
const CAT_SHORT: Record<CategoryKey, string> = { DERM: 'Dermo', GEN: 'Gen/Sim', MP: 'Marcas Excl.', MER: 'Merc. Geral' };

type Tab = 'pendentes' | CategoryKey | 'recentes';

export function AuditoriaPage() {
  const { profile } = useAuth();
  const { data: sales } = useSales();
  const { data: collaborators } = useCollaborators();
  const { data: catalog } = useCatalog();
  const { data: products } = useProducts();
  const { data: brandKeywords } = useBrandKeywords();
  const { data: exclusiveBrands } = useExclusiveBrands();
  const deleteCatalog = useDeleteRow('catalog', 'catalog');
  const reclassifyMutation = useReclassifyProdutos(profile?.store_id);

  const [tab, setTab] = useState<Tab>('pendentes');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [colab, setColab] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCat, setBulkCat] = useState<CategoryKey>('DERM');

  // `inputs` feeds classifyProductTier() calls over the *entire* sales
  // history further down (PendentesTab) — rebuilding it, and re-running
  // that classification pass, on every render (typing a date, ticking a
  // checkbox) was real, avoidable cost once this store's sales history grew
  // into the tens of thousands.
  const inputs = useMemo(
    () => (catalog && products && brandKeywords && exclusiveBrands ? buildClassificationInputs(catalog, products, brandKeywords, exclusiveBrands) : null),
    [catalog, products, brandKeywords, exclusiveBrands],
  );
  const unmatchedList = useMemo(() => {
    if (!sales || !collaborators) return [];
    const knownMatriculas = new Set(collaborators.map((c) => c.matricula));
    const unmatched = new Map<string, { matricula: string; vendedor: string; vendas: number }>();
    sales.forEach((s) => {
      if (knownMatriculas.has(s.matricula)) return;
      const key = `${s.matricula}|${s.vendedor}`;
      const existing = unmatched.get(key);
      if (existing) existing.vendas += 1;
      else unmatched.set(key, { matricula: s.matricula, vendedor: s.vendedor, vendas: 1 });
    });
    return Array.from(unmatched.values()).slice(0, 25);
  }, [sales, collaborators]);

  if (!sales || !collaborators || !catalog || !products || !brandKeywords || !exclusiveBrands || !inputs) {
    return <PageLoading />;
  }

  async function reclassify(produtoNomes: string[], categoria: CategoryKey) {
    // Also retroactively updates every already-imported sale for these
    // products — the original version here only touched `catalog`, which
    // fixed future imports but left sales already in the system stuck with
    // their old category forever (sales.grupo is written once at import
    // time and never recomputed).
    await reclassifyMutation.mutateAsync({
      produtos: produtoNomes,
      categoria,
      catalog: catalog!,
      sales: sales!,
      dateRange: { from: from || undefined, to: to || undefined },
    });
    setSelected(new Set());
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap gap-3 mb-4 max-w-2xl">
          <div>
            <label className="block text-xs text-slate-400 mb-1">De</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Até</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Colaborador</label>
            <select value={colab} onChange={(e) => setColab(e.target.value)} className="input">
              <option value="">Todos</option>
              {collaborators.map((c) => (
                <option key={c.id} value={c.matricula}>
                  {c.apelido || c.nome}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setTab('pendentes')}
            className={`rounded-lg px-3 py-1.5 text-xs ${tab === 'pendentes' ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
          >
            Pendentes de Revisão
          </button>
          {CAT_KEYS.map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-lg px-3 py-1.5 text-xs ${tab === k ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
            >
              {CAT_SHORT[k]}
            </button>
          ))}
          <button
            onClick={() => setTab('recentes')}
            className={`rounded-lg px-3 py-1.5 text-xs ${tab === 'recentes' ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
          >
            Últimos Classificados
          </button>
        </div>
      </div>

      {tab === 'pendentes' && (
        <PendentesTab sales={sales} from={from} to={to} colab={colab} inputs={inputs} selected={selected} setSelected={setSelected} bulkCat={bulkCat} setBulkCat={setBulkCat} reclassify={reclassify} />
      )}
      {tab === 'recentes' && <RecentesTab catalog={catalog} />}
      {CAT_KEYS.includes(tab as CategoryKey) && (
        <CategoriaClassificadaTab catKey={tab as CategoryKey} catalog={catalog} onRemove={(id) => deleteCatalog.mutate(id)} />
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-1 text-sm">Vendedores não reconhecidos</h3>
        <p className="text-xs text-slate-500 mb-3">
          Vendas cuja matrícula não corresponde a nenhum colaborador cadastrado. Continuam registradas, mas não
          aparecem no ranking por colaborador.
        </p>
        {unmatchedList.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">Nenhum vendedor pendente.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-800">
                <th className="py-1.5 pr-3">Matrícula</th>
                <th className="py-1.5 pr-3">Nome na planilha</th>
                <th className="py-1.5 pr-3">Vendas</th>
              </tr>
            </thead>
            <tbody>
              {unmatchedList.map((u) => (
                <tr key={`${u.matricula}|${u.vendedor}`} className="border-b border-slate-900">
                  <td className="py-1.5 pr-3 font-mono">{u.matricula}</td>
                  <td className="py-1.5 pr-3">{u.vendedor}</td>
                  <td className="py-1.5 pr-3 font-mono">{u.vendas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function PendentesTab({
  sales,
  from,
  to,
  colab,
  inputs,
  selected,
  setSelected,
  bulkCat,
  setBulkCat,
  reclassify,
}: {
  sales: { produto: string; codigo?: string | null; qtd: number; valor: number; dataISO: string | null; matricula: string }[];
  from: string;
  to: string;
  colab: string;
  inputs: ReturnType<typeof buildClassificationInputs>;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  bulkCat: CategoryKey;
  setBulkCat: (k: CategoryKey) => void;
  reclassify: (produtos: string[], categoria: CategoryKey) => void;
}) {
  // classifyProductTier() runs once per sale here — a full re-classification
  // pass over the store's entire history. Memoized so it only reruns when
  // the underlying data or the De/Até/Colaborador filters actually change,
  // not on every keystroke or checkbox click elsewhere on the page.
  const list = useMemo(() => {
    const unclassified = new Map<string, { produto: string; qtd: number; valor: number; ocorrencias: number }>();
    sales.forEach((s) => {
      if (from && s.dataISO && s.dataISO < from) return;
      if (to && s.dataISO && s.dataISO > to) return;
      if (colab && s.matricula !== colab) return;
      const especifico = classifyProductTier(s.produto, s.codigo, inputs, false).categoria;
      if (especifico) return;
      const existing = unclassified.get(s.produto);
      if (existing) {
        existing.qtd += s.qtd;
        existing.valor += s.valor;
        existing.ocorrencias += 1;
      } else {
        unclassified.set(s.produto, { produto: s.produto, qtd: s.qtd, valor: s.valor, ocorrencias: 1 });
      }
    });
    return Array.from(unclassified.values())
      .sort((a, b) => b.ocorrencias - a.ocorrencias)
      .slice(0, 80);
  }, [sales, from, to, colab, inputs]);

  function toggle(produto: string) {
    const next = new Set(selected);
    if (next.has(produto)) next.delete(produto);
    else next.add(produto);
    setSelected(next);
  }

  const allSelected = list.length > 0 && list.every((p) => selected.has(p.produto));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(list.map((p) => p.produto)));
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h3 className="font-semibold text-sm">Produtos em Mercadoria Geral por padrão (sem regra específica)</h3>
        <div className="flex gap-2">
          <select value={bulkCat} onChange={(e) => setBulkCat(e.target.value as CategoryKey)} className="input">
            {CAT_KEYS.map((k) => (
              <option key={k} value={k}>
                {CAT_LABEL[k]}
              </option>
            ))}
          </select>
          <button
            onClick={() => reclassify(Array.from(selected), bulkCat)}
            disabled={selected.size === 0}
            className="rounded-md bg-cyan-500 text-slate-950 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            Aplicar aos selecionados
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Mercadoria Geral é a categoria padrão: tudo que não bate com Dermo, Gen/Sim ou Marcas Excl. cai aqui. Marque
        um ou vários produtos e reclassifique-os — ou use o seletor rápido em cada linha. A reclassificação retroativa
        das vendas já gravadas segue o filtro De/Até acima (em branco = todo o histórico do produto).
      </p>
      {list.length === 0 ? (
        <div className="text-sm text-slate-500 py-4 text-center">Nenhum produto pendente de revisão neste período/filtro.</div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-800">
              <th className="py-1.5 pr-3">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} title="Selecionar todos" />
              </th>
              <th className="py-1.5 pr-3">Produto</th>
              <th className="py-1.5 pr-3">Ocorrências</th>
              <th className="py-1.5 pr-3">Qtd</th>
              <th className="py-1.5 pr-3">Valor</th>
              <th className="py-1.5 pr-3">Reclassificar</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.produto} className="border-b border-slate-900">
                <td className="py-1.5 pr-3">
                  <input type="checkbox" checked={selected.has(p.produto)} onChange={() => toggle(p.produto)} />
                </td>
                <td className="py-1.5 pr-3">{p.produto}</td>
                <td className="py-1.5 pr-3 font-mono">{p.ocorrencias}</td>
                <td className="py-1.5 pr-3 font-mono">{p.qtd}</td>
                <td className="py-1.5 pr-3 font-mono">{fmtMoney(p.valor)}</td>
                <td className="py-1.5 pr-3">
                  <select defaultValue="" onChange={(e) => e.target.value && reclassify([p.produto], e.target.value as CategoryKey)} className="input">
                    <option value="">—</option>
                    {CAT_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {CAT_SHORT[k]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RecentesTab({ catalog }: { catalog: { id: string; nome: string; categoria: string; created_at: string }[] }) {
  const recentes = catalog
    .slice()
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .slice(0, 50);
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="font-semibold mb-3 text-sm">Últimos produtos classificados</h3>
      {recentes.length === 0 ? (
        <div className="text-sm text-slate-500 py-4 text-center">Nenhuma reclassificação manual registrada ainda.</div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-800">
              <th className="py-1.5 pr-3">Produto</th>
              <th className="py-1.5 pr-3">Categoria</th>
              <th className="py-1.5 pr-3">Quando</th>
            </tr>
          </thead>
          <tbody>
            {recentes.map((c) => (
              <tr key={c.id} className="border-b border-slate-900">
                <td className="py-1.5 pr-3">{c.nome}</td>
                <td className="py-1.5 pr-3">
                  <span className="bg-slate-800 rounded-full px-2 py-0.5">{CAT_LABEL[c.categoria as CategoryKey]}</span>
                </td>
                <td className="py-1.5 pr-3 text-slate-500">{new Date(c.created_at).toLocaleString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CategoriaClassificadaTab({
  catKey,
  catalog,
  onRemove,
}: {
  catKey: CategoryKey;
  catalog: { id: string; nome: string; categoria: string; created_at: string }[];
  onRemove: (id: string) => void;
}) {
  const classificados = catalog.filter((c) => c.categoria === catKey).sort((a, b) => a.nome.localeCompare(b.nome));
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="font-semibold mb-3 text-sm">
        Produtos classificados manualmente em {CAT_LABEL[catKey]} ({classificados.length})
      </h3>
      {classificados.length === 0 ? (
        <div className="text-sm text-slate-500 py-4 text-center">Nenhum produto classificado manualmente nesta categoria ainda.</div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-800">
              <th className="py-1.5 pr-3">Produto</th>
              <th className="py-1.5 pr-3">Classificado em</th>
              <th className="py-1.5 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {classificados.map((c) => (
              <tr key={c.id} className="border-b border-slate-900">
                <td className="py-1.5 pr-3">{c.nome}</td>
                <td className="py-1.5 pr-3 text-slate-500">{new Date(c.created_at).toLocaleDateString('pt-BR')}</td>
                <td className="py-1.5 pr-3">
                  <button onClick={() => onRemove(c.id)} className="text-slate-500 hover:text-rose-400">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
