import { Link } from 'react-router-dom';
import { FunctionIcon } from '../../components/icons/FunctionIcon';
import {
  AwardIcon,
  DownloadIcon,
  HomeIcon,
  ImageIcon,
  ListIcon,
  PackageIcon,
  SearchIcon,
  SlidersIcon,
  TargetIcon,
  UploadIcon,
  UsersIcon,
} from '../../components/icons/NavIcons';
import { classifyProductTier } from '../../lib/business/classification';
import { buildClassificationInputs } from '../../lib/mappers';
import { useBrandKeywords, useCatalog, useExclusiveBrands, useProducts, useSales } from '../../lib/queries';

// Ported 1:1 from legacy/index-original.html — ADMIN_SUBS + .admin-menu-grid
// / .admin-card-btn, later extended with Ícones (Gerenciamento de Ícones).
// `slot` maps to functionIconSlots.ts — falls back to `icon` until an admin
// uploads a custom SVG for it. Cards show their name (icon-only was tried
// earlier and reverted per feedback) in a fixed 5-per-row grid that scales
// card/icon/text size with clamp() rather than dropping columns, so 5 stay
// visible edge-to-edge even on narrow phones.
const ADMIN_CARDS = [
  { to: '/admin/colaboradores', label: 'Colaboradores', icon: UsersIcon, slot: 'adm_colaboradores' },
  { to: '/admin/produtos', label: 'Produtos', icon: PackageIcon, slot: 'adm_produtos' },
  { to: '/metas', label: 'Metas', icon: TargetIcon, slot: 'adm_metas' },
  { to: '/admin/importar', label: 'Importar', icon: UploadIcon, slot: 'adm_importar' },
  { to: '/admin/vendas', label: 'Lista de Vendas', icon: ListIcon, slot: 'adm_lista_vendas' },
  { to: '/admin/auditoria', label: 'Auditoria', icon: SearchIcon, slot: 'adm_auditoria' },
  { to: '/admin/backup', label: 'Backup', icon: DownloadIcon, slot: 'adm_backup' },
  { to: '/admin/minha-loja', label: 'Minha Loja', icon: HomeIcon, slot: 'adm_minha_loja' },
  { to: '/admin/configuracoes', label: 'Configurações', icon: SlidersIcon, slot: 'adm_configuracoes' },
  { to: '/admin/icones', label: 'Ícones', icon: ImageIcon, slot: null },
  { to: '/admin/card-conquista', label: 'Modelos de Card', icon: AwardIcon, slot: null },
];

/** Count of distinct products seen in sales that never matched a specific
 * classification rule (catalog/keyword/heuristic) — the same "Pendentes de
 * Revisão" set Auditoria already lists, surfaced here as a notification
 * badge so an admin doesn't have to go looking for it. */
function usePendingClassificationCount(): number | undefined {
  const { data: sales } = useSales();
  const { data: catalog } = useCatalog();
  const { data: products } = useProducts();
  const { data: brandKeywords } = useBrandKeywords();
  const { data: exclusiveBrands } = useExclusiveBrands();
  if (!sales || !catalog || !products || !brandKeywords || !exclusiveBrands) return undefined;
  const inputs = buildClassificationInputs(catalog, products, brandKeywords, exclusiveBrands);
  const pending = new Set<string>();
  sales.forEach((s) => {
    if (!s.produto) return;
    const especifico = classifyProductTier(s.produto, s.codigo, inputs, false).categoria;
    if (!especifico) pending.add(s.produto.toLowerCase());
  });
  return pending.size;
}

export function AdminLandingPage() {
  const pendingCount = usePendingClassificationCount();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'clamp(6px, 2vw, 12px)' }}>
      {ADMIN_CARDS.map((c) => {
        const badge = c.to === '/admin/auditoria' ? pendingCount : undefined;
        return (
          <Link
            key={c.to}
            to={c.to}
            title={badge ? `${c.label} — ${badge} produto(s) pendente(s) de classificação` : c.label}
            className="relative flex flex-col items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-slate-800 bg-slate-900/60 text-slate-400 transition-all hover:border-cyan-500 hover:-translate-y-0.5 hover:text-cyan-400"
            style={{ minHeight: 78, padding: 'clamp(8px, 3vw, 20px) clamp(4px, 1.5vw, 12px)' }}
          >
            {!!badge && (
              <span
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  minWidth: 18,
                  height: 18,
                  padding: '0 4px',
                  borderRadius: 999,
                  background: '#f43f5e',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {badge > 99 ? '99+' : badge}
              </span>
            )}
            {c.slot ? (
              <FunctionIcon slot={c.slot} fallback={c.icon} size={22} />
            ) : (
              <c.icon width={22} height={22} />
            )}
            <span style={{ fontSize: 'clamp(8px, 2.4vw, 11px)', textAlign: 'center', lineHeight: 1.2 }}>{c.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
