import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Suspense, lazy, useState } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ClosingClock } from '../components/ClosingClock';
import { ConquistaCelebrationHost } from '../components/ConquistaCelebration';
import { HamburgerIcon, MedalIcon, RefreshIcon } from '../components/icons/NavIcons';
import { Sidebar } from '../components/Sidebar';
import type { Horario } from '../lib/business/horario';
import { supabase } from '../lib/supabase';
import { useIsMobileV2 } from '../lib/useIsMobileV2';
import { useAutoArchiveOldSales } from '../lib/archival';
import { useStoreSettings } from '../lib/queries';
import { AdminLandingPage } from './admin/AdminLandingPage';
import { BioPage } from './bio/BioPage';
import { CategoryPage } from './category/CategoryPage';
import { ConquistasPage } from './conquistas/ConquistasPage';
import { DashboardPage } from './dashboard/DashboardPage';
import { DateRangeProvider } from './DateRangeContext';
import { DinamicasPage } from './dinamicas/DinamicasPage';
import { MetasPage } from './metas/MetasPage';
import { RankingPage } from './ranking/RankingPage';

// Any one session only ever renders exactly one of these three trees
// (desktop admin routes below, or one of the shells here) — splitting them
// out means a collaborator's phone never downloads the desktop ADM screens,
// a desktop admin never downloads the mobile-v2 shell, etc. Same for the
// individual /admin/* maintenance screens: rarely visited relative to
// Início/Ranking/Categoria, so each gets its own chunk instead of bloating
// every user's initial load.
const CollaboratorShell = lazy(() => import('./collaborator/CollaboratorShell').then((m) => ({ default: m.CollaboratorShell })));
const MobileAdminShell = lazy(() => import('./admin-mobile/MobileAdminShell').then((m) => ({ default: m.MobileAdminShell })));
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

export function AppShell() {
  const { profile, signOut } = useAuth();
  useAutoArchiveOldSales();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const queryClient = useQueryClient();
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
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 text-sm">Carregando…</div>}>
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
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 text-sm">Carregando…</div>}>
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button className="sb-hamburger" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
                  <HamburgerIcon />
                </button>
                <div>
                  <h1 className="text-lg font-semibold">{storeQuery.data?.nome_loja || 'Painel de Gestão de Vendas'}</h1>
                  <p className="text-xs text-slate-400">Administrador</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    await queryClient.invalidateQueries();
                    setRefreshed(true);
                    setTimeout(() => setRefreshed(false), 1500);
                  }}
                  title="Atualizar"
                  className="flex items-center justify-center w-8 h-8 rounded-full border border-slate-700 bg-slate-900 text-slate-400 hover:text-cyan-400 hover:border-cyan-400"
                >
                  {refreshed ? '✓' : <RefreshIcon width={15} height={15} />}
                </button>
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
                <button
                  onClick={() => signOut()}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                >
                  Sair
                </button>
              </div>
            </div>
          </header>
          <main className="p-6">
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
            <Route path="/admin" element={<AdminLandingPage />} />
            <Route
              path="/admin/*"
              element={
                <Suspense fallback={<div className="text-sm text-slate-500 p-6">Carregando…</div>}>
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
                  </Routes>
                </Suspense>
              }
            />
          </Routes>
          </main>
        </div>
      </div>
    </DateRangeProvider>
  );
}
