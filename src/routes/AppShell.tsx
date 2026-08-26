import { useQuery } from '@tanstack/react-query';
import { NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import { DashboardPage } from './dashboard/DashboardPage';
import { DateRangeProvider } from './DateRangeContext';
import { RankingPage } from './ranking/RankingPage';

const NAV_ITEMS = [
  { to: '/', label: 'Início', end: true },
  { to: '/ranking', label: 'Ranking', end: false },
];

export function AppShell() {
  const { profile, signOut } = useAuth();

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

  return (
    <DateRangeProvider>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-6">
            <div>
              <h1 className="text-lg font-semibold">{storeQuery.data?.nome_loja || 'Painel de Gestão de Vendas'}</h1>
              <p className="text-xs text-slate-400">{profile.role === 'admin' ? 'Administrador' : 'Colaborador'}</p>
            </div>
            {profile.role === 'admin' && (
              <nav className="flex gap-1">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-cyan-500 text-slate-950 font-medium' : 'text-slate-300 hover:bg-slate-800'}`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            )}
          </div>
          <button
            onClick={() => signOut()}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            Sair
          </button>
        </header>
        <main className="p-6">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/ranking" element={<RankingPage />} />
          </Routes>
        </main>
      </div>
    </DateRangeProvider>
  );
}
