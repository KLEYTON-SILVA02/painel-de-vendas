import { NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { HomeIcon, LeafIcon, TargetIcon, TrophyIcon } from '../../components/icons/NavIcons';
import { BALCAO_SETOR } from '../../lib/business/bio';
import { useCollaborators } from '../../lib/queries';
import { CollaboratorBioPage } from './CollaboratorBioPage';
import { CollaboratorDinamicasPage } from './CollaboratorDinamicasPage';
import { CollaboratorRankingPage } from './CollaboratorRankingPage';
import { MetasVendasPage } from './MetasVendasPage';

// A small app of its own for collaborators: a header + a bottom tab bar
// (mobile-app style, matching the desktop admin Sidebar's iconography) that
// switches between Metas/Vendas, Ranking, Biosintética (Balcão only) and
// Dinâmicas — instead of the single static page this used to be.
export function CollaboratorShell() {
  const { profile, signOut } = useAuth();
  const { data: collaborators } = useCollaborators();
  const me = collaborators?.find((c) => c.id === profile?.collaborator_id);
  const isBalcao = me?.setor === BALCAO_SETOR;

  const tabs = [
    { to: '/', end: true, label: 'Metas/Vendas', icon: HomeIcon },
    { to: '/ranking', end: false, label: 'Ranking', icon: TrophyIcon },
    ...(isBalcao ? [{ to: '/bio', end: false, label: 'Biosintética', icon: LeafIcon }] : []),
    { to: '/dinamicas', end: false, label: 'Dinâmicas', icon: TargetIcon },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          {me?.foto ? (
            <img src={me.foto} alt="" className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-slate-700" />
          )}
          <div>
            <h1 className="text-sm font-semibold">{me?.apelido || me?.nome || 'Minhas vendas'}</h1>
            <p className="text-[11px] text-slate-400">Colaborador{me?.setor ? ` · ${me.setor}` : ''}</p>
          </div>
        </div>
        <button onClick={() => signOut()} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
          Sair
        </button>
      </header>

      <main className="flex-1 p-4 pb-24 max-w-2xl w-full mx-auto">
        <Routes>
          <Route path="/" element={<MetasVendasPage />} />
          <Route path="/ranking" element={<CollaboratorRankingPage />} />
          {isBalcao && <Route path="/bio" element={<CollaboratorBioPage />} />}
          <Route path="/dinamicas" element={<CollaboratorDinamicasPage />} />
        </Routes>
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 border-t border-slate-800 bg-slate-950/95 backdrop-blur flex"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold uppercase tracking-wide ${
                isActive ? 'text-cyan-400' : 'text-slate-500'
              }`
            }
          >
            <t.icon width={18} height={18} />
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
