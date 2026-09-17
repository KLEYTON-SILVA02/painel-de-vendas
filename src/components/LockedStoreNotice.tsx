import { useAuth } from '../auth/AuthContext';

/** Shown instead of the whole app (admin or collaborator alike — see the
 * gate in AppShell.tsx) while a store's `stores.status` isn't 'active'.
 * Sistema privado, não público/gratuito (ver migration 0076): toda loja
 * nova nasce 'pending' e só ganha acesso quando aprovada manualmente. */
export function LockedStoreNotice({ status }: { status: string }) {
  const { signOut } = useAuth();
  const rejected = status === 'rejected';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4">
      <div className="max-w-sm w-full rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center flex flex-col items-center gap-3">
        <span className="text-3xl">{rejected ? '🚫' : '⏳'}</span>
        <h1 className="text-base font-semibold">{rejected ? 'Cadastro não aprovado' : 'Aguardando aprovação'}</h1>
        <p className="text-sm text-slate-400">
          {rejected
            ? 'O acesso a este cadastro não foi aprovado. Se acha que isso é um engano, entre em contato com quem administra o sistema.'
            : 'Sua conta foi criada, mas o acesso só é liberado depois de aprovado. Assim que isso acontecer, é só entrar novamente.'}
        </p>
        <button
          onClick={() => signOut()}
          className="mt-2 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          Sair
        </button>
      </div>
    </div>
  );
}
