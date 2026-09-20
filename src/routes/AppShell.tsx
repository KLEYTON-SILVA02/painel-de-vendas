import { useQuery } from '@tanstack/react-query';
import { Suspense, lazy, useState } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { LockedStoreNotice } from '../components/LockedStoreNotice';
import { BackButton } from '../components/BackButton';
import { ChampionHeaderButton } from '../components/dashboard/ChampionOfDay';
import { ClosingClock } from '../components/ClosingClock';
import { BirthdayCelebrationHost } from '../components/BirthdayCelebration';
import { ConquistaCelebrationHost } from '../components/ConquistaCelebration';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { HamburgerIcon, MedalIcon } from '../components/icons/NavIcons';
import { NotificationBell } from '../components/NotificationBell';
import { PageLoading } from '../components/PageLoading';
import { Sidebar } from '../components/Sidebar';
import { VersionFooter } from '../components/VersionFooter';
import { useCategoryLabelMap } from '../lib/business/categoryLabels';
import type { GoalCategoryKey } from '../lib/business/classification';
import type { Horario } from '../lib/business/horario';
import { supabase } from '../lib/supabase';
import { useIsMobileV2 } from '../lib/useIsMobileV2';
import { useIsPlatformBuilder, useStoreSettings } from '../lib/queries';
import { DateRangeProvider } from './DateRangeContext';
import { HelpModeProvider, useHelpMode } from './HelpModeContext';

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
const TutoriaisPage = lazy(() => import('./admin/TutoriaisPage').then((m) => ({ default: m.TutoriaisPage })));
const GaleriaFigurinhasPage = lazy(() => import('./conquistas/GaleriaFigurinhasPage').then((m) => ({ default: m.GaleriaFigurinhasPage })));
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
const NomesCategoriasPage = lazy(() => import('./admin/NomesCategoriasPage').then((m) => ({ default: m.NomesCategoriasPage })));
const SuportePage = lazy(() => import('./admin/SuportePage').then((m) => ({ default: m.SuportePage })));
const BuilderStorePickerPage = lazy(() => import('./admin/BuilderStorePickerPage').then((m) => ({ default: m.BuilderStorePickerPage })));
const CategoryTypePage = lazy(() => import('./category-type/CategoryTypePage').then((m) => ({ default: m.CategoryTypePage })));
// Reused from the collaborator shell — the notification list itself (tabs,
// read-state handling) has nothing collaborator-specific in it, it just
// renders whichever feed `audience` points it at (see useNotifications).
const CollaboratorNotificacoesPage = lazy(() =>
  import('./collaborator/CollaboratorNotificacoesPage').then((m) => ({ default: m.CollaboratorNotificacoesPage })),
);

// Screen titles that used to open each screen's own filter-bar cell now live
// here instead, centered in the top bar next to the store name — freeing up
// the vertical space they took inside that cell for the ranking/content
// below. Keyed by exact pathname (desktop admin routes only; mobile-v2 and
// collaborator shells never reach this header at all).
const PAGE_TITLES: Record<string, { label: string; color: string; categoryKey?: GoalCategoryKey }> = {
  '/ranking': { label: '🏆 Ranking Geral', color: '#00f0ff' },
  '/categoria/DERM': { label: '🩹 Dermocosméticos', color: '#ff3df0', categoryKey: 'DERM' },
  '/categoria/GEN': { label: '💊 Genérico', color: '#14ff00', categoryKey: 'GEN' },
  '/categoria/MP': { label: '🏷️ Marcas Exclusivas', color: '#a82bff', categoryKey: 'MP' },
  '/categoria/MER': { label: '📦 Mercadoria Geral', color: '#ff6a00', categoryKey: 'MER' },
  '/categoria/LEVMEL': { label: '🍯 Levmel', color: '#ffb700', categoryKey: 'LEVMEL' },
  '/categoria/CHIP': { label: '🔴 Chip', color: '#00e5ff', categoryKey: 'CHIP' },
  '/bio': { label: '🧪 BIOSINTÉTICA — Ranking Balcão', color: '#14ff00' },
  '/dinamicas': { label: '🎯 Dinâmicas Comerciais', color: '#a82bff' },
};
// Emoji prefixes above stay fixed; only the name after the emoji is
// store-overridable (see useCategoryLabelMap) for the 6 fixed-category rows.
function pageTitleLabel(entry: { label: string; categoryKey?: GoalCategoryKey }, categoryLabels: Record<GoalCategoryKey, string>): string {
  if (!entry.categoryKey) return entry.label;
  const emoji = entry.label.split(' ')[0];
  return `${emoji} ${categoryLabels[entry.categoryKey]}`;
}

