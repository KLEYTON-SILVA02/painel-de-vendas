import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PageLoading } from './components/PageLoading';
import { queryPersister } from './lib/queryPersister';
import { useNativeAuthRefresh } from './lib/useNativeAuthRefresh';
import { useNativeStatusBarInset } from './lib/useNativeStatusBarInset';
import { AppShell } from './routes/AppShell';
import { PrivacyPolicyPage } from './routes/PrivacyPolicyPage';

// Defaults (staleTime 0, refetchOnWindowFocus true) meant every navigation
// and every tab/app focus re-ran every mounted query in the background —
// including the 30k+-row sales fetch — which is what made the app feel
// heavy. Cached data now stays fresh for a couple of minutes; the header's
// manual refresh button already calls invalidateQueries() when the user
// actually wants the latest numbers.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

// Allowlist for what's worth persisting to IndexedDB for an instant cold
// paint (see PersistQueryClientProvider below) — small, settings-shaped
// queries only. This is the actual fix for the app freezing on
// Configurações (and anywhere else with several mutations in a row): with
// no filter here, EVERY query still resident in the cache — starting with
// Dashboard's full sales history (queryKey ['sales'], routinely tens of
// thousands of rows) plus catalog/collaborators/keyword lists from
// whatever else was visited earlier in the session — got re-dehydrated,
// JSON.stringify'd and written to IndexedDB on every single mutation
// anywhere in the app (the persister subscribes to every cache
// add/update/remove event). Configurações felt like the culprit mainly
// because it's usually opened last (cache at its largest) and has the
// most back-to-back mutations of any screen (add/remove keyword, toggle a
// schedule, save weights...), but the actual cost scaled with the whole
// cache, not with anything Configurações itself does. An allowlist (opt
// IN) is used instead of excluding the known-big queries (opt out) so a
// future heavy query defaults to NOT being persisted instead of silently
// reintroducing this.
const PERSISTED_QUERY_KEYS = new Set([
  'store_settings',
  'store',
  'goals',
  'function_icons',
  'commission_rates',
  'category_types',
  'notification_schedules',
  'exclusive_brands',
  'brand_keywords',
  'bio_group_goals',
  'bio_groups',
]);

function Root() {
  return (
    <Routes>
      {/* Sem login — precisa ser alcançável por qualquer pessoa, incluindo
          o revisor da Play Store/App Store, que nunca terá uma conta de
          colaborador/ADM. */}
      <Route path="/privacidade" element={<PrivacyPolicyPage />} />
      <Route path="*" element={<AuthedRoot />} />
    </Routes>
  );
}

function AuthedRoot() {
  const { session, loading, bootError, retryBoot, signOut } = useAuth();

  if (loading) {
    return <PageLoading fullScreen />;
  }

  // getSession() (or its token refresh) failed or timed out — on an
  // unstable connection this used to leave `loading` true forever, so the
  // user just saw a spinner with no way out. This offers a retry (re-runs
  // the whole bootstrap) and a way to fall back to a clean login instead.
  if (bootError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
        <div className="max-w-sm w-full rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
          <h2 className="text-base font-semibold mb-2">Não foi possível conectar</h2>
          <p className="text-sm text-slate-400 mb-4">Verifique sua internet e tente de novo.</p>
          <div className="flex gap-2">
            <button onClick={retryBoot} className="flex-1 rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm">
              Tentar novamente
            </button>
            <button onClick={signOut} className="flex-1 rounded-lg border border-slate-700 text-slate-300 px-4 py-2 text-sm">
              Sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  return session ? <AppShell /> : <LoginPage />;
}

export default function App() {
  useNativeStatusBarInset();
  useNativeAuthRefresh();

  return (
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          // Plano de Ação Tartaruga (performance): every fresh page load —
          // a hard refresh, closing and reopening the tab, a PWA cold start
          // — used to start every query from scratch, screen blank until
          // the sales fetch (and everything else) finished. Persisting the
          // query cache to IndexedDB (via queryPersister) means a reload
          // can paint instantly from what was cached last session while
          // React Query silently revalidates in the background (per the
          // staleTime above) — the same "stale-while-revalidate" feel the
          // rest of this session's work has been aiming for, applied to a
          // cold load instead of a warm navigation.
          persister: queryPersister,
          // Bump this if a cached query's shape ever changes incompatibly
          // with what the code reading it expects — old entries under a
          // stale buster are dropped instead of handed to code that doesn't
          // know how to read them.
          buster: 'v1',
          maxAge: 24 * 60 * 60 * 1000,
          dehydrateOptions: {
            shouldDehydrateQuery: (query) =>
              query.state.status === 'success' &&
              typeof query.queryKey[0] === 'string' &&
              PERSISTED_QUERY_KEYS.has(query.queryKey[0]),
          },
        }}
      >
        <BrowserRouter>
          <AuthProvider>
            <Root />
          </AuthProvider>
        </BrowserRouter>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
}
