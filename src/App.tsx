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
