// Registry of icon-able "slots" for Gerenciamento de Ícones. One icon per
// function applies everywhere that function's nav item renders (desktop
// Sidebar, mobile v2 category menu, ADM cards) — not per-surface — so a
// single upload updates the icon consistently across the app. Adding a
// slot here is the only step needed to make a new function icon-able; no
// change needed in IconesPage.tsx itself.
export interface FunctionIconSlot {
  key: string;
  label: string;
  group: 'Navegação' | 'ADM';
}

export const FUNCTION_ICON_SLOTS: FunctionIconSlot[] = [
  { key: 'inicio', label: 'Início', group: 'Navegação' },
  { key: 'ranking', label: 'Ranking', group: 'Navegação' },
  { key: 'dermo', label: 'Dermo', group: 'Navegação' },
  { key: 'generico', label: 'Genérico', group: 'Navegação' },
  { key: 'marcas_exclusivas', label: 'Marcas Exclusivas', group: 'Navegação' },
  { key: 'mercadoria_geral', label: 'Mercadoria Geral', group: 'Navegação' },
  { key: 'levmel', label: 'Levmel', group: 'Navegação' },
  { key: 'chip', label: 'Chip', group: 'Navegação' },
  { key: 'dinamicas', label: 'Dinâmicas', group: 'Navegação' },
  { key: 'biosintetica', label: 'Biosintética', group: 'Navegação' },
  { key: 'conquistas', label: 'Conquistas', group: 'Navegação' },
  { key: 'adm', label: 'ADM (menu)', group: 'Navegação' },
  { key: 'adm_colaboradores', label: 'ADM · Colaboradores', group: 'ADM' },
  { key: 'adm_produtos', label: 'ADM · Produtos', group: 'ADM' },
  { key: 'adm_metas', label: 'ADM · Metas', group: 'ADM' },
  { key: 'adm_importar', label: 'ADM · Importar', group: 'ADM' },
  { key: 'adm_lista_vendas', label: 'ADM · Lista de Vendas', group: 'ADM' },
  { key: 'adm_auditoria', label: 'ADM · Auditoria', group: 'ADM' },
  { key: 'adm_backup', label: 'ADM · Backup', group: 'ADM' },
  { key: 'adm_minha_loja', label: 'ADM · Minha Loja', group: 'ADM' },
  { key: 'adm_configuracoes', label: 'ADM · Configurações', group: 'ADM' },
];
