import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PageLoading } from './components/PageLoading';
import { queryPersister } from './lib/queryPersister';
import { AppShell } from './routes/AppShell';

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
  const { session, loading } = useAuth();

  if (loading) {
    return <PageLoading fullScreen />;
  }

  return session ? <AppShell /> : <LoginPage />;
}

export default function App() {
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
