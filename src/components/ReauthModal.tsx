import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';

/** Re-verifies the signed-in admin's own password before a destructive
 * action proceeds — a plain window.confirm() only checks "did the ADM mean
 * to click this", not "is this still the ADM at the keyboard" (an
 * unattended, still-logged-in session is enough to wipe data otherwise).
 * Re-authenticates by calling signInWithPassword again with the session's
 * own e-mail: on success it silently refreshes the session (harmless, same
 * user) and calls onConfirm; on failure it shows an error and blocks. */
export function ReauthModal({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  const { session } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const email = session?.user.email;
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
      onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onCancel}>
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-rose-900/60 bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-1 text-rose-400">⚠️ Confirme sua senha</h3>
        <p className="text-xs text-slate-400 mb-4">{message}</p>
        <input
          type="password"
          required
          autoFocus
          placeholder="Sua senha de administrador"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
        />
        {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300">
            Cancelar
          </button>
          <button type="submit" disabled={busy} className="flex-1 rounded-lg bg-rose-600 text-white font-medium px-3 py-2 text-sm disabled:opacity-50">
            {busy ? 'Verificando…' : 'Confirmar e excluir'}
          </button>
        </div>
      </form>
    </div>
  );
}
