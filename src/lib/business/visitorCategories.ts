export interface VisitorCategoryOption {
  key: string;
  label: string;
}

// Fixed categories a "Visitante" collaborator (VISITANTE_SETOR) can be
// granted read-only access to at registration — the six built-in sales
// categories plus Biosintética (offered only for stores that have it, see
// callers). Arbitrary ADM-created custom categories (Gerenciar Categorias)
// aren't offered here: they have no existing read-only mobile screen to
// reuse yet.
export const VISITOR_CATEGORY_OPTIONS: VisitorCategoryOption[] = [
  { key: 'DERM', label: 'Dermo' },
  { key: 'GEN', label: 'Genéricos' },
  { key: 'MP', label: 'Marcas Exclusivas' },
  { key: 'MER', label: 'Mercadoria Geral' },
  { key: 'LEVMEL', label: 'Levmel' },
  { key: 'CHIP', label: 'Chip' },
  { key: 'biosintetica', label: 'Biosintética' },
];
