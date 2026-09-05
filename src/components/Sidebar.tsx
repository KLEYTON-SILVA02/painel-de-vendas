import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useCategoryTypes } from '../lib/queries';
import './Sidebar.css';
import { FunctionIcon } from './icons/FunctionIcon';
import {
  BagIcon,
  ChevronIcon,
  CpuIcon,
  DropletIcon,
  HexagonIcon,
  HomeIcon,
  LeafIcon,
  LogoutIcon,
  PillIcon,
  SettingsIcon,
  TagIcon,
  TargetIcon,
  TrophyIcon,
  UploadIcon,
} from './icons/NavIcons';

// Nav structure ported 1:1 from legacy/index-original.html's CAT_NAV
// (labels, colors, groups, routes). `icon` is the fallback shown until an
// admin uploads a custom SVG for `slot` in ADM > Ícones (see FunctionIcon /
// functionIconSlots.ts) — chosen per item's actual function instead of
// legacy's fallback set, since that set reuses the same icon for unrelated
// items (Gen/Sim and Chip both 'package'; Ranking and Biosintética both
// 'award') where a distinct, purpose-matched icon reads better while these
// are still stand-ins: Trophy for the leaderboard, Pill for generic/similar
// medicine, Hexagon (honeycomb) for the honey-based Levmel line, Cpu for the
// literal Chip category.
//
// BIOSINTÉTICA is deliberately NOT listed here: it's the one legacy
// partnership category still wired to its own dedicated /bio route (instead
// of the generic /categoria-parceria/:chave every ADM-created category
// uses) and only exists for the store it was seeded for at migration time —
// see the `extraCategories`/bioCategory split below.
const CAT_NAV: {
  key: string;
  label: string;
  color: string;
  icon: (props: { width?: number; height?: number }) => React.ReactElement;
  slot: string;
  grupo: 'Principal' | 'Categorias' | 'Programas' | 'Sistema';
  to: string;
  end: boolean;
}[] = [
  { key: 'DASH', label: 'Início', color: '#00f0ff', icon: HomeIcon, slot: 'inicio', grupo: 'Principal', to: '/', end: true },
  { key: 'RANK', label: 'Ranking', color: '#00f0ff', icon: TrophyIcon, slot: 'ranking', grupo: 'Principal', to: '/ranking', end: false },
  { key: 'DERM', label: 'Dermo', color: '#ff3df0', icon: DropletIcon, slot: 'dermo', grupo: 'Categorias', to: '/categoria/DERM', end: false },
  { key: 'GEN', label: 'Gen/Sim', color: '#14ff00', icon: PillIcon, slot: 'generico', grupo: 'Categorias', to: '/categoria/GEN', end: false },
  { key: 'MP', label: 'Marcas Excl.', color: '#a82bff', icon: TagIcon, slot: 'marcas_exclusivas', grupo: 'Categorias', to: '/categoria/MP', end: false },
  { key: 'MER', label: 'Merc. Geral', color: '#ff6a00', icon: BagIcon, slot: 'mercadoria_geral', grupo: 'Categorias', to: '/categoria/MER', end: false },
  { key: 'LEVMEL', label: 'Levmel', color: '#ffb700', icon: HexagonIcon, slot: 'levmel', grupo: 'Categorias', to: '/categoria/LEVMEL', end: false },
  { key: 'CHIP', label: 'Chip', color: '#00f0ff', icon: CpuIcon, slot: 'chip', grupo: 'Categorias', to: '/categoria/CHIP', end: false },
  { key: 'DINAMICA', label: 'Dinâmicas', color: '#a82bff', icon: TargetIcon, slot: 'dinamicas', grupo: 'Programas', to: '/dinamicas', end: false },
  { key: 'ADM', label: 'ADM', color: '#00f0ff', icon: SettingsIcon, slot: 'adm', grupo: 'Sistema', to: '/admin', end: false },
];

const GROUPS = ['Principal', 'Categorias', 'Programas', 'Sistema'] as const;

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  logoUrl,
  onNavigate,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  logoUrl?: string | null;
  /** Called on any nav-item / import-button click, so the mobile drawer can close itself. */
  onNavigate?: () => void;
}) {
  // BIOSINTÉTICA only shows up here when this store actually has a
  // category_types row for it — new stores don't get one seeded
  // automatically, so without this check every store would see a dead
  // "Biosintética" link regardless of whether they ever created it.
  // Every OTHER ADM-created partnership category (Gerenciar Categorias)
  // gets its own button too, pointing at the generic
  // /categoria-parceria/:chave screen instead of Biosintética's dedicated
  // /bio route.
  const { data: categoryTypes } = useCategoryTypes();
  const { signOut } = useAuth();
  const bioCategory = (categoryTypes ?? []).find((c) => c.chave === 'biosintetica');
  const extraCategories = (categoryTypes ?? []).filter((c) => c.chave !== 'biosintetica');

  return (
    <aside className="sidebar">
      <div className="sb-header">
        <div className="sb-logo">{logoUrl ? <img src={logoUrl} alt="" /> : 'GV'}</div>
        <div className="sb-title">
          <div className="t1">
            GESTÃO DE
            <br />
            VENDAS
          </div>
        </div>
        <button className="sb-toggle" onClick={onToggleCollapsed} title={collapsed ? 'Expandir menu' : 'Recolher menu'}>
          <ChevronIcon width={15} height={15} />
        </button>
      </div>

      <nav className="sb-nav">
        {GROUPS.map((g) => (
          <div key={g}>
            <div className="sb-group-label">{g}</div>
            {CAT_NAV.filter((c) => c.grupo === g).map((c) => (
              <NavLink
                key={c.key}
                to={c.to}
                end={c.end}
                onClick={onNavigate}
                style={{ '--sbc': c.color } as React.CSSProperties}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                <FunctionIcon slot={c.slot} fallback={c.icon} size={18} />
                <span className="sb-label">{c.label}</span>
              </NavLink>
            ))}
            {g === 'Programas' && bioCategory && (
              <NavLink
                to="/bio"
                end={false}
                onClick={onNavigate}
                style={{ '--sbc': '#14ff00' } as React.CSSProperties}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                <FunctionIcon slot="biosintetica" fallback={LeafIcon} size={18} />
                <span className="sb-label">{bioCategory.nome}</span>
              </NavLink>
            )}
            {g === 'Programas' &&
              extraCategories.map((c) => (
                <NavLink
                  key={c.id}
                  to={`/categoria-parceria/${c.chave}`}
                  end={false}
                  onClick={onNavigate}
                  style={{ '--sbc': '#00c2ff' } as React.CSSProperties}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                >
                  {c.icone_url ? (
                    <img src={c.icone_url} alt="" width={18} height={18} style={{ objectFit: 'contain' }} />
                  ) : (
                    <TagIcon width={18} height={18} />
                  )}
                  <span className="sb-label">{c.nome}</span>
                </NavLink>
              ))}
          </div>
        ))}
      </nav>

      <div className="sb-footer">
        <button type="button" className="sb-logout-btn" onClick={() => signOut()}>
          <LogoutIcon width={18} height={18} />
          <span className="sb-label">Sair</span>
        </button>
        <NavLink to="/admin/importar" className="sb-import-btn" onClick={onNavigate}>
          <UploadIcon width={26} height={26} />
          <span className="sb-label">Importar Vendas</span>
        </NavLink>
      </div>
    </aside>
  );
}
