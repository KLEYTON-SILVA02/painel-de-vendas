import { Link } from 'react-router-dom';
import {
  DownloadIcon,
  HomeIcon,
  PackageIcon,
  SearchIcon,
  SlidersIcon,
  TargetIcon,
  UploadIcon,
  UsersIcon,
} from '../../components/icons/NavIcons';

// Ported 1:1 from legacy/index-original.html — ADMIN_SUBS + .admin-menu-grid
// / .admin-card-btn. Icon-only per the latest spec (label dropped, kept as a
// tooltip via title=) — same 8 cards, same order, no visual grouping.
const ADMIN_CARDS = [
  { to: '/admin/colaboradores', label: 'Colaboradores', icon: UsersIcon },
  { to: '/admin/produtos', label: 'Produtos', icon: PackageIcon },
  { to: '/metas', label: 'Metas', icon: TargetIcon },
  { to: '/admin/importar', label: 'Importar', icon: UploadIcon },
  { to: '/admin/auditoria', label: 'Auditoria', icon: SearchIcon },
  { to: '/admin/backup', label: 'Backup', icon: DownloadIcon },
  { to: '/admin/minha-loja', label: 'Minha Loja', icon: HomeIcon },
  { to: '/admin/configuracoes', label: 'Configurações', icon: SlidersIcon },
];

export function AdminLandingPage() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(90px,1fr))', gap: 12 }}>
      {ADMIN_CARDS.map((c) => (
        <Link
          key={c.to}
          to={c.to}
          title={c.label}
          className="flex flex-col items-center justify-center rounded-2xl border-[1.5px] border-slate-800 bg-slate-900/60 text-slate-400 transition-all hover:border-cyan-500 hover:-translate-y-0.5 hover:text-cyan-400"
          style={{ minHeight: 78, padding: '20px 12px' }}
        >
          <c.icon width={26} height={26} />
        </Link>
      ))}
    </div>
  );
}
