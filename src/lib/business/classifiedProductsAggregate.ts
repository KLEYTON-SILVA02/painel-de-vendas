import { classifyProductTier, type CategoryKey, type ClassificationInputs } from './classification';
import type { Sale } from './types';

export interface ClassifiedProductAgg {
  produto: string;
  qtd: number;
  valor: number;
  ocorrencias: number;
  categoria: CategoryKey;
}

/** One pass of the same aggregation ClassificadosTab always did in a single
 * synchronous `forEach` over the whole `sales` array. Pulled out as its own
 * pure function (mutating `map`, not the component) so it can run in small
 * slices — see useChunkedClassification — instead of blocking the main
 * thread for the entire list at once. Running it over the full array in one
 * call (`aggregateClassifiedProductsChunk(sales, 0, sales.length, inputs, map)`)
 * is exactly equivalent to the old single-pass `useMemo`. */
export function aggregateClassifiedProductsChunk(
  sales: readonly Sale[],
  start: number,
  end: number,
  inputs: ClassificationInputs,
  map: Map<string, ClassifiedProductAgg>,
): void {
  for (let i = start; i < end; i++) {
    const s = sales[i];
    if (!s.produto) continue;
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
  }
}
