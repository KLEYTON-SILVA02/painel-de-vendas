import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CategoryKey, GoalCategoryKey } from './business/classification';
import { normalize } from './business/normalize';
import { normalizeMatricula } from './business/parsing';
import { supabase } from './supabase';
import type { TablesInsert, TablesUpdate } from '../types/database';

type SimpleTable = 'catalog' | 'products' | 'brand_keywords' | 'exclusive_brands';

/** Generic "insert a row scoped to the current store" mutation, for the
 * several admin lists (catalog, products, brand keywords, exclusive brands)
 * that are otherwise identical CRUD shapes. */
export function useInsertRow<T extends SimpleTable>(table: T, storeId: string | undefined, invalidateKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<TablesInsert<T>, 'store_id'>) => {
      if (!storeId) throw new Error('store not loaded');
      // Supabase's typed .from() can't narrow its Insert/Update row shape on a
      // generic table-name union, so the query builder itself is untyped here;
      // the generic constraints on `input`/`patch` at each call site are what
      // actually keep this type-safe end-to-end.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from(table) as any).insert({ ...input, store_id: storeId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [invalidateKey] }),
  });
}

/** Bulk import of general products (Dermo/Genérico/Marcas Exclusivas) from
 * a spreadsheet, into the same Tier-2 `products` table the manual
 * "Adicionar produto" form writes to. No upsert — matches that form's own
 * behavior of not deduping by name. */
export function useBulkInsertProducts(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: { categoria: CategoryKey; nome: string; palavras: string[] }[]) => {
      if (!storeId) throw new Error('store not loaded');
      const { error } = await supabase.from('products').insert(rows.map((r) => ({ ...r, store_id: storeId })));
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useDeleteRow<T extends SimpleTable>(table: T, invalidateKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from(table) as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [invalidateKey] }),
  });
}

export function useUpdateRow<T extends SimpleTable>(table: T, invalidateKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<T> }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from(table) as any).update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [invalidateKey] }),
  });
}

/** Upsert (not plain update) so this also works for categories that don't
 * have a `goals` row yet — LEVMEL/CHIP are never seeded at store bootstrap,
 * only DERM/GEN/MP/MER are, so the first edit needs to insert. Existing
 * categories behave exactly as before (the upsert just updates their row). */
export function useUpdateGoal(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ categoria, patch }: { categoria: GoalCategoryKey; patch: TablesUpdate<'goals'> }) => {
      if (!storeId) throw new Error('store not loaded');
      const { error } = await supabase
        .from('goals')
        .upsert({ ...patch, categoria, store_id: storeId }, { onConflict: 'store_id,categoria' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });
}

/** Upsert, same reasoning as useUpdateGoal — no commission_rates row exists
 * until the admin first sets one, since the table isn't seeded at bootstrap. */
export function useUpdateCommissionRate(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      categoria,
      slot,
      patch,
    }: {
      categoria: 'DERM' | 'GEN' | 'MP';
      slot: number;
      patch: TablesUpdate<'commission_rates'>;
    }) => {
      if (!storeId) throw new Error('store not loaded');
      const { error } = await supabase
        .from('commission_rates')
        .upsert({ ...patch, categoria, slot, store_id: storeId }, { onConflict: 'store_id,categoria,slot' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commission_rates'] }),
  });
}

export function useSetFunctionIcon(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ functionKey, iconUrl }: { functionKey: string; iconUrl: string | null }) => {
      if (!storeId) throw new Error('store not loaded');
      const { error } = await supabase
        .from('function_icons')
        .upsert({ function_key: functionKey, icon_url: iconUrl, store_id: storeId }, { onConflict: 'store_id,function_key' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['function_icons'] }),
  });
}

/** Creates or updates a Galeria de Conquistas card template. Passing `id`
 * updates that row (used by the manual card editor's "salvar" on an
 * existing template); omitting it inserts a new one. */
export function useSaveConquistaCardTemplate(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      name: string;
      backgroundUrl: string;
      logoUrl: string | null;
      textFontFamily: string | null;
      foto: TablesInsert<'conquista_card_templates'>['foto'];
      logo: TablesInsert<'conquista_card_templates'>['logo'];
      texto: TablesInsert<'conquista_card_templates'>['texto'];
    }) => {
      if (!storeId) throw new Error('store not loaded');
      const { id, backgroundUrl, logoUrl, textFontFamily, ...rest } = input;
      const patch = { ...rest, background_url: backgroundUrl, logo_url: logoUrl, text_font_family: textFontFamily };
      if (id) {
        const { error } = await supabase.from('conquista_card_templates').update(patch).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('conquista_card_templates').insert({ ...patch, store_id: storeId });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conquista_card_templates'] }),
  });
}

export function useDeleteConquistaCardTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('conquista_card_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conquista_card_templates'] }),
  });
}

/** Marks one template as the default (used by the live achievement cards),
 * clearing the flag on every other template for the store first — RLS
 * scopes both updates to the caller's own store, so this can't touch
 * another store's rows. */
