import { useQuery } from '@tanstack/react-query';
import { Suspense, lazy } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import { AdminLandingPage } from './admin/AdminLandingPage';
import { AuditoriaPage } from './admin/AuditoriaPage';
import { BackupPage } from './admin/BackupPage';
import { ColaboradoresPage } from './admin/ColaboradoresPage';
import { ConfiguracoesPage } from './admin/ConfiguracoesPage';
import { MinhaLojaPage } from './admin/MinhaLojaPage';
import { ProdutosPage } from './admin/ProdutosPage';

// xlsx is a large parsing library — only the Importar screen needs it, so it
// gets its own chunk instead of bloating everyone else's initial load.
const ImportarPage = lazy(() => import('./admin/ImportarPage').then((m) => ({ default: m.ImportarPage })));
import { BioPage } from './bio/BioPage';
import { CategoryPage } from './category/CategoryPage';
import { CollaboratorHomePage } from './collaborator/CollaboratorHomePage';
import { DashboardPage } from './dashboard/DashboardPage';
import { DateRangeProvider } from './DateRangeContext';
import { DinamicasPage } from './dinamicas/DinamicasPage';
import { MetasPage } from './metas/MetasPage';
import { RankingPage } from './ranking/RankingPage';

const NAV_ITEMS = [
  { to: '/', label: 'Início', end: true },
  { to: '/ranking', label: 'Ranking', end: false },
  { to: '/categoria/DERM', label: 'Dermo', end: false },
  { to: '/categoria/GEN', label: 'Gen/Sim', end: false },
  { to: '/categoria/MP', label: 'Marcas Excl.', end: false },
  { to: '/categoria/MER', label: 'Merc. Geral', end: false },
  { to: '/categoria/LEVMEL', label: 'Levmel', end: false },
  { to: '/categoria/CHIP', label: 'Chip', end: false },
  { to: '/dinamicas', label: 'Dinâmicas', end: false },
  { to: '/bio', label: 'Biosintética', end: false },
  { to: '/admin', label: 'ADM', end: false },
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

  // Collaborators get a wholly separate, minimal tree — not just hidden nav
  // links — so there is no route a collaborator could navigate to that
  // renders admin screens or other collaborators' data. The data itself is
  // also RLS-scoped server-side; this is defense in depth, not the only guard.
  if (profile.role !== 'admin') {
    return (
      <DateRangeProvider>
        <CollaboratorHomePage />
      </DateRangeProvider>
    );
  }

  return (
    <DateRangeProvider>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <header className="border-b border-slate-800 px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-semibold">{storeQuery.data?.nome_loja || 'Painel de Gestão de Vendas'}</h1>
              <p className="text-xs text-slate-400">Administrador</p>
            </div>
            <button
              onClick={() => signOut()}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              Sair
            </button>
          </div>
          <nav className="flex flex-wrap gap-1">
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
            <Route path="/admin" element={<AdminLandingPage />} />
            <Route path="/admin/colaboradores" element={<ColaboradoresPage />} />
            <Route path="/admin/produtos" element={<ProdutosPage />} />
            <Route
              path="/admin/importar"
              element={
                <Suspense fallback={<div className="text-sm text-slate-500 p-6">Carregando…</div>}>
                  <ImportarPage />
                </Suspense>
              }
            />
            <Route path="/admin/auditoria" element={<AuditoriaPage />} />
            <Route path="/admin/backup" element={<BackupPage />} />
            <Route path="/admin/minha-loja" element={<MinhaLojaPage />} />
            <Route path="/admin/configuracoes" element={<ConfiguracoesPage />} />
          </Routes>
        </main>
      </div>
    </DateRangeProvider>
  );
}
