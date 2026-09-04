import { useQuery } from '@tanstack/react-query';
import type { BioGroupKey, GoalCategoryKey } from './business/classification';
import type { BioGroupGoal, CommissionRate, Goal } from './business/types';
import type { SpecialListItem } from './business/summary';
import type { CardTextLayer, CardZone, ConquistaCardTemplate } from './conquistaCardRender';
import { monthFirstISO, monthLastISO } from './dateRange';
import { mapBioGroupGoal, mapCollaborator, mapCommissionRate, mapDynamic, mapGoal, mapSale, mapSpecialListItem, SALE_COLUMNS, type SaleRow } from './mappers';
import type { BulkDeletableTable } from './mutations';
import { supabase } from './supabase';

export function useCollaborators() {
  return useQuery({
    queryKey: ['collaborators'],
    queryFn: async () => {
      const { data, error } = await supabase.from('collaborators').select('*').order('nome');
      if (error) throw error;
      return data.map(mapCollaborator);
    },
  });
}

const SALES_PAGE_SIZE = 1000;
// Headroom for the keyset loop below — 500 pages of 1000 rows = 500k sales,
// well past this store's current ~33k and years of growth at its current
// rate. Purely a safety net against an unexpected always-full-page response
// looping forever, same role the old doubling-batch cap played.
const SALES_MAX_PAGES = 500;

/** Pages through `sales` via keyset (cursor) pagination on `id` — each page
 * is a plain `.gt('id', cursor).limit(1000)`, not `.range()` (OFFSET/LIMIT).
 * OFFSET's cost grows with how deep a page is: Postgres has to walk and
 * discard every row before the requested slice, so the last pages of a
 * ~33k-row table were measured taking 5-10s each while the first came back
 * in under a second. A keyset page's cost is flat no matter how many pages
 * came before it — it's an index lookup starting right after the last row
 * already fetched, using the table's existing primary-key index with no
 * extra sort. `id` (not `data_iso`) is the cursor column specifically
 * because it already has a unique index (the primary key) and no caller
 * needs the returned array pre-sorted by date — every consumer that cares
 * about order (computeSummary, computeVendorExtract, ListaVendasPage's
 * day/month grouping) already sorts its own output. Pages run sequentially
 * (each needs the previous page's cursor) rather than the old growing-
 * parallel-batches scheme — that scheme made sense to front-load cheap
 * OFFSET pages, but firing many *expensive* deep OFFSET pages at once was
 * exactly what made them compete for the same DB connections and blow up
 * total load time; flat-cost keyset pages don't need that workaround. */
async function fetchSalesPages(range?: { fromISO: string; toISO: string }) {
  const pages: SaleRow[][] = [];
  let cursor: string | null = null;
  for (let iteration = 0; iteration < SALES_MAX_PAGES; iteration++) {
    let query = supabase.from('sales').select(SALE_COLUMNS).order('id', { ascending: true }).limit(SALES_PAGE_SIZE);
    if (range) query = query.gte('data_iso', range.fromISO).lte('data_iso', range.toISO);
    if (cursor) query = query.gt('id', cursor);
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;
    pages.push(data);
    if (data.length < SALES_PAGE_SIZE) break;
    cursor = data[data.length - 1].id;
  }
  return pages.flat();
}

/** All sales for the store. Filtering by date range happens client-side in
 * the business-logic layer (matches the legacy in-memory model and keeps a
 * single cached dataset reusable across every date-range view) — screens
 * that only ever need a bounded window (see `useCurrentMonthSales` below)
 * should fetch that window directly instead of pulling this full history.
 *
 * `enabled` (default true) lets a caller that only *might* need this data —
 * e.g. the auto-archive check, which used to run this full fetch for every
 * signed-in user including collaborators, before it even knew whether the
 * session was an admin's — opt out until it actually knows it needs it,
 * without duplicating the query key or its caching. */
