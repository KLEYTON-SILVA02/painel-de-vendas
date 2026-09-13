import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useEnterStoreAsBuilder } from '../../lib/mutations';
import { useStoresForBuilder } from '../../lib/queries';
import { normalize } from '../../lib/business/normalize';

// Acesso Construtor (Fase 2) — tela mostrada quando a conta logada está na
// allow-list `platform_builders` mas ainda não "entrou" em nenhuma loja
// (sem profile). Reaproveita o próprio login pessoal do usuário, sem senha
// mestre — ver migration 0072_platform_builder_access.sql.
export function BuilderStorePickerPage() {
  const { session, signOut, refreshProfile } = useAuth();
  const { data: stores } = useStoresForBuilder();
  const enterStore = useEnterStoreAsBuilder();
  const [busca, setBusca] = useState('');
  const [error, setError] = useState<string | null>(null);

  const buscaNormalizada = normalize(busca.trim());
  const filtradas = (stores ?? []).filter(
    (s) => !buscaNormalizada || normalize(s.nome_loja ?? '').includes(buscaNormalizada) || normalize(s.numero_loja ?? '').includes(buscaNormalizada),
  );

  async function handleEnter(storeId: string) {
    setError(null);
    try {
      await enterStore.mutateAsync(storeId);
      await refreshProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao entrar na loja.');
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-cyan-500/40 bg-slate-900 p-6">
        <h3 className="font-semibold text-lg mb-1">🛠️ Acesso Construtor</h3>
        <p className="text-xs text-slate-500 mb-4">
          Logado como <b>{session?.user.email}</b>. Escolha uma loja para entrar como administrador dela.
        </p>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou número da loja…"
          className="input w-full mb-3"
          autoFocus
        />
        {!stores ? (
          <p className="text-xs text-slate-500 text-center py-4">Carregando lojas…</p>
        ) : filtradas.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">Nenhuma loja encontrada.</p>
        ) : (
          <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
            {filtradas.map((s) => (
              <button
                key={s.id}
                onClick={() => handleEnter(s.id)}
                disabled={enterStore.isPending}
                className="text-left rounded-xl border border-slate-800 bg-slate-950/60 p-3 hover:border-cyan-500 disabled:opacity-50"
              >
                <div className="text-sm font-semibold">{s.nome_loja || '(sem nome)'}</div>
                <div className="text-xs text-slate-500">#{s.numero_loja || '—'}</div>
              </button>
            ))}
          </div>
        )}
        {error && <p className="text-xs text-rose-400 mt-3">{error}</p>}
        <button onClick={() => signOut()} className="mt-4 text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2">
          Sair da conta
        </button>
      </div>
    </div>
  );
}
