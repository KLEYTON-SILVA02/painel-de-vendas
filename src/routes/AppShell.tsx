import { useQuery } from '@tanstack/react-query';
import { Suspense, lazy, useState } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ChampionHeaderButton } from '../components/dashboard/ChampionOfDay';
import { ClosingClock } from '../components/ClosingClock';
import { ConquistaCelebrationHost } from '../components/ConquistaCelebration';
import { HamburgerIcon, MedalIcon } from '../components/icons/NavIcons';
import { PageLoading } from '../components/PageLoading';
import { Sidebar } from '../components/Sidebar';
import type { Horario } from '../lib/business/horario';
import { supabase } from '../lib/supabase';
import { useIsMobileV2 } from '../lib/useIsMobileV2';
import { useStoreSettings } from '../lib/queries';
import { DateRangeProvider } from './DateRangeContext';

// Any one session only ever renders exactly one of these three trees
// (desktop admin routes below, or one of the shells here) — splitting them
// out means a collaborator's phone never downloads the desktop ADM screens,
// a desktop admin never downloads the mobile-v2 shell, etc. Same for the
// individual /admin/* maintenance screens: rarely visited relative to
// Início/Ranking/Categoria, so each gets its own chunk instead of bloating
// every user's initial load.
const CollaboratorShell = lazy(() => import('./collaborator/CollaboratorShell').then((m) => ({ default: m.CollaboratorShell })));
const MobileAdminShell = lazy(() => import('./admin-mobile/MobileAdminShell').then((m) => ({ default: m.MobileAdminShell })));
// Desktop admin's own top-level routes (Início/Ranking/Categoria/Metas/
// Dinâmicas/Bio/Conquistas + the /admin landing grid) used to be regular
// static imports — every one of them, and everything they in turn import,
// landed in the same initial chunk a desktop admin downloads just to see
// the Dashboard. Lazy like the /admin/* maintenance screens below: each
// becomes its own chunk, fetched only when that route is actually visited.
const AdminLandingPage = lazy(() => import('./admin/AdminLandingPage').then((m) => ({ default: m.AdminLandingPage })));
const BioPage = lazy(() => import('./bio/BioPage').then((m) => ({ default: m.BioPage })));
const CategoryPage = lazy(() => import('./category/CategoryPage').then((m) => ({ default: m.CategoryPage })));
const ConquistasPage = lazy(() => import('./conquistas/ConquistasPage').then((m) => ({ default: m.ConquistasPage })));
const DashboardPage = lazy(() => import('./dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const DinamicasPage = lazy(() => import('./dinamicas/DinamicasPage').then((m) => ({ default: m.DinamicasPage })));
const MetasPage = lazy(() => import('./metas/MetasPage').then((m) => ({ default: m.MetasPage })));
const RankingPage = lazy(() => import('./ranking/RankingPage').then((m) => ({ default: m.RankingPage })));
const ColaboradoresPage = lazy(() => import('./admin/ColaboradoresPage').then((m) => ({ default: m.ColaboradoresPage })));
const ProdutosPage = lazy(() => import('./admin/ProdutosPage').then((m) => ({ default: m.ProdutosPage })));
const ImportarPage = lazy(() => import('./admin/ImportarPage').then((m) => ({ default: m.ImportarPage })));
const AuditoriaPage = lazy(() => import('./admin/AuditoriaPage').then((m) => ({ default: m.AuditoriaPage })));
const ListaVendasPage = lazy(() => import('./admin/ListaVendasPage').then((m) => ({ default: m.ListaVendasPage })));
const VendasArquivadasPage = lazy(() => import('./admin/VendasArquivadasPage').then((m) => ({ default: m.VendasArquivadasPage })));
const BackupPage = lazy(() => import('./admin/BackupPage').then((m) => ({ default: m.BackupPage })));
const MinhaLojaPage = lazy(() => import('./admin/MinhaLojaPage').then((m) => ({ default: m.MinhaLojaPage })));
const ConfiguracoesPage = lazy(() => import('./admin/ConfiguracoesPage').then((m) => ({ default: m.ConfiguracoesPage })));
const IconesPage = lazy(() => import('./admin/IconesPage').then((m) => ({ default: m.IconesPage })));
const CardConquistaPage = lazy(() => import('./admin/CardConquistaPage').then((m) => ({ default: m.CardConquistaPage })));
const CategoriasPage = lazy(() => import('./admin/CategoriasPage').then((m) => ({ default: m.CategoriasPage })));
const CategoryTypePage = lazy(() => import('./category-type/CategoryTypePage').then((m) => ({ default: m.CategoryTypePage })));

// Screen titles that used to open each screen's own filter-bar cell now live
// here instead, centered in the top bar next to the store name — freeing up
// the vertical space they took inside that cell for the ranking/content
// below. Keyed by exact pathname (desktop admin routes only; mobile-v2 and
// collaborator shells never reach this header at all).
const PAGE_TITLES: Record<string, { label: string; color: string }> = {
  '/ranking': { label: '🏆 Ranking Geral', color: '#00f0ff' },
  '/categoria/DERM': { label: '🩹 Dermocosméticos', color: '#ff3df0' },
  '/categoria/GEN': { label: '💊 Genérico', color: '#14ff00' },
  '/categoria/MP': { label: '🏷️ Marcas Exclusivas', color: '#a82bff' },
  '/categoria/MER': { label: '📦 Mercadoria Geral', color: '#ff6a00' },
  '/categoria/LEVMEL': { label: '🍯 Levmel', color: '#ffb700' },
  '/categoria/CHIP': { label: '🔴 Chip', color: '#00e5ff' },
  '/bio': { label: '🧪 BIOSINTÉTICA — Ranking Balcão', color: '#14ff00' },
};

export function AppShell() {
  const { profile } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { data: storeSettings } = useStoreSettings();
  const isMobileV2 = useIsMobileV2();

  const storeQuery = useQuery({
    queryKey: ['store', profile?.store_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('*').single();
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 text-sm">
        Preparando sua conta…
      </div>
    );
  }

  // Collaborators get a wholly separate, minimal tree — not just hidden nav
  // links — so there is no route a collaborator could navigate to that
  // renders admin screens or other collaborators' data. The data itself is
  // also RLS-scoped server-side; this is defense in depth, not the only guard.
  if (profile.role !== 'admin') {
    return (
      <DateRangeProvider>
        <Suspense fallback={<PageLoading fullScreen />}>
          <CollaboratorShell />
        </Suspense>
      </DateRangeProvider>
    );
  }

  // Mobile v2 reskin (see the "Scanner Técnico" spec): below 1024px, admins
  // get the new topbar+category-menu shell instead of the desktop Sidebar.
  if (isMobileV2) {
    return (
      <DateRangeProvider>
        <Suspense fallback={<PageLoading fullScreen />}>
          <MobileAdminShell />
        </Suspense>
      </DateRangeProvider>
    );
  }

  return (
    <DateRangeProvider>
      <ConquistaCelebrationHost />
      <div className={`app-shell min-h-screen bg-slate-950 text-slate-100 ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}>
        <Sidebar
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((v) => !v)}
          logoUrl={storeQuery.data?.logo_url}
          onNavigate={() => setMobileOpen(false)}
        />
        <div className="sb-backdrop" onClick={() => setMobileOpen(false)} />
        <div className="app-content">
          <header className="border-b border-slate-800 px-6 py-4">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button className="sb-hamburger" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
                  <HamburgerIcon />
                </button>
                <div className="min-w-0">
                  <h1 className="text-lg font-semibold truncate">{storeQuery.data?.nome_loja || 'Painel de Gestão de Vendas'}</h1>
                  <p className="text-xs text-slate-400">Administrador</p>
                </div>
              </div>
              <div className="text-center min-w-0 px-2">
                {PAGE_TITLES[location.pathname] && (
                  <h2 className="text-sm font-semibold truncate" style={{ color: PAGE_TITLES[location.pathname].color }}>
                    {PAGE_TITLES[location.pathname].label}
                  </h2>
                )}
              </div>
              <div className="flex items-center gap-2 justify-self-end">
                <ChampionHeaderButton />
                <Link
                  to="/conquistas"
                  title="Galeria de Conquistas"
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold"
                  style={
                    location.pathname === '/conquistas'
                      ? { borderColor: '#ffb700', background: '#ffb700', color: '#231a02' }
                      : { borderColor: '#ffb700', color: '#ffb700', background: 'transparent' }
                  }
                >
                  <MedalIcon width={15} height={15} />
                  Galeria de Conquistas
                </Link>
                {storeSettings && (
                  <ClosingClock horario={storeSettings.horario as unknown as Horario} feriadosDatas={storeSettings.feriados_datas} />
                )}
              </div>
            </div>
          </header>
          <main className="p-3">
          <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/ranking" element={<RankingPage />} />
            <Route path="/categoria/DERM" element={<CategoryPage catKey="DERM" />} />
            <Route path="/categoria/GEN" element={<CategoryPage catKey="GEN" />} />
            <Route path="/categoria/MP" element={<CategoryPage catKey="MP" />} />
            <Route path="/categoria/MER" element={<CategoryPage catKey="MER" />} />
            <Route path="/categoria/LEVMEL" element={<CategoryPage catKey="LEVMEL" />} />
            <Route path="/categoria/CHIP" element={<CategoryPage catKey="CHIP" />} />
            <Route path="/metas" element={<MetasPage />} />
            <Route path="/dinamicas" element={<DinamicasPage />} />
            <Route path="/bio" element={<BioPage />} />
            <Route path="/conquistas" element={<ConquistasPage />} />
            <Route
              path="/categoria-parceria/:chave"
              element={
                <Suspense fallback={<PageLoading />}>
                  <CategoryTypePage />
                </Suspense>
              }
            />
            <Route path="/admin" element={<AdminLandingPage />} />
            <Route
              path="/admin/*"
              element={
                <Suspense fallback={<PageLoading />}>
                  <Routes>
                    <Route path="colaboradores" element={<ColaboradoresPage />} />
                    <Route path="produtos" element={<ProdutosPage />} />
                    <Route path="importar" element={<ImportarPage />} />
                    <Route path="auditoria" element={<AuditoriaPage />} />
                    <Route path="vendas" element={<ListaVendasPage />} />
                    <Route path="vendas-arquivadas" element={<VendasArquivadasPage />} />
                    <Route path="backup" element={<BackupPage />} />
                    <Route path="minha-loja" element={<MinhaLojaPage />} />
                    <Route path="configuracoes" element={<ConfiguracoesPage />} />
                    <Route path="icones" element={<IconesPage />} />
                    <Route path="card-conquista" element={<CardConquistaPage />} />
                    <Route path="categorias" element={<CategoriasPage />} />
                  </Routes>
                </Suspense>
              }
            />
          </Routes>
          </Suspense>
          </main>
        </div>
      </div>
    </DateRangeProvider>
  );
}
