import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CategoryKey } from './business/classification';
import { supabase } from './supabase';
import type { TablesUpdate } from '../types/database';

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ categoria, patch }: { categoria: CategoryKey; patch: TablesUpdate<'goals'> }) => {
      const { error } = await supabase.from('goals').update(patch).eq('categoria', categoria);
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
