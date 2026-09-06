import { useState, type ReactElement } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import {
  BagIcon,
  CoinIcon,
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
} from '../../components/icons/NavIcons';
import { NotificationBell } from '../../components/NotificationBell';
import { BALCAO_SETOR } from '../../lib/business/bio';
import { VISITANTE_SETOR } from '../../lib/business/types';
import { useNativePushRegistration } from '../../lib/useNativePushRegistration';
import { useCategoryTypes, useCollaborators } from '../../lib/queries';
import '../../styles/mobile-v2.css';
import { MobileChipPage } from '../admin-mobile/MobileChipPage';
import { MobileExclusivasPage } from '../admin-mobile/MobileExclusivasPage';
import { MobileGenericosPage } from '../admin-mobile/MobileGenericosPage';
import { MobileLevmelPage } from '../admin-mobile/MobileLevmelPage';
import { MobileMercadoriaGeralPage } from '../admin-mobile/MobileMercadoriaGeralPage';
import { MobileDermoPage } from '../admin-mobile/MobileDermoPage';
import { CollaboratorBioPage } from './CollaboratorBioPage';
import { CollaboratorComissoesPage } from './CollaboratorComissoesPage';
import { CollaboratorConfiguracoesPage } from './CollaboratorConfiguracoesPage';
import { CollaboratorDinamicasPage } from './CollaboratorDinamicasPage';
import { CollaboratorNotificacoesPage } from './CollaboratorNotificacoesPage';
import { CollaboratorRankingPage } from './CollaboratorRankingPage';
import { MetasVendasPage } from './MetasVendasPage';

// A view-only "Visitante" collaborator (VISITANTE_SETOR) has no
// Metas/Vendas/Ranking/Comissões/Dinâmicas — categoriasVisitante drives an
// entirely different, fixed tab set instead, one per checked category,
// reusing the same read-only mv2 screens the ADM mobile shell already
// mounts at /categoria/* (they render fine standalone — see
// MobileCategoryScreen/MobileUnitCategoryScreen, both already wrapped in
// DateRangeProvider by this shell same as the ADM one). Custom
// ADM-created categories aren't offered at registration (see
// visitorCategories.ts) so aren't handled here either.
const VISITOR_SCREENS: Record<string, { label: string; icon: typeof HomeIcon; element: ReactElement }> = {
  DERM: { label: 'Dermo', icon: DropletIcon, element: <MobileDermoPage /> },
  GEN: { label: 'Genéricos', icon: PillIcon, element: <MobileGenericosPage /> },
  MP: { label: 'Marcas Excl.', icon: TagIcon, element: <MobileExclusivasPage /> },
  MER: { label: 'Merc. Geral', icon: BagIcon, element: <MobileMercadoriaGeralPage /> },
  LEVMEL: { label: 'Levmel', icon: HexagonIcon, element: <MobileLevmelPage /> },
  CHIP: { label: 'Chip', icon: CpuIcon, element: <MobileChipPage /> },
  biosintetica: { label: 'Biosintética', icon: LeafIcon, element: <CollaboratorBioPage /> },
};

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
  const { data: categoryTypes } = useCategoryTypes();
  useNativePushRegistration(profile?.collaborator_id ?? undefined);
  const me = collaborators?.find((c) => c.id === profile?.collaborator_id);
  const isBalcao = me?.setor === BALCAO_SETOR;
  const isVisitante = me?.setor === VISITANTE_SETOR;
  // Biosintética isn't seeded for new stores (see Sidebar.tsx) — a Balcão
  // collaborator at a store that never created it shouldn't get a tab
  // pointing at a screen that has nothing to show. Same guard applies to a
  // Visitante checked for it.
  const hasBio = (categoryTypes ?? []).some((c) => c.chave === 'biosintetica');
  const [menuOpen, setMenuOpen] = useState(false);

  const visitorCategoryKeys = (me?.categoriasVisitante ?? []).filter(
    (key) => VISITOR_SCREENS[key] && (key !== 'biosintetica' || hasBio),
  );

  const tabs = isVisitante
    ? visitorCategoryKeys.map((key, i) => ({
        to: i === 0 ? '/' : `/visitante/${key}`,
        end: i === 0,
        label: VISITOR_SCREENS[key].label,
        icon: VISITOR_SCREENS[key].icon,
      }))
    : [
        { to: '/', end: true, label: 'Metas/Vendas', icon: HomeIcon },
        { to: '/ranking', end: false, label: 'Ranking', icon: TrophyIcon },
        { to: '/comissoes', end: false, label: 'Comissões', icon: CoinIcon },
        ...(isBalcao && hasBio ? [{ to: '/bio', end: false, label: 'Biosintética', icon: LeafIcon }] : []),
        { to: '/dinamicas', end: false, label: 'Dinâmicas', icon: TargetIcon },
      ];

  return (
    <div className="mv2 mv2-collab-shell">
      <header className="mv2-collab-header">
        <div className="mv2-collab-menu-wrap">
          <button className="mv2-collab-user-btn" onClick={() => setMenuOpen((v) => !v)}>
            {me?.foto ? <img src={me.foto} alt="" className="mv2-avatar" /> : <div className="mv2-avatar" />}
            <div style={{ minWidth: 0 }}>
              <div className="mv2-collab-name">{me?.apelido || me?.nome || 'Minhas vendas'}</div>
              <div className="mv2-collab-role">Colaborador{me?.setor ? ` · ${me.setor}` : ''}</div>
            </div>
          </button>
          {menuOpen && (
            <>
              <div className="mv2-collab-menu-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="mv2-collab-menu">
                <NavLink to="/configuracoes" onClick={() => setMenuOpen(false)}>
                  <SettingsIcon width={16} height={16} />
                  Configurações
                </NavLink>
                <button onClick={() => signOut()}>
                  <LogoutIcon width={16} height={16} />
                  Sair
                </button>
              </div>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <NotificationBell />
        </div>
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
            {isVisitante ? (
              visitorCategoryKeys.length === 0 ? (
                <Route
                  path="/"
                  element={
                    <div style={{ padding: 24, fontSize: 12, color: 'var(--mv2-texto-2)', textAlign: 'center' }}>
                      Nenhuma categoria liberada para visualização ainda. Fale com o administrador.
                    </div>
                  }
                />
              ) : (
                visitorCategoryKeys.map((key, i) => (
                  <Route key={key} path={i === 0 ? '/' : `/visitante/${key}`} element={VISITOR_SCREENS[key].element} />
                ))
              )
            ) : (
              <>
                <Route path="/" element={<MetasVendasPage />} />
                <Route path="/ranking" element={<CollaboratorRankingPage />} />
                <Route path="/comissoes" element={<CollaboratorComissoesPage />} />
                {isBalcao && hasBio && <Route path="/bio" element={<CollaboratorBioPage />} />}
                <Route path="/dinamicas" element={<CollaboratorDinamicasPage />} />
              </>
            )}
            <Route path="/configuracoes" element={<CollaboratorConfiguracoesPage />} />
            <Route path="/notificacoes" element={<CollaboratorNotificacoesPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
