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

/** Uploads a custom function icon (SVG) to the same `photos` bucket, under
 * {storeId}/icons/{functionKey}.svg — reuses the bucket/RLS already set up
 * for photos rather than provisioning a new one. */
export async function uploadIcon(storeId: string, functionKey: string, file: File): Promise<string> {
  if (file.type !== 'image/svg+xml') throw new Error('Envie um arquivo .svg');
  const fullPath = `${storeId}/icons/${functionKey}.svg`;
  const { error } = await supabase.storage.from('photos').upload(fullPath, file, { upsert: true, contentType: 'image/svg+xml' });
  if (error) throw error;
  const { data } = supabase.storage.from('photos').getPublicUrl(fullPath);
  return `${data.publicUrl}?t=${Date.now()}`;
}

/** Uploads the *final* background art for a Galeria de Conquistas card
 * template, under {storeId}/card-templates/{templateId}.{ext}. Only ever
 * called with the finished artwork — the manual card editor's reference
 * image (used purely for on-screen alignment while positioning the mask
 * zones) never reaches this function and is discarded client-side. */
export async function uploadConquistaCardBackground(storeId: string, templateId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const fullPath = `${storeId}/card-templates/${templateId}.${ext}`;
  const { error } = await supabase.storage.from('photos').upload(fullPath, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('photos').getPublicUrl(fullPath);
  return `${data.publicUrl}?t=${Date.now()}`;
}

/** Uploads a partnership category's own icon (Gerenciar Categorias, ADM),
 * under {storeId}/category-icons/{categoryTypeId}.{ext} — any image type,
 * unlike uploadIcon's SVG-only function icons, since this one is meant to
 * be a quick upload of whatever icon the ADM already has on hand. */
export async function uploadCategoryIcon(storeId: string, categoryTypeId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'png';
  const fullPath = `${storeId}/category-icons/${categoryTypeId}.${ext}`;
  const { error } = await supabase.storage.from('photos').upload(fullPath, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('photos').getPublicUrl(fullPath);
  return `${data.publicUrl}?t=${Date.now()}`;
}

/** Uploads a per-template logo override for a card template, under
 * {storeId}/card-templates/{templateId}-logo.{ext} — when set, this
 * replaces the store's default logo (Minha Loja) for that specific card. */
export async function uploadConquistaCardLogo(storeId: string, templateId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'png';
  const fullPath = `${storeId}/card-templates/${templateId}-logo.${ext}`;
  const { error } = await supabase.storage.from('photos').upload(fullPath, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('photos').getPublicUrl(fullPath);
  return `${data.publicUrl}?t=${Date.now()}`;
}

/** Uploads a store's own custom Ranking Geral podium background (replacing
 * the ADM-supplied stock artwork), under {storeId}/ranking-podium/bg.{ext}
 * — calibrated in Configurações via the "varinha mágica" tool, which marks
 * where the photo circles and value/name text land on it (see
 * ranking_podium_spots on store_settings). */
export async function uploadRankingPodiumBackground(storeId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const fullPath = `${storeId}/ranking-podium/bg.${ext}`;
  const { error } = await supabase.storage.from('photos').upload(fullPath, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('photos').getPublicUrl(fullPath);
  return `${data.publicUrl}?t=${Date.now()}`;
}
