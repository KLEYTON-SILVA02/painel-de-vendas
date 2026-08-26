import { supabase } from './supabase';

export interface CreateCollaboratorInput {
  matricula: string;
  senha: string;
  nome: string;
  apelido?: string | null;
  setor?: string | null;
  meta_individual?: number;
  foto_url?: string | null;
}

/** Calls the create-collaborator edge function (service-role only operation:
 * provisions the matricula+senha login alongside the collaborator record). */
export async function createCollaboratorLogin(input: CreateCollaboratorInput) {
  const { data, error } = await supabase.functions.invoke<{ collaborator_id: string; user_id: string }>(
    'create-collaborator',
    { body: input },
  );
  if (error) throw error;
  return data;
}
