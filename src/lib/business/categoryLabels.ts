// Single source of truth for the 6 fixed categories' display names
// (DERM/GEN/MP/MER/LEVMEL/CHIP). Until this module existed, ~30 files each
// hardcoded their own copy of these names — inconsistently ("Genérico" vs
// "Genéricos" vs "Genéricos/Similares") — with no way for a store's ADM to
// rename them. category_labels (Supabase table) holds only the overrides an
// ADM has actually chosen; a category with no row here just uses the
// default below, so every store works unchanged until an ADM visits the
// "Nomes das Categorias" screen.
import { useCategoryLabels } from '../queries';
import { CAT_KEYS, GOAL_UNIT_KEYS, type GoalCategoryKey } from './classification';

export const CATEGORY_LABEL_KEYS: readonly GoalCategoryKey[] = [...CAT_KEYS, ...GOAL_UNIT_KEYS];

export const DEFAULT_CATEGORY_LABELS: Record<GoalCategoryKey, string> = {
  DERM: 'Dermocosméticos',
  GEN: 'Genéricos',
  MP: 'Marcas Exclusivas',
  MER: 'Mercadoria Geral',
  LEVMEL: 'Levmel',
  CHIP: 'Chip',
};

/** Fixed per-category color, ported 1:1 from CategoryPage.tsx's original
 * local CATEGORY_EMOJI/CATEGORY_COLOR maps — moved here so every screen that
 * needs to color-code a category (Lista de Vendas, Classificados, category
 * screens themselves) shares the same source instead of each re-declaring
 * its own copy. Unlike the label, this isn't store-overridable — it's a
 * fixed visual identity, same reasoning as the emoji. */
export const CATEGORY_EMOJI: Record<GoalCategoryKey, string> = {
  DERM: '🩹', GEN: '💊', MP: '🏷️', MER: '📦', LEVMEL: '🍯', CHIP: '🔴',
};
export const CATEGORY_COLOR: Record<GoalCategoryKey, string> = {
  DERM: '#ff3df0', GEN: '#14ff00', MP: '#a82bff', MER: '#ff6a00', LEVMEL: '#ffb700', CHIP: '#00e5ff',
};

/** The store's full category-label map: an ADM override takes priority,
 * falling back to the built-in default for any key without one. This is
 * the one lookup every screen should use instead of its own hardcoded map. */
export function useCategoryLabelMap(): Record<GoalCategoryKey, string> {
  const { data: overrides } = useCategoryLabels();
  const map = { ...DEFAULT_CATEGORY_LABELS };
  CATEGORY_LABEL_KEYS.forEach((key) => {
    const override = overrides?.[key];
    if (override) map[key] = override;
  });
  return map;
}

/** Mobile-only shortened fallbacks for the 4 fixed categories whose default
 * name is long enough to overflow the compact mv2 chips/titles (LEVMEL/CHIP
 * are already short, so they're untouched) — "Dermocosméticos" → "Dermo.",
 * "Genéricos" → "GEN", "Marcas Exclusivas" → "M.P", "Mercadoria Geral" →
 * "MERC". An ADM's own rename (Nomes das Categorias) always wins over this,
 * exactly like useCategoryLabelMap — this only replaces the built-in
 * default, so a store that renamed a category still sees its own choice on
 * mobile, just possibly needing to pick something short itself. */
const MOBILE_SHORT_DEFAULT_LABELS: Partial<Record<GoalCategoryKey, string>> = {
  DERM: 'Dermo.',
  GEN: 'GEN',
  MP: 'M.P',
  MER: 'MERC',
};

export function useMobileCategoryLabelMap(): Record<GoalCategoryKey, string> {
  const { data: overrides } = useCategoryLabels();
  const map = { ...DEFAULT_CATEGORY_LABELS, ...MOBILE_SHORT_DEFAULT_LABELS };
  CATEGORY_LABEL_KEYS.forEach((key) => {
    const override = overrides?.[key];
    if (override) map[key] = override;
  });
  return map;
}
