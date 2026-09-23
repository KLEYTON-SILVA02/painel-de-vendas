import { Suspense, lazy, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { BackButton } from '../../components/BackButton';
import { ConquistaCelebrationHost } from '../../components/ConquistaCelebration';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { PageLoading } from '../../components/PageLoading';
import { Sidebar } from '../../components/Sidebar';
import { VersionFooter } from '../../components/VersionFooter';
import { HamburgerIcon } from '../../components/icons/NavIcons';
import { useResolvePasswordRequest } from '../../lib/mutations';
import { useCollaborators, usePendingPasswordRequests, useStore } from '../../lib/queries';

// Every screen below is lazy-loaded: this shell previously imported all of
// them (plus every desktop /admin/* maintenance page) statically at the top
// of the file, which forces the bundler to fetch+parse every one of those
// chunks up front before the shell can render anything — on mobile that's
// ~65kB gzip of JS the device has to download and parse before "Início"
// even paints, regardless of which single screen the user actually opened.
// AppShell.tsx (desktop) already lazy-loads these same pages; this mirrors
// that so the mobile shell gets the same benefit instead of quietly
// re-eagering them via its own static imports.
const AdminLandingPage = lazy(() => import('../admin/AdminLandingPage').then((m) => ({ default: m.AdminLandingPage })));
const AuditoriaPage = lazy(() => import('../admin/AuditoriaPage').then((m) => ({ default: m.AuditoriaPage })));
const ListaVendasPage = lazy(() => import('../admin/ListaVendasPage').then((m) => ({ default: m.ListaVendasPage })));
const BackupPage = lazy(() => import('../admin/BackupPage').then((m) => ({ default: m.BackupPage })));
const CardConquistaPage = lazy(() => import('../admin/CardConquistaPage').then((m) => ({ default: m.CardConquistaPage })));
const CategoriasPage = lazy(() => import('../admin/CategoriasPage').then((m) => ({ default: m.CategoriasPage })));
const CategoryTypePage = lazy(() => import('../category-type/CategoryTypePage').then((m) => ({ default: m.CategoryTypePage })));
const ColaboradoresPage = lazy(() => import('../admin/ColaboradoresPage').then((m) => ({ default: m.ColaboradoresPage })));
const ConfiguracoesPage = lazy(() => import('../admin/ConfiguracoesPage').then((m) => ({ default: m.ConfiguracoesPage })));
const IconesPage = lazy(() => import('../admin/IconesPage').then((m) => ({ default: m.IconesPage })));
const MinhaLojaPage = lazy(() => import('../admin/MinhaLojaPage').then((m) => ({ default: m.MinhaLojaPage })));
const ProdutosPage = lazy(() => import('../admin/ProdutosPage').then((m) => ({ default: m.ProdutosPage })));
const VendasArquivadasPage = lazy(() => import('../admin/VendasArquivadasPage').then((m) => ({ default: m.VendasArquivadasPage })));
const ConquistasPage = lazy(() => import('../conquistas/ConquistasPage').then((m) => ({ default: m.ConquistasPage })));
const GaleriaFigurinhasPage = lazy(() => import('../conquistas/GaleriaFigurinhasPage').then((m) => ({ default: m.GaleriaFigurinhasPage })));
const MetasPage = lazy(() => import('../metas/MetasPage').then((m) => ({ default: m.MetasPage })));
const MobileBioPage = lazy(() => import('./MobileBioPage').then((m) => ({ default: m.MobileBioPage })));
const MobileDinamicasPage = lazy(() => import('./MobileDinamicasPage').then((m) => ({ default: m.MobileDinamicasPage })));
const MobileDsmPage = lazy(() => import('./MobileDsmPage').then((m) => ({ default: m.MobileDsmPage })));
const MobileDermoPage = lazy(() => import('./MobileDermoPage').then((m) => ({ default: m.MobileDermoPage })));
const MobileExclusivasPage = lazy(() => import('./MobileExclusivasPage').then((m) => ({ default: m.MobileExclusivasPage })));
const MobileGenericosPage = lazy(() => import('./MobileGenericosPage').then((m) => ({ default: m.MobileGenericosPage })));
const MobileChipPage = lazy(() => import('./MobileChipPage').then((m) => ({ default: m.MobileChipPage })));
const MobileInicioPage = lazy(() => import('./MobileInicioPage').then((m) => ({ default: m.MobileInicioPage })));
const MobileLevmelPage = lazy(() => import('./MobileLevmelPage').then((m) => ({ default: m.MobileLevmelPage })));
const MobileMercadoriaGeralPage = lazy(() => import('./MobileMercadoriaGeralPage').then((m) => ({ default: m.MobileMercadoriaGeralPage })));
const MobileRankingPage = lazy(() => import('./MobileRankingPage').then((m) => ({ default: m.MobileRankingPage })));

// Mobile v2 admin shell: sticky topbar + slide-out drawer, replacing the
// desktop Sidebar below the 1024px breakpoint (see useIsMobileV2 /
// AppShell.tsx). Every category/function nav item used to also duplicate
// itself as a horizontal icon grid below the topbar — removed per request:
// those buttons now live only inside the drawer (the same desktop Sidebar,
// reused below as a slide-out — see the <Sidebar> usage below), reached via
// the hamburger button. Each screen migrates from its existing desktop
// component to a dedicated mv2-styled one as it's redesigned — until then
// the route falls back to the desktop page so navigation always works, just
// not yet in the new visual style.

// xlsx is a large parsing library — only the Importar screen needs it (same
// lazy-chunk rationale as the desktop shell).
const ImportarPage = lazy(() => import('../admin/ImportarPage').then((m) => ({ default: m.ImportarPage })));

export function MobileAdminShell() {
  const { signOut } = useAuth();
  const { data: store } = useStore();
  const { data: collaborators } = useCollaborators();
  const { data: pendingPasswordRequests } = usePendingPasswordRequests();
  const resolvePasswordRequest = useResolvePasswordRequest();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pwMenuOpen, setPwMenuOpen] = useState(false);

  function handleAttendRequest(requestId: string, collaboratorId: string) {
    resolvePasswordRequest.mutate(requestId);
    setPwMenuOpen(false);
    navigate('/admin/colaboradores', { state: { openResetFor: collaboratorId } });
  }

  return (
    <>
    <div className={`mv2 app-shell ${drawerOpen ? 'is-mobile-open' : ''}`} style={{ minHeight: '100vh' }}>
      <ConquistaCelebrationHost />
      {/* Same slide-out drawer the desktop Sidebar already uses below 640px
          (Sidebar.css) — reused here instead of duplicating a second nav,
          just without the "Importar Vendas" shortcut (desktop-only; see
          showImportButton). onToggleCollapsed closes the drawer instead of
          collapsing it to icons, since mobile has no collapsed/icons-only
          state to toggle into. */}
      <Sidebar
        collapsed={false}
        onToggleCollapsed={() => setDrawerOpen(false)}
        logoUrl={store?.logo_url}
        onNavigate={() => setDrawerOpen(false)}
        showImportButton={false}
      />
      <div className="sb-backdrop" onClick={() => setDrawerOpen(false)} />
      <header className="mv2-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <button className="sb-hamburger" onClick={() => setDrawerOpen(true)} aria-label="Abrir menu">
            <HamburgerIcon />
          </button>
          {/* Same reasoning as AppShell.tsx's desktop back button: only the
              /admin/* maintenance screens are reached exclusively by
              drilling into the ADM grid, with no menu link of their own. */}
          {location.pathname.startsWith('/admin/') && <BackButton style={{ borderColor: 'var(--mv2-ciano-claro)', color: 'var(--mv2-ciano-claro)' }} />}
          <div className="mv2-store-info" title={store?.nome_loja || undefined}>
            🛍️ {store?.nome_loja || 'Gestão de Vendas'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Relocated from the (now-removed) category icon grid, where it
              lived as a badge on the ADM icon — that grid is gone (categories
              now live only in the drawer), so this is the only remaining
              on-screen hint of a pending request. */}
          {!!pendingPasswordRequests?.length && (
            <div className="mv2-collab-menu-wrap">
              <button
                className="mv2-icon-btn"
                title="Solicitações de nova senha"
                onClick={() => setPwMenuOpen((v) => !v)}
                style={{ position: 'relative', fontSize: 14 }}
              >
                🔑
                <span className="mv2-cat-badge" style={{ position: 'absolute', top: -6, right: -8 }}>
                  {pendingPasswordRequests.length}
                </span>
              </button>
              {pwMenuOpen && (
                <>
                  <div className="mv2-collab-menu-backdrop" onClick={() => setPwMenuOpen(false)} />
                  <div className="mv2-collab-menu" style={{ minWidth: 220, right: 0, left: 'auto' }}>
                    {pendingPasswordRequests.map((req) => {
                      const c = collaborators?.find((col) => col.id === req.collaborator_id);
                      return (
                        <button key={req.id} onClick={() => handleAttendRequest(req.id, req.collaborator_id)}>
                          🔑 {c?.apelido || c?.nome || 'Colaborador'}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
          <button className="mv2-icon-btn" title="Sair" onClick={() => signOut()} style={{ fontSize: 10 }}>
            ⏻
          </button>
        </div>
      </header>

      <main style={{ paddingBottom: 24 }}>
        {/* Keyed by pathname — a crash in one screen recovers by tapping any
            other drawer item instead of needing a full reload, same
            reasoning as the desktop AppShell. */}
        <ErrorBoundary key={location.pathname}>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<MobileInicioPage />} />
            <Route path="/ranking" element={<MobileRankingPage />} />
            <Route path="/categoria/DERM" element={<MobileDermoPage />} />
            <Route path="/categoria/GEN" element={<MobileGenericosPage />} />
            <Route path="/categoria/MP" element={<MobileExclusivasPage />} />
            <Route path="/categoria/MER" element={<MobileMercadoriaGeralPage />} />
            <Route path="/categoria/LEVMEL" element={<MobileLevmelPage />} />
            <Route path="/categoria/CHIP" element={<MobileChipPage />} />
            <Route path="/metas" element={<MetasPage />} />
            <Route path="/dinamicas" element={<MobileDinamicasPage />} />
            <Route path="/bio" element={<MobileBioPage />} />
            <Route path="/dsm" element={<MobileDsmPage />} />
            <Route path="/conquistas" element={<ConquistasPage />} />
            <Route path="/conquistas/figurinhas" element={<GaleriaFigurinhasPage />} />
            <Route path="/categoria-parceria/:chave" element={<CategoryTypePage />} />
            <Route path="/admin" element={<AdminLandingPage />} />
            <Route path="/admin/colaboradores" element={<ColaboradoresPage />} />
            <Route path="/admin/produtos" element={<ProdutosPage />} />
            <Route path="/admin/importar" element={<ImportarPage />} />
            <Route path="/admin/auditoria" element={<AuditoriaPage />} />
            <Route path="/admin/vendas" element={<ListaVendasPage />} />
            <Route path="/admin/vendas-arquivadas" element={<VendasArquivadasPage />} />
            <Route path="/admin/backup" element={<BackupPage />} />
            <Route path="/admin/minha-loja" element={<MinhaLojaPage />} />
            <Route path="/admin/configuracoes" element={<ConfiguracoesPage />} />
            <Route path="/admin/icones" element={<IconesPage />} />
            <Route path="/admin/card-conquista" element={<CardConquistaPage />} />
            <Route path="/admin/categorias" element={<CategoriasPage />} />
          </Routes>
        </Suspense>
        </ErrorBoundary>
      </main>
    </div>
    <VersionFooter />
    </>
  );
}
