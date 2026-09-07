import { useId, useState } from 'react';
import type { DynamicProductCategory } from '../../lib/business/types';

const MAX_CATEGORIAS = 4;

function blankCategoria(n: number): DynamicProductCategory {
  return { id: `cat-${Date.now()}-${n}`, nome: `Categoria ${n}`, produtos: [], palavraChave: '' };
}

/** "Separação de produtos da dinâmica": choose how many product categories
 * participate (0 = "None", the legacy flat `produtos` list on the dynamic
 * itself keeps working unchanged), then edit each one's name, optional
 * palavra-chave (brand/pattern substring matcher), and its own product
 * picker — collapsed by default so N categories side by side stay compact.
 * Shared by the desktop and mobile create/edit dynamic forms. */
export function CategoriasProdutosEditor({
  categorias,
  onChange,
  productNames,
  multiplicador,
  onMultiplicadorChange,
}: {
  categorias: DynamicProductCategory[];
  onChange: (categorias: DynamicProductCategory[]) => void;
  productNames: string[];
  multiplicador: { ativo: boolean; valor: number };
  onMultiplicadorChange: (m: { ativo: boolean; valor: number }) => void;
}) {
  function setCount(n: number) {
    if (n === categorias.length) return;
    if (n < categorias.length) {
      onChange(categorias.slice(0, n));
      return;
    }
    const added = Array.from({ length: n - categorias.length }, (_, i) => blankCategoria(categorias.length + i + 1));
    onChange([...categorias, ...added]);
  }

  function updateCategoria(i: number, patch: Partial<DynamicProductCategory>) {
    onChange(categorias.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 flex flex-col gap-3">
      <div>
        <label className="block text-xs text-slate-400 mb-1">Separação de produtos por categoria</label>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: MAX_CATEGORIAS + 1 }, (_, n) => n).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCount(n)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                categorias.length === n ? 'bg-cyan-500 text-slate-950' : 'border border-slate-700 text-slate-300'
              }`}
            >
              {n === 0 ? 'Nenhuma' : n}
            </button>
          ))}
        </div>
      </div>

      {categorias.length > 0 && (
        <>
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(220px, 1fr))` }}>
            {categorias.map((cat, i) => (
              <CategoriaColumn
                key={cat.id}
                categoria={cat}
                productNames={productNames}
                multiplicadorAtivo={multiplicador.ativo}
                onChange={(patch) => updateCategoria(i, patch)}
              />
            ))}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={multiplicador.ativo}
                onChange={(e) => onMultiplicadorChange({ ...multiplicador, ativo: e.target.checked })}
              />
              Multiplicador de pontos por categoria
            </label>
            {multiplicador.ativo && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Valor multiplicado pela quantidade de itens vendidos de cada categoria
                </label>
                <input
                  type="number"
                  value={multiplicador.valor}
                  onChange={(e) => onMultiplicadorChange({ ...multiplicador, valor: Number(e.target.value) })}
                  className="input w-40"
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CategoriaColumn({
  categoria,
  productNames,
  multiplicadorAtivo,
  onChange,
}: {
  categoria: DynamicProductCategory;
  productNames: string[];
  multiplicadorAtivo: boolean;
  onChange: (patch: Partial<DynamicProductCategory>) => void;
}) {
  const [produtoInput, setProdutoInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const listId = useId();

  function addProduto() {
    const nome = produtoInput.trim();
    if (!nome) return;
    onChange({ produtos: [...categoria.produtos, nome] });
    setProdutoInput('');
  }

  function removeProduto(nome: string) {
    onChange({
      produtos: categoria.produtos.filter((p) => p !== nome),
      produtosEspeciais: (categoria.produtosEspeciais ?? []).filter((e) => e.produto !== nome),
    });
  }

  function setValorEspecial(nome: string, valor: number) {
    const resto = (categoria.produtosEspeciais ?? []).filter((e) => e.produto !== nome);
    onChange({ produtosEspeciais: valor > 0 ? [...resto, { produto: nome, valor }] : resto });
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 flex flex-col gap-2">
      <input
        value={categoria.nome}
        onChange={(e) => onChange({ nome: e.target.value })}
        placeholder="Nome da categoria"
        className="input font-semibold"
      />
      <input
        value={categoria.palavraChave}
        onChange={(e) => onChange({ palavraChave: e.target.value })}
        placeholder="Palavra-chave (opcional — ex: nome de uma marca)"
        className="input text-xs"
      />

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between text-xs text-slate-400"
      >
        <span>Produtos ({categoria.produtos.length} selecionado{categoria.produtos.length === 1 ? '' : 's'})</span>
        <span>{expanded ? '▲ recolher' : '▼ selecionar'}</span>
      </button>

      {expanded && (
        <>
          <div className="flex gap-1.5">
            <input
              list={listId}
              value={produtoInput}
              onChange={(e) => setProdutoInput(e.target.value)}
              placeholder="buscar produto…"
              className="input flex-1 text-xs"
            />
            <datalist id={listId}>
              {productNames.map((nome) => (
                <option key={nome} value={nome} />
              ))}
            </datalist>
            <button type="button" onClick={addProduto} className="rounded-md bg-amber-500 text-slate-950 px-2.5 py-1 text-xs font-medium">
              + Add
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {categoria.produtos.map((p, i) => {
              const valorEspecial = categoria.produtosEspeciais?.find((e) => e.produto === p)?.valor ?? 0;
              return (
                <div key={i} className="flex items-center gap-1.5 text-xs bg-slate-800 rounded-lg px-2 py-1">
                  <span className="flex-1 truncate">{p}</span>
                  {multiplicadorAtivo && (
                    <input
                      type="number"
                      value={valorEspecial || ''}
                      onChange={(e) => setValorEspecial(p, Number(e.target.value))}
                      placeholder="R$/item"
                      title="Valor específico por item vendido deste produto (substitui o multiplicador geral só para ele)"
                      className="w-16 rounded bg-slate-900 border border-slate-700 px-1 py-0.5 text-[10px]"
                    />
                  )}
                  <button type="button" onClick={() => removeProduto(p)} className="text-slate-500 hover:text-rose-400">
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
