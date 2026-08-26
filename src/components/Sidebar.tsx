import { NavLink } from 'react-router-dom';
import './Sidebar.css';
import {
  AwardIcon,
  BagIcon,
  ChevronIcon,
  CoinIcon,
  DropletIcon,
  HomeIcon,
  PackageIcon,
  SettingsIcon,
  TagIcon,
  TargetIcon,
  UploadIcon,
} from './icons/NavIcons';

// Ported 1:1 from legacy/index-original.html — CAT_NAV. `icon` below uses the
// Feather-icon fallback set (NAV_ICONS) for every item; legacy actually shows
// custom illustrated SVGs for 8 of these (fixed colors, don't follow --sbc) —
// swap those in here once the asset files are provided.
const CAT_NAV: {
  key: string;
  label: string;
  color: string;
  icon: (props: { size?: number }) => React.ReactElement;
  grupo: 'Principal' | 'Categorias' | 'Programas' | 'Sistema';
  to: string;
  end: boolean;
}[] = [
  { key: 'DASH', label: 'Início', color: '#00f0ff', icon: (p) => <HomeIcon width={p.size} height={p.size} />, grupo: 'Principal', to: '/', end: true },
  { key: 'RANK', label: 'Ranking', color: '#00f0ff', icon: (p) => <AwardIcon width={p.size} height={p.size} />, grupo: 'Principal', to: '/ranking', end: false },
  { key: 'DERM', label: 'Dermo', color: '#ff3df0', icon: (p) => <DropletIcon width={p.size} height={p.size} />, grupo: 'Categorias', to: '/categoria/DERM', end: false },
  { key: 'GEN', label: 'Gen/Sim', color: '#14ff00', icon: (p) => <PackageIcon width={p.size} height={p.size} />, grupo: 'Categorias', to: '/categoria/GEN', end: false },
  { key: 'MP', label: 'Marcas Excl.', color: '#a82bff', icon: (p) => <TagIcon width={p.size} height={p.size} />, grupo: 'Categorias', to: '/categoria/MP', end: false },
  { key: 'MER', label: 'Merc. Geral', color: '#ff6a00', icon: (p) => <BagIcon width={p.size} height={p.size} />, grupo: 'Categorias', to: '/categoria/MER', end: false },
  { key: 'LEVMEL', label: 'Levmel', color: '#ffb700', icon: (p) => <CoinIcon width={p.size} height={p.size} />, grupo: 'Categorias', to: '/categoria/LEVMEL', end: false },
  { key: 'CHIP', label: 'Chip', color: '#00f0ff', icon: (p) => <PackageIcon width={p.size} height={p.size} />, grupo: 'Categorias', to: '/categoria/CHIP', end: false },
  { key: 'DINAMICA', label: 'Dinâmicas', color: '#a82bff', icon: (p) => <TargetIcon width={p.size} height={p.size} />, grupo: 'Programas', to: '/dinamicas', end: false },
  { key: 'BIO', label: 'Biosintética', color: '#14ff00', icon: (p) => <AwardIcon width={p.size} height={p.size} />, grupo: 'Programas', to: '/bio', end: false },
  { key: 'ADM', label: 'ADM', color: '#00f0ff', icon: (p) => <SettingsIcon width={p.size} height={p.size} />, grupo: 'Sistema', to: '/admin', end: false },
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
                {c.icon({ size: 18 })}
                <span className="sb-label">{c.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sb-footer">
        <NavLink to="/admin/importar" className="sb-import-btn" onClick={onNavigate}>
          <UploadIcon width={26} height={26} />
          <span className="sb-label">Importar Vendas</span>
        </NavLink>
      </div>
    </aside>
  );
}