export function useSales(enabled = true) {
  return useQuery({
    queryKey: ['sales'],
    queryFn: async () => (await fetchSalesPages()).map(mapSale),
    enabled,
  });
}

export interface SalesMonthTotal {
  yearMonth: string; // "YYYY-MM"
  valorTotal: number;
  itensTotal: number;
  vendasTotal: number;
}

/** Header totals for every month that has sales — one row per month, from
 * the `sales_month_totals()` RPC (supabase/migrations/0036) instead of
 * `useSales()`'s full item-level history. Backs Lista de Vendas' default
 * (collapsed) view: the month/day accordion headers need "how much and how
 * many" per month, not the underlying rows, so this is the only fetch that
 * screen needs until an ADM explicitly turns on `salesListEnabled` to see
 * the line items themselves. */
export function useSalesMonthTotals() {
  return useQuery({
    queryKey: ['sales_month_totals'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('sales_month_totals');
      if (error) throw error;
      return (data ?? []).map((row) => ({
        yearMonth: row.year_month,
        valorTotal: Number(row.valor_total),
        itensTotal: Number(row.itens_total),
        vendasTotal: Number(row.vendas_total),
      })) as SalesMonthTotal[];
    },
  });
}

/** Only the current calendar month's sales, fetched with a `data_iso` range
 * filter instead of `useSales()`'s full multi-thousand-row history — for
 * callers (the achievement-celebration check) that only ever look at this
 * month regardless of what page they're mounted on. Mounting something that
 * needs `useSales()`'s complete history in a component every route renders
 * (as the celebration host is, in both the desktop and mobile admin shells)
 * meant every page load — including ones with nothing to do with sales,
 * like Categorias — paid for downloading the entire sales table first. */
export function useCurrentMonthSales() {
  const now = new Date();
  const fromISO = monthFirstISO(now.getFullYear(), now.getMonth());
  const toISO = monthLastISO(now.getFullYear(), now.getMonth());
  return useQuery({
    queryKey: ['sales', 'month', fromISO, toISO],
    queryFn: async () => (await fetchSalesPages({ fromISO, toISO })).map(mapSale),
  });
}

/** History panel for Importar Vendas — every spreadsheet ever uploaded for
 * this store, newest first. RLS already scopes rows to the caller's store. */
