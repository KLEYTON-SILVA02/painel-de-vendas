import { useQuery } from '@tanstack/react-query';
import type { BioGroupKey, GoalCategoryKey } from './business/classification';
import type { BioGroupGoal, CommissionRate, Goal } from './business/types';
import type { SpecialListItem } from './business/summary';
import type { CardZone, ConquistaCardTemplate } from './conquistaCardRender';
import { mapBioGroupGoal, mapCollaborator, mapCommissionRate, mapDynamic, mapGoal, mapSale, mapSpecialListItem } from './mappers';
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

/** All sales for the store. Filtering by date range happens client-side in
 * the business-logic layer (matches the legacy in-memory model and keeps a
 * single cached dataset reusable across every date-range view).
 *
 * PostgREST caps any single request at a fixed row limit (1000 by default
 * on Supabase, not overridden for this project) — a plain `select('*')`
 * with no `.range()` silently truncates past that, newest-first per the
 * `order()` below. A store past ~1000 sales in its most recent stretch
 * (this one had 23k+) would then have every older date simply missing
 * from `sales`: single-day filters on those dates found nothing, ranking
 * totals for the month undercounted, and vendor names/values for those
 * rows never made it into memory at all — not a filtering bug, a fetch
 * bug. Paginates with `.range()` to load the full table regardless of size.
 *
 * Pages are fetched in parallel (count first, then every `.range()` request
 * fired at once) rather than one at a time — with 30k+ rows now on file,
 * sequential paging meant 30+ round trips awaited back-to-back on every
 * fetch, which is what made the app feel slow to load. */
export function useSales() {
  return useQuery({
    queryKey: ['sales'],
    queryFn: async () => {
      const { count, error: countError } = await supabase.from('sales').select('*', { count: 'exact', head: true });
      if (countError) throw countError;
      const total = count ?? 0;
      const pageStarts: number[] = [];
      for (let from = 0; from < total; from += SALES_PAGE_SIZE) pageStarts.push(from);
      if (pageStarts.length === 0) return [];

      const pages = await Promise.all(
        pageStarts.map(async (from) => {
          const { data, error } = await supabase
            .from('sales')
            .select('*')
            .order('data_iso', { ascending: false })
            .range(from, from + SALES_PAGE_SIZE - 1);
          if (error) throw error;
          return data;
        }),
      );
      return pages.flat().map(mapSale);
    },
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

/** REGRA 2 archived-months report — reads the aggregates computed by
 * useAutoArchiveOldSales() (src/lib/archival.ts) for months whose raw sales
 * rows were already deleted after passing the 3-month retention window. */
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
        textFontFamily: row.text_font_family ?? undefined,
        foto: row.foto as unknown as CardZone,
        logo: row.logo as unknown as CardZone,
        texto: row.texto as unknown as CardZone,
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
          const { data, error } = await supabase.from('products').select('*').order('nome').range(from, from + PRODUCTS_PAGE_SIZE - 1);
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

export function useBioGroupGoals() {
  return useQuery({
    queryKey: ['bio_group_goals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('bio_group_goals').select('*');
      if (error) throw error;
      const byGroup = {} as Record<BioGroupKey, BioGroupGoal | undefined>;
      data.forEach((row) => {
        const goal = mapBioGroupGoal(row);
        byGroup[goal.grupo] = goal;
      });
      return byGroup;
    },
  });
}

export function useBioGroups() {
  return useQuery({
    queryKey: ['bio_groups'],
    queryFn: async () => {
      const { data, error } = await supabase.from('bio_groups').select('*').order('nome');
      if (error) throw error;
      return data;
    },
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
