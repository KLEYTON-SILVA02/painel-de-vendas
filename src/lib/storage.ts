import { supabase } from './supabase';

/** Uploads a photo (collaborator avatar or store logo) to the public
 * `photos` bucket under the caller's store folder, and returns its public
 * URL. RLS on storage.objects restricts writes to admins of that store. */
export async function uploadPhoto(storeId: string, path: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const fullPath = `${storeId}/${path}.${ext}`;
  const { error } = await supabase.storage.from('photos').upload(fullPath, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('photos').getPublicUrl(fullPath);
  return `${data.publicUrl}?t=${Date.now()}`;
}
