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
