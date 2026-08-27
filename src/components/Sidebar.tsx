import { NavLink } from 'react-router-dom';
import './Sidebar.css';
import {
  BagIcon,
  ChevronIcon,
  CpuIcon,
  DropletIcon,
  HexagonIcon,
  HomeIcon,
  LeafIcon,
  MedalIcon,
  PillIcon,
  SettingsIcon,
  TagIcon,
  TargetIcon,
  TrophyIcon,
  UploadIcon,
} from './icons/NavIcons';

// Nav structure ported 1:1 from legacy/index-original.html's CAT_NAV
// (labels, colors, groups, routes). `icon` is a placeholder pending the
// user's custom brand SVGs — chosen per item's actual function instead of
// legacy's fallback set, since that set reuses the same icon for unrelated
// items (Gen/Sim and Chip both 'package'; Ranking and Biosintética both
// 'award') where a distinct, purpose-matched icon reads better while these
// are still stand-ins: Trophy for the leaderboard, Pill for generic/similar
// medicine, Hexagon (honeycomb) for the honey-based Levmel line, Cpu for the
// literal Chip category, Leaf for BIOSINTÉTICA's bio/organic angle.
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
  { key: 'RANK', label: 'Ranking', color: '#00f0ff', icon: (p) => <TrophyIcon width={p.size} height={p.size} />, grupo: 'Principal', to: '/ranking', end: false },
  { key: 'DERM', label: 'Dermo', color: '#ff3df0', icon: (p) => <DropletIcon width={p.size} height={p.size} />, grupo: 'Categorias', to: '/categoria/DERM', end: false },
  { key: 'GEN', label: 'Gen/Sim', color: '#14ff00', icon: (p) => <PillIcon width={p.size} height={p.size} />, grupo: 'Categorias', to: '/categoria/GEN', end: false },
  { key: 'MP', label: 'Marcas Excl.', color: '#a82bff', icon: (p) => <TagIcon width={p.size} height={p.size} />, grupo: 'Categorias', to: '/categoria/MP', end: false },
  { key: 'MER', label: 'Merc. Geral', color: '#ff6a00', icon: (p) => <BagIcon width={p.size} height={p.size} />, grupo: 'Categorias', to: '/categoria/MER', end: false },
  { key: 'LEVMEL', label: 'Levmel', color: '#ffb700', icon: (p) => <HexagonIcon width={p.size} height={p.size} />, grupo: 'Categorias', to: '/categoria/LEVMEL', end: false },
  { key: 'CHIP', label: 'Chip', color: '#00f0ff', icon: (p) => <CpuIcon width={p.size} height={p.size} />, grupo: 'Categorias', to: '/categoria/CHIP', end: false },
  { key: 'DINAMICA', label: 'Dinâmicas', color: '#a82bff', icon: (p) => <TargetIcon width={p.size} height={p.size} />, grupo: 'Programas', to: '/dinamicas', end: false },
  { key: 'BIO', label: 'Biosintética', color: '#14ff00', icon: (p) => <LeafIcon width={p.size} height={p.size} />, grupo: 'Programas', to: '/bio', end: false },
  { key: 'CONQUISTAS', label: 'Conquistas', color: '#ffb700', icon: (p) => <MedalIcon width={p.size} height={p.size} />, grupo: 'Programas', to: '/conquistas', end: false },
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
