import { NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { HomeIcon, LeafIcon, TargetIcon, TrophyIcon } from '../../components/icons/NavIcons';
import { BALCAO_SETOR } from '../../lib/business/bio';
import { useCollaborators } from '../../lib/queries';
import '../../styles/mobile-v2.css';
import { CollaboratorBioPage } from './CollaboratorBioPage';
import { CollaboratorDinamicasPage } from './CollaboratorDinamicasPage';
import { CollaboratorRankingPage } from './CollaboratorRankingPage';
import { MetasVendasPage } from './MetasVendasPage';

// A small app of its own for collaborators, in the same mv2 ("Scanner
// Técnico") visual language as the admin mobile screens: a header + a nav
// that switches between Metas/Vendas, Ranking, Biosintética (Balcão only)
// and Dinâmicas. Unlike the admin mv2 shell — which falls back to the
// pre-existing desktop Sidebar above 1024px (see useIsMobileV2) —
// collaborators have no separate desktop UI to fall back to, so this shell
// mounts at every width: the nav is a bottom tab bar on narrow viewports
// and becomes a persistent left sidebar at desktop widths (see the
// .mv2-collab-nav media query in mobile-v2.css), same transition pattern
// the admin spec uses for its own off-canvas-to-fixed sidebar.
export function CollaboratorShell() {
  const { profile, signOut } = useAuth();
  const { data: collaborators } = useCollaborators();
  const me = collaborators?.find((c) => c.id === profile?.collaborator_id);
  const isBalcao = me?.setor === BALCAO_SETOR;

  const tabs = [
    { to: '/', end: true, label: 'Metas/Vendas', icon: HomeIcon },
    { to: '/ranking', end: false, label: 'Ranking', icon: TrophyIcon },
    ...(isBalcao ? [{ to: '/bio', end: false, label: 'Biosintética', icon: LeafIcon }] : []),
    { to: '/dinamicas', end: false, label: 'Dinâmicas', icon: TargetIcon },
  ];

  return (
    <div className="mv2 mv2-collab-shell">
      <header className="mv2-collab-header">
        <div className="mv2-collab-user">
          {me?.foto ? <img src={me.foto} alt="" className="mv2-avatar" /> : <div className="mv2-avatar" />}
          <div style={{ minWidth: 0 }}>
            <div className="mv2-collab-name">{me?.apelido || me?.nome || 'Minhas vendas'}</div>
            <div className="mv2-collab-role">Colaborador{me?.setor ? ` · ${me.setor}` : ''}</div>
          </div>
        </div>
        <button className="mv2-collab-signout" onClick={() => signOut()}>
          Sair
        </button>
      </header>

      <div className="mv2-collab-body">
        <nav className="mv2-collab-nav">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <t.icon width={18} height={18} />
              {t.label}
            </NavLink>
          ))}
        </nav>

        <main className="mv2-collab-main">
          <Routes>
            <Route path="/" element={<MetasVendasPage />} />
            <Route path="/ranking" element={<CollaboratorRankingPage />} />
            {isBalcao && <Route path="/bio" element={<CollaboratorBioPage />} />}
            <Route path="/dinamicas" element={<CollaboratorDinamicasPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
