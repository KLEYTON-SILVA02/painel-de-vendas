import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';
import { ErrorBoundary } from './components/ErrorBoundary';
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 text-sm">
        Carregando…
      </div>
    );
  }

  return session ? <AppShell /> : <LoginPage />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <Root />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