export function useSetDefaultConquistaCardTemplate(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!storeId) throw new Error('store not loaded');
      const { error: clearError } = await supabase
        .from('conquista_card_templates')
        .update({ is_default: false })
        .eq('store_id', storeId);
      if (clearError) throw clearError;
      const { error } = await supabase.from('conquista_card_templates').update({ is_default: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conquista_card_templates'] }),
  });
}

export function useIndividualGoals(categoria: CategoryKey) {
  return useQuery({
    queryKey: ['individual_goals', categoria],
    queryFn: async () => {
      const { data, error } = await supabase.from('individual_goals').select('*').eq('categoria', categoria);
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertIndividualGoal(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      categoria,
      collaboratorId,
      patch,
    }: {
      categoria: CategoryKey;
      collaboratorId: string;
      patch: Partial<{ valor_meta: number; valor_super: number; participa: boolean }>;
    }) => {
      if (!storeId) throw new Error('store not loaded');
      const { error } = await supabase
        .from('individual_goals')
        .upsert(
          { store_id: storeId, categoria, collaborator_id: collaboratorId, ...patch },
          { onConflict: 'store_id,categoria,collaborator_id' },
        );
      if (error) throw error;
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['individual_goals', vars.categoria] }),
  });
}

export function useCreateDynamic(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<TablesInsert<'dynamics'>, 'store_id'>) => {
      if (!storeId) throw new Error('store not loaded');
      const { error } = await supabase.from('dynamics').insert({ ...input, store_id: storeId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dynamics'] }),
  });
}

export function useCreateCollaborator(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { matricula: string; nome: string; apelido: string; setor: string }) => {
      if (!storeId) throw new Error('store not loaded');
      const { error } = await supabase
        .from('collaborators')
        .insert({ store_id: storeId, ...input, matricula: normalizeMatricula(input.matricula) });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collaborators'] }),
  });
}

/** Bulk import from a spreadsheet: upserts on (store_id, matricula) so a
 * re-imported roster updates existing collaborators (nome/apelido/setor)
 * instead of failing outright on the first duplicate matrícula.
 * normalizeMatricula() strips a source sheet's zero-padding so this
 * always upserts onto the same row a sales import would key off of. */
export function useBulkUpsertCollaborators(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: { matricula: string; nome: string; apelido: string; setor: string }[]) => {
      if (!storeId) throw new Error('store not loaded');
      const { error } = await supabase
        .from('collaborators')
        .upsert(
          rows.map((r) => ({ ...r, matricula: normalizeMatricula(r.matricula), store_id: storeId })),
          { onConflict: 'store_id,matricula' },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collaborators'] }),
  });
}

export function useUpdateCollaborator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<'collaborators'> }) => {
      const normalized = patch.matricula != null ? { ...patch, matricula: normalizeMatricula(patch.matricula) } : patch;
      const { error } = await supabase.from('collaborators').update(normalized).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collaborators'] }),
  });
}

export function useDeleteCollaborators() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('collaborators').delete().in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collaborators'] }),
  });
}

export function useUpdateStore(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: TablesUpdate<'stores'>) => {
      if (!storeId) throw new Error('store not loaded');
      const { error } = await supabase.from('stores').update(patch).eq('id', storeId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['store'] }),
  });
}

export function useUpdateStoreSettings(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: TablesUpdate<'store_settings'>) => {
      if (!storeId) throw new Error('store not loaded');
      const { error } = await supabase.from('store_settings').update(patch).eq('store_id', storeId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['store_settings'] }),
  });
}

function invalidateSpecialLists(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['special_lists'] });
  qc.invalidateQueries({ queryKey: ['special_lists_rows'] });
}

export function useAddSpecialListProduct(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tipo, nome }: { tipo: 'levmel' | 'chip'; nome: string }) => {
      if (!storeId) throw new Error('store not loaded');
      const { error } = await supabase.from('special_lists').insert({ store_id: storeId, tipo, nome, palavras: [nome] });
      if (error) throw error;
    },
    onSuccess: () => invalidateSpecialLists(qc),
  });
}

export function useDeleteSpecialListProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('special_lists').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateSpecialLists(qc),
  });
}

/** Bulk import of Biosintética products from a spreadsheet — same shape as
 * useAddBioProduct's single insert, just batched. No upsert: like the
 * manual "Adicionar" flow, re-importing the same name creates another row
 * rather than silently merging (bio_groups has no unique constraint to
 * upsert against, and duplicate keyword rows are harmless for matching). */
export function useBulkInsertBioProducts(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: { grupo: 'G1' | 'G2' | 'G3' | 'G4'; nome: string; palavras: string[] }[]) => {
      if (!storeId) throw new Error('store not loaded');
      const { error } = await supabase.from('bio_groups').insert(rows.map((r) => ({ ...r, store_id: storeId })));
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bio_groups'] }),
  });
}

export function useAddBioProduct(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ grupo, nome }: { grupo: 'G1' | 'G2' | 'G3' | 'G4'; nome: string }) => {
      if (!storeId) throw new Error('store not loaded');
      const { error } = await supabase.from('bio_groups').insert({ store_id: storeId, grupo, nome, palavras: [nome] });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bio_groups'] }),
  });
}

