import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CategoryKey, GoalCategoryKey } from './business/classification';
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

/** Galeria de Conquistas' "Super Meta Individual" — a fixed personal
 * achievement threshold per collaborator/category, deliberately its own
 * table (not individual_goals.valor_super, which drives Metas' redistribution
 * math instead). Same query/mutation shape as useIndividualGoals above. */
export function useConquistaSuperMetas(categoria: 'DERM' | 'GEN' | 'MP') {
  return useQuery({
    queryKey: ['conquista_super_metas', categoria],
    queryFn: async () => {
      const { data, error } = await supabase.from('conquista_super_metas').select('*').eq('categoria', categoria);
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertConquistaSuperMeta(storeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      categoria,
      collaboratorId,
      valor,
    }: {
      categoria: 'DERM' | 'GEN' | 'MP';
      collaboratorId: string;
      valor: number;
    }) => {
      if (!storeId) throw new Error('store not loaded');
      const { error } = await supabase
        .from('conquista_super_metas')
        .upsert(
          { store_id: storeId, categoria, collaborator_id: collaboratorId, valor },
          { onConflict: 'store_id,categoria,collaborator_id' },
        );
      if (error) throw error;
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['conquista_super_metas', vars.categoria] }),
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
      const { error } = await supabase.from('collaborators').insert({ store_id: storeId, ...input });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collaborators'] }),
  });
}

export function useUpdateCollaborator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<'collaborators'> }) => {
      const { error } = await supabase.from('collaborators').update(patch).eq('id', id);
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
