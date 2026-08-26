import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';

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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">
            {storeQuery.data?.nome_loja || 'Painel de Gestão de Vendas'}
          </h1>
          <p className="text-xs text-slate-400">
            {profile.role === 'admin' ? 'Administrador' : 'Colaborador'}
          </p>
        </div>
        <button
          onClick={() => signOut()}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
        >
          Sair
        </button>
      </header>
      <main className="p-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-300">
          Login funcionando — Dashboard, Ranking e demais telas chegam nas próximas etapas.
        </div>
      </main>
    </div>
  );
}
