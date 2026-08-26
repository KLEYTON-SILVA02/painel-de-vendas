import { useQuery } from '@tanstack/react-query';
import { CAT_KEYS } from './business/classification';
import type { Goal } from './business/types';
import type { SpecialListItem } from './business/summary';
import { mapCollaborator, mapDynamic, mapGoal, mapSale, mapSpecialListItem } from './mappers';
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

/** All sales for the store. Filtering by date range happens client-side in
 * the business-logic layer (matches the legacy in-memory model and keeps a
 * single cached dataset reusable across every date-range view). */
export function useSales() {
  return useQuery({
    queryKey: ['sales'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sales').select('*').order('data_iso', { ascending: false });
      if (error) throw error;
      return data.map(mapSale);
    },
  });
}

export function useGoals() {
  return useQuery({
    queryKey: ['goals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('goals').select('*');
      if (error) throw error;
      const byCategory = {} as Record<(typeof CAT_KEYS)[number], Goal | undefined>;
      data.forEach((row) => {
        const goal = mapGoal(row);
        byCategory[goal.categoria] = goal;
      });
      return byCategory;
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

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').order('nome');
      if (error) throw error;
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
