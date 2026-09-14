import { useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useEnterStoreAsBuilder } from '../../lib/mutations';
import { useStoresForBuilder } from '../../lib/queries';
import { normalize } from '../../lib/business/normalize';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';

// Acesso Construtor (Fase 2) — tela mostrada quando a conta logada está na
// allow-list `platform_builders` mas ainda não "entrou" em nenhuma loja
// (sem profile). Reaproveita o próprio login pessoal do usuário, sem senha
// mestre — ver migration 0072_platform_builder_access.sql.
//
// Por segurança, a lista de lojas só é buscada/exibida depois que a senha
// da própria conta é reconfirmada aqui (`unlocked`) — uma sessão logada e
// esquecida na tela não deveria bastar para ver quais lojas existem no
// sistema. O e-mail fica fixo (vem da sessão atual), evitando o risco de
// `signInWithPassword` trocar de conta se alguém digitasse outro e-mail.
export function BuilderStorePickerPage() {
  const { session, signOut } = useAuth();
  const [unlocked, setUnlocked] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-cyan-500/40 bg-slate-900 p-6">
        <h3 className="font-semibold text-lg mb-1">🛠️ Acesso Construtor</h3>
        <p className="text-xs text-slate-500 mb-4">Logado como <b>{session?.user.email}</b>.</p>
        {unlocked ? (
          <StorePicker onSignOut={signOut} />
        ) : (
          <UnlockGate email={session?.user.email} onUnlocked={() => setUnlocked(true)} onSignOut={signOut} />
        )}
      </div>
    </div>
  );
}

function UnlockGate({ email, onUnlocked, onSignOut }: { email: string | undefined; onUnlocked: () => void; onSignOut: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email) {
      setError('Sessão inválida — faça login novamente.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) {
        setError('Senha incorreta.');
        return;
      }
      onUnlocked();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">
        Por segurança, confirme sua senha de administrador para ver a lista de lojas cadastradas.
      </p>
      <input
        type="password"
        required
        autoFocus
        placeholder="Sua senha"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="input"
      />
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <button type="submit" disabled={busy} className="rounded-xl bg-cyan-500 text-slate-950 font-semibold px-3 py-2 text-sm disabled:opacity-50">
        {busy ? 'Verificando…' : 'Desbloquear lista de lojas'}
      </button>
      <button type="button" onClick={() => onSignOut()} className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2 self-start">
        Sair da conta
      </button>
    </form>
  );
}

function StorePicker({ onSignOut }: { onSignOut: () => void }) {
  const { refreshProfile } = useAuth();
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
      setError(errorMessage(e, 'Falha ao entrar na loja.'));
    }
  }

  return (
    <>
      <p className="text-xs text-slate-500 mb-4">Escolha uma loja para entrar como administrador dela.</p>
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
      <button onClick={() => onSignOut()} className="mt-4 text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2">
        Sair da conta
      </button>
    </>
  );
}
