import { useAuth } from '../auth/AuthContext';

/** Mostrada no lugar do app inteiro (admin ou colaborador) quando o ciclo
 * de uso da loja venceu e passou da margem de segurança (ver
 * src/lib/business/billingCycle.ts) — nunca quando a loja simplesmente
 * nunca teve um ciclo cadastrado. Login e senha continuam intactos: isto é
 * só uma tela, não um bloqueio de RLS (ver migration 0100 e o artefato
 * "Ciclo de Uso e Suspensão por Loja" — Opção B, deliberadamente sem tocar
 * em `stores.status`/`current_store_id()`). */
export function BillingBlockedNotice() {
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4">
      <div className="max-w-sm w-full rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center flex flex-col items-center gap-3">
        <span className="text-3xl">🕒</span>
        <h1 className="text-base font-semibold">Regularização pendente</h1>
        <p className="text-sm text-slate-400">
          O ciclo de uso desta loja venceu. O acesso ao sistema fica suspenso até a renovação ser confirmada — seu
          login e senha continuam os mesmos. Entre em contato para regularizar o pagamento.
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