export function useDeleteBioProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bio_groups').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bio_groups'] }),
  });
}

export function useUpdateBioWeights(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (weights: Record<'G1' | 'G2' | 'G3' | 'G4', number>) => {
      if (!storeId) throw new Error('store not loaded');
      const { error } = await supabase.from('store_settings').update({ bio_weights: weights }).eq('store_id', storeId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['store_settings'] }),
  });
}

/** Upsert, same reasoning as useUpdateGoal/useUpdateCommissionRate — no row
 * exists per group until the admin first sets one. */
export function useUpdateBioGroupGoal(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ grupo, patch }: { grupo: 'G1' | 'G2' | 'G3' | 'G4'; patch: TablesUpdate<'bio_group_goals'> }) => {
      if (!storeId) throw new Error('store not loaded');
      const { error } = await supabase
        .from('bio_group_goals')
        .upsert({ ...patch, grupo, store_id: storeId }, { onConflict: 'store_id,grupo' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bio_group_goals'] }),
  });
}

export function useDeleteDynamic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('dynamics').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dynamics'] }),
  });
}

/** Tables the "Excluir dados" danger zone (ADM > Configurações) can wipe. */
export type BulkDeletableTable = 'sales' | 'products' | 'collaborators' | 'goals' | 'dynamics';

const DELETE_FETCH_PAGE_SIZE = 1000;

/** Deletes every row in `table` for the caller's store, optionally scoped
 * to a date range (only `sales` uses this, via `data_iso`). RLS's
 * admin+store-scoped delete policies enforce the scoping server-side, same
 * as every other delete mutation in this file — no manual store_id filter
 * needed. Fetches ids first (Supabase requires a real predicate on delete;
 * this also gives an exact affected-row count for the confirm prompt) and
 * deletes in chunks to keep each request's IN-list a sane size.
 *
 * The id fetch is paginated with `.range()` for the same reason useSales()
 * is: PostgREST caps any single request at 1000 rows by default. Without
 * pagination here, deleting e.g. a month of sales in a store with 1000+
 * matching rows silently removed only the first page and left the rest in
 * place — the exact bug this project already hit once for reading sales
 * (see useSales' own comment), now on the delete path. */
export function useBulkDeleteTable(table: BulkDeletableTable, invalidateKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (range: { dateColumn?: string; from?: string; to?: string } = {}) => {
      const ids: string[] = [];
      let from = 0;
      for (;;) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query = (supabase.from(table) as any).select('id').range(from, from + DELETE_FETCH_PAGE_SIZE - 1);
        if (range.dateColumn && range.from) query = query.gte(range.dateColumn, range.from);
        if (range.dateColumn && range.to) query = query.lte(range.dateColumn, range.to);
        const { data, error } = await query;
        if (error) throw error;
        ids.push(...(data ?? []).map((r: { id: string }) => r.id));
        if (!data || data.length < DELETE_FETCH_PAGE_SIZE) break;
        from += DELETE_FETCH_PAGE_SIZE;
      }
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: delErr } = await (supabase.from(table) as any).delete().in('id', chunk);
        if (delErr) throw delErr;
      }
      return ids.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [invalidateKey] }),
  });
}

/** Bulk-reclassifies one or more products, store-wide. Two halves, both
 * needed: an upsert into `catalog` per name (so future imports also get it
 * right — this alone is what AuditoriaPage's original per-product
 * reclassify did), and a retroactive `grupo` update on every already-
 * imported sale for those products, which the catalog-only approach never
 * touched — sales.grupo is written once at import time and never
 * recomputed, so an existing sale kept its old category forever even after
 * the product was reclassified. Product names are matched via normalize()
 * (case/accent/whitespace-insensitive), the same rule the classifier's own
 * exact-name tier uses. Takes the caller's already-loaded catalog/sales
 * (both fully in memory via useCatalog()/useSales(), no extra fetch) to
 * resolve which rows change, and chunks the sales update same as every
 * other bulk mutation in this file. */
export function useReclassifyProdutos(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      produtos,
      categoria,
      catalog,
      sales,
    }: {
      produtos: string[];
      categoria: CategoryKey;
      catalog: { id: string; nome: string }[];
      sales: { id: string; produto: string }[];
    }) => {
      if (!storeId) throw new Error('store not loaded');
      for (const nome of produtos) {
        const existing = catalog.find((c) => normalize(c.nome) === normalize(nome));
        if (existing) {
          const { error } = await supabase.from('catalog').update({ categoria }).eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('catalog').insert({ store_id: storeId, nome, codigo: null, categoria });
          if (error) throw error;
        }
      }
      const targets = new Set(produtos.map((p) => normalize(p)));
      const ids = sales.filter((s) => targets.has(normalize(s.produto))).map((s) => s.id);
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const { error } = await supabase.from('sales').update({ grupo: categoria }).in('id', chunk);
        if (error) throw error;
      }
      return ids.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['catalog'] });
    },
  });
}
