import { supabase } from './supabase';

/** Calls the grant-collaborator-login edge function (service-role only
 * operation: provisions a matricula+senha login for an already-existing
 * collaborator record). Plain roster management never needs this — a
 * collaborator can exist without ever having a login, exactly like the
 * legacy system, where the concept didn't exist at all. */
export async function grantCollaboratorLogin(collaboratorId: string, senha: string) {
  const { data, error } = await supabase.functions.invoke<{ user_id: string }>('grant-collaborator-login', {
    body: { collaborator_id: collaboratorId, senha },
  });
  if (error) throw error;
  return data;
}

/** Calls the reset-collaborator-login edge function (service-role only
 * operation: overwrites the password of a collaborator that already has a
 * login). Grant only ever creates — this is the counterpart for a
 * colaborador who forgot their senha and needs the ADM to set a new one. */
export async function resetCollaboratorLogin(collaboratorId: string, senha: string) {
  const { data, error } = await supabase.functions.invoke<{ ok: true }>('reset-collaborator-login', {
    body: { collaborator_id: collaboratorId, senha },
  });
  if (error) throw error;
  return data;
}

/** Collaborator self-service: updates only their own foto_url/
 * foto_conquista_url via a narrow SECURITY DEFINER RPC (see
 * update_own_collaborator_photo, migration 0047) — `null` for either arg
 * means "leave that one unchanged". */
export async function updateOwnCollaboratorPhoto(fotoUrl: string | null, fotoConquistaUrl: string | null) {
  const { error } = await supabase.rpc('update_own_collaborator_photo', {
    new_foto_url: fotoUrl,
    new_foto_conquista_url: fotoConquistaUrl,
  });
  if (error) throw error;
}