export function useSalesImports() {
  return useQuery({
    queryKey: ['sales_imports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_imports')
        .select('id, file_name, row_count, duplicate_count, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** REGRA 2 archived-months report — reads the aggregates written by the
 * `archive_old_sales` Postgres function (supabase/migrations/0034_archive_old_sales_cron.sql),
 * scheduled daily via pg_cron, for months whose raw sales rows were already
 * deleted after passing the 3-month retention window. */
export function useSalesArchiveCategories() {
  return useQuery({
    queryKey: ['sales_archive_categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_archive_categories')
        .select('*')
        .order('year_month', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useSalesArchiveCollaborators() {
  return useQuery({
    queryKey: ['sales_archive_collaborators'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_archive_collaborators')
        .select('*')
        .order('year_month', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useGoals() {
  return useQuery({
    queryKey: ['goals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('goals').select('*');
      if (error) throw error;
      const byCategory = {} as Record<GoalCategoryKey, Goal | undefined>;
      data.forEach((row) => {
        const goal = mapGoal(row);
        byCategory[goal.categoria] = goal;
      });
      return byCategory;
    },
  });
}

/** icon_url by function_key, for the whole store — used by <FunctionIcon>
 * to look up a custom override before falling back to the built-in icon. */
export function useFunctionIcons() {
  return useQuery({
    queryKey: ['function_icons'],
    queryFn: async () => {
      const { data, error } = await supabase.from('function_icons').select('*');
      if (error) throw error;
      const byKey: Record<string, string | undefined> = {};
      data.forEach((row) => {
        if (row.icon_url) byKey[row.function_key] = row.icon_url;
      });
      return byKey;
    },
  });
}

/** All commission rates by category, as an array per category (sorted by
 * slot) — Marcas Exclusivas can hold up to 3 independent rates, Dermo/
 * Genéricos hold at most 1 (slot 1). A category with nothing configured
 * yet returns an empty array. */
export function useCommissionRates() {
  return useQuery({
    queryKey: ['commission_rates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('commission_rates').select('*').order('slot');
      if (error) throw error;
      const byCategory: Record<CommissionRate['categoria'], CommissionRate[]> = { DERM: [], GEN: [], MP: [] };
      data.forEach((row) => {
        const rate = mapCommissionRate(row);
        byCategory[rate.categoria].push(rate);
      });
      return byCategory;
    },
  });
}

export interface ConquistaCardTemplateRow extends ConquistaCardTemplate {
  isDefault: boolean;
}

/** Admin-created Galeria de Conquistas card templates (background art +
 * mask zone geometry), store-scoped. Empty when the admin hasn't created
 * any yet — ConquistaCard then falls back to the built-in Hiteck template. */
export function useConquistaCardTemplates() {
  return useQuery({
    queryKey: ['conquista_card_templates'],
    queryFn: async (): Promise<ConquistaCardTemplateRow[]> => {
      const { data, error } = await supabase.from('conquista_card_templates').select('*').order('created_at');
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        name: row.name,
        backgroundUrl: row.background_url,
        logoUrl: row.logo_url,
        logoScale: row.logo_scale ?? undefined,
        textFontFamily: row.text_font_family ?? undefined,
        foto: row.foto as unknown as CardZone,
        logo: row.logo as unknown as CardZone,
        texto: row.texto ? (row.texto as unknown as CardZone) : undefined,
        textLayers: row.text_layers ? (row.text_layers as unknown as CardTextLayer[]) : undefined,
        isDefault: row.is_default,
      }));
    },
  });
}

export function useStoreSettings() {
  return useQuery({
    queryKey: ['store_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('store_settings').select('*').single();
      if (error) throw error;
      return data;
    },
  });
}

export function useStore() {
  return useQuery({
    queryKey: ['store'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('*').single();
      if (error) throw error;
      return data;
    },
  });
}

export function useSpecialLists() {
  return useQuery({
    queryKey: ['special_lists'],
    queryFn: async () => {
      const { data, error } = await supabase.from('special_lists').select('*');
      if (error) throw error;
      const levmel: SpecialListItem[] = [];
      const chip: SpecialListItem[] = [];
      data.forEach((row) => {
        (row.tipo === 'levmel' ? levmel : chip).push(mapSpecialListItem(row));
      });
      return { levmel, chip };
    },
  });
}

/** Set of collaborator_ids that already have a login (a profiles row), so
 * the UI can offer "grant access" only where it isn't redundant. */
export function useCollaboratorsWithLogin() {
  return useQuery({
    queryKey: ['profiles_with_login'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('collaborator_id').not('collaborator_id', 'is', null);
      if (error) throw error;
      return new Set(data.map((r) => r.collaborator_id as string));
    },
  });
}

export function useCatalog() {
  return useQuery({
    queryKey: ['catalog'],
    queryFn: async () => {
      const { data, error } = await supabase.from('catalog').select('*').order('nome');
      if (error) throw error;
      return data;
    },
  });
}

// PostgREST caps a single request at 1000 rows — same truncation bug as
// useSales had (see its comment above) but for the keyword-based product
// classification list, which has grown past that cap too.
const PRODUCTS_PAGE_SIZE = 1000;

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { count, error: countError } = await supabase.from('products').select('*', { count: 'exact', head: true });
      if (countError) throw countError;
      const total = count ?? 0;
      const pageStarts: number[] = [];
      for (let from = 0; from < total; from += PRODUCTS_PAGE_SIZE) pageStarts.push(from);
      if (pageStarts.length === 0) return [];
      const pages = await Promise.all(
        pageStarts.map(async (from) => {
          const { data, error } = await supabase
            .from('products')
            .select('*')
            .order('nome')
            .order('id', { ascending: true })
            .range(from, from + PRODUCTS_PAGE_SIZE - 1);
          if (error) throw error;
          return data;
        }),
      );
      const data = pages.flat();
      return data;
    },
  });
}

export function useBrandKeywords() {
  return useQuery({
    queryKey: ['brand_keywords'],
    queryFn: async () => {
      const { data, error } = await supabase.from('brand_keywords').select('*').order('palavra');
      if (error) throw error;
      return data;
    },
  });
}

export function useExclusiveBrands() {
  return useQuery({
    queryKey: ['exclusive_brands'],
    queryFn: async () => {
      const { data, error } = await supabase.from('exclusive_brands').select('*').order('palavra');
      if (error) throw error;
      return data;
    },
  });
}

/** Partnership category types (BIOSINTÉTICA is the first/only one today) —
 * small table, always fetched whole for the store. Pages resolve the one
 * they need by `chave` (e.g. 'biosintetica'). */
export function useCategoryTypes() {
  return useQuery({
    queryKey: ['category_types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('category_types').select('*').order('created_at');
      if (error) throw error;
      return data;
    },
  });
}

/** Scoped by `categoryTypeId` so each partnership category has its own
 * independent goal set — BIOSINTÉTICA's bio_group_goals rows today, another
 * category's tomorrow. `undefined` while the category type isn't resolved
 * yet keeps this disabled rather than fetching everyone's rows. */
export function useBioGroupGoals(categoryTypeId: string | undefined) {
  return useQuery({
    queryKey: ['bio_group_goals', categoryTypeId],
    queryFn: async () => {
      const { data, error } = await supabase.from('bio_group_goals').select('*').eq('category_type_id', categoryTypeId!);
      if (error) throw error;
      const byGroup = {} as Record<BioGroupKey, BioGroupGoal | undefined>;
      data.forEach((row) => {
        const goal = mapBioGroupGoal(row);
        byGroup[goal.grupo] = goal;
      });
      return byGroup;
    },
    enabled: !!categoryTypeId,
  });
}

/** Scoped by `categoryTypeId` — see useBioGroupGoals above. */
export function useBioGroups(categoryTypeId: string | undefined) {
  return useQuery({
    queryKey: ['bio_groups', categoryTypeId],
    queryFn: async () => {
      const { data, error } = await supabase.from('bio_groups').select('*').eq('category_type_id', categoryTypeId!).order('nome');
      if (error) throw error;
      return data;
    },
    enabled: !!categoryTypeId,
  });
}

/** Raw special_lists rows (with ids), for the Configurações admin screen —
 * as opposed to useSpecialLists()'s grouped {levmel, chip} shape used by
 * the business-logic layer. */
export function useSpecialListRows() {
  return useQuery({
    queryKey: ['special_lists_rows'],
    queryFn: async () => {
      const { data, error } = await supabase.from('special_lists').select('*').order('nome');
      if (error) throw error;
      return data;
    },
  });
}

export function useDynamics() {
  return useQuery({
    queryKey: ['dynamics'],
    queryFn: async () => {
      const { data, error } = await supabase.from('dynamics').select('*').order('data_inicio', { ascending: false });
      if (error) throw error;
      return data.map(mapDynamic);
    },
  });
}

/** On-demand row count for the "Excluir dados" danger zone (ADM >
 * Configurações) — a plain async lookup rather than a cached query hook,
 * since it's only ever used right before a destructive action to show
 * "N registros serão excluídos" and shouldn't linger in the query cache. */
export async function countRowsInRange(table: BulkDeletableTable, dateColumn?: string, from?: string, to?: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase.from(table) as any).select('id', { count: 'exact', head: true });
  if (dateColumn && from) query = query.gte(dateColumn, from);
  if (dateColumn && to) query = query.lte(dateColumn, to);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}