export function AppShell() {
  const { profile } = useAuth();
  // Acesso Construtor (Fase 2): autenticado, mas sem profile ainda, é o
  // estado normal de quem está na allow-list platform_builders e ainda não
  // escolheu uma loja — só dispara essa checagem extra nesse caso raro,
  // não para todo login normal de ADM/colaborador.
  const { data: isPlatformBuilder } = useIsPlatformBuilder(!profile);
  const categoryLabels = useCategoryLabelMap();
  const [collapsed, setCollapsed] = useState(true);
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
    if (isPlatformBuilder) {
      return (
        <Suspense fallback={<PageLoading fullScreen />}>
          <BuilderStorePickerPage />
        </Suspense>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 text-sm">
        Preparando sua conta…
      </div>
    );
  }

  // Sistema privado (não público/gratuito): toda loja nova nasce 'pending'
  // (ver migration 0076) e fica sem acesso a nenhuma tabela até ser aprovada
  // — inclusive para quem já tem profile (admin ou colaborador). storeQuery
  // continua enxergando a própria linha de `stores` mesmo pendente (policy
  // aditiva dedicada a isso), então dá pra mostrar o motivo em vez de travar
  // silenciosamente ou deixar a tela quebrar tentando carregar dados vazios.
  if (storeQuery.isLoading) {
    return <PageLoading fullScreen />;
  }
  if (storeQuery.data && storeQuery.data.status !== 'active') {
    return <LockedStoreNotice status={storeQuery.data.status} />;
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
        {/* MobileAdminShell reuses several desktop ADM pages verbatim
            (Produtos, Auditoria, Categorias, Colaboradores, Configurações,
            Importar, Conquistas, Metas) — all of which render <HelpTip>,
            and useHelpMode() throws if no HelpModeProvider is above it in
            the tree. Missing here, this crashed every one of those screens
            on mobile with "Algo deu errado" (confirmed via the render-error
            report a real occurrence left in client_error_reports). */}
        <HelpModeProvider>
          <Suspense fallback={<PageLoading fullScreen />}>
            <MobileAdminShell />
          </Suspense>
        </HelpModeProvider>
      </DateRangeProvider>
    );
  }

  return (
    <DateRangeProvider>
      <HelpModeProvider>
      <ConquistaCelebrationHost />
      <BirthdayCelebrationHost />
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
                {/* Only the ADM maintenance screens (Colaboradores,
                    Produtos, Importar, etc.) are reached exclusively by
                    drilling into the /admin landing grid, with no sidebar
                    link of their own — that's the "secondary screen" this
                    back button targets. Every other route already has a
                    sidebar link to get back to it directly. */}
                {location.pathname.startsWith('/admin/') && <BackButton />}
                <div className="min-w-0">
                  <h1 className="text-lg font-semibold truncate">{storeQuery.data?.nome_loja || 'Painel de Gestão de Vendas'}</h1>
                  <p className="text-xs text-slate-400">Administrador</p>
                </div>
              </div>
              <div className="text-center min-w-0 px-2">
                {PAGE_TITLES[location.pathname] && (
                  <h2 className="text-sm font-semibold truncate" style={{ color: PAGE_TITLES[location.pathname].color }}>
                    {pageTitleLabel(PAGE_TITLES[location.pathname], categoryLabels)}
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
                <HelpModeToggle />
                <NotificationBell audience="admin" />
              </div>
            </div>
          </header>
          <main className="p-3">
          {/* Keyed by pathname so a crash in one screen (caught here instead
              of by the app-wide boundary in App.tsx) doesn't strand the
              user on a dead "Algo deu errado" card forever — clicking any
              other sidebar link changes the key, which remounts a fresh
              boundary instead of reusing one still stuck in error state,
              recovering without a full page reload and without losing the
              session/sidebar. */}
          <ErrorBoundary key={location.pathname}>
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
            <Route path="/conquistas/figurinhas" element={<GaleriaFigurinhasPage />} />
            <Route path="/tutoriais" element={<TutoriaisPage />} />
            <Route path="/notificacoes" element={<CollaboratorNotificacoesPage audience="admin" />} />
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
                    <Route path="nomes-categorias" element={<NomesCategoriasPage />} />
                    <Route path="suporte" element={<SuportePage />} />
                  </Routes>
                </Suspense>
              }
            />
          </Routes>
          </Suspense>
          </ErrorBoundary>
          </main>
        </div>
      </div>
      <VersionFooter />
      </HelpModeProvider>
    </DateRangeProvider>
  );
}

/** Botão "?" do header que liga/desliga os balões de ajuda (<HelpTip>) do
 * sistema inteiro — ligado por padrão, para quem está começando; some assim
 * que o próprio ADM decide que não precisa mais. */
function HelpModeToggle() {
  const { helpModeEnabled, toggleHelpMode } = useHelpMode();
  return (
    <button
      type="button"
      onClick={toggleHelpMode}
      title={helpModeEnabled ? 'Desligar balões de ajuda' : 'Ligar balões de ajuda'}
      className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-semibold"
      style={
        helpModeEnabled
          ? { borderColor: '#00f0ff', background: '#00f0ff', color: '#001a1c' }
          : { borderColor: '#334155', color: '#94a3b8', background: 'transparent' }
      }
    >
      ?
    </button>
  );
}
