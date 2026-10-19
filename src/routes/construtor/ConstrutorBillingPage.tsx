import { useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { LoginPage } from '../../auth/LoginPage';
import { PageLoading } from '../../components/PageLoading';
import { errorMessage } from '../../lib/errors';
import {
  BILLING_CYCLE_LABELS,
  BILLING_GRACE_DAYS,
  daysRemaining,
  type BillingCycleType,
} from '../../lib/business/billingCycle';
import { todayISO } from '../../lib/dateRange';
import { useIsPlatformBuilder, useStoresBillingForBuilder } from '../../lib/queries';
import { useStartOrRenewBillingCycle } from '../../lib/mutations';
import { supabase } from '../../lib/supabase';

// Rota /construtor (App.tsx) — terceiro modo de login, reaproveitando o
// mesmo login/senha de sempre e a mesma allow-list platform_builders do
// Acesso Construtor (migration 0072). Deliberadamente fora do fluxo normal
// de profile/store_id: entra aqui direto, sem nunca "ser" administrador de
// nenhuma loja específica — ver artefato "Ciclo de Uso e Suspensão por
// Loja". Gate independente do resto do app: não reaproveita AppShell.
export function ConstrutorGate() {
  const { session, loading, signOut } = useAuth();
  const { data: isPlatformBuilder, isLoading: checkingBuilder } = useIsPlatformBuilder(!!session);

  if (loading) return <PageLoading fullScreen />;
  if (!session) return <LoginPage />;
  if (checkingBuilder) return <PageLoading fullScreen />;

  if (!isPlatformBuilder) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4">
        <div className="max-w-sm w-full rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center flex flex-col items-center gap-3">
          <span className="text-3xl">🔒</span>
          <h1 className="text-base font-semibold">Acesso restrito</h1>
          <p className="text-sm text-slate-400">Esta conta não tem acesso ao Modo Construtor.</p>
          <button onClick={() => signOut()} className="mt-2 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
            Sair
          </button>
        </div>
      </div>
    );
  }

  return <ConstrutorBillingPage />;
}

function ConstrutorBillingPage() {
  const { session, signOut } = useAuth();
  const [unlocked, setUnlocked] = useState(false);
  const [confirmingExit, setConfirmingExit] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 flex flex-col items-center">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-lg font-semibold">🏗️ Modo Construtor — Ciclo de uso das lojas</h1>
            <p className="text-xs text-slate-500">Logado como <b>{session?.user.email}</b>.</p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmingExit(true)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 shrink-0"
          >
            Sair do Modo Construtor
          </button>
        </div>

        <div className="rounded-2xl border border-cyan-500/40 bg-slate-900 p-6">
          {unlocked ? <BillingTable /> : <UnlockGate email={session?.user.email} onUnlocked={() => setUnlocked(true)} />}
        </div>
      </div>

      {confirmingExit && (
        <ExitConfirmModal
          onConfirm={() => signOut()}
          onCancel={() => setConfirmingExit(false)}
        />
      )}
    </div>
  );
}

// Mesmo padrão de reconfirmação de senha já usado em BuilderStorePickerPage
// — uma sessão logada e esquecida na tela não deveria bastar para ver ou
// alterar o ciclo de uso de todas as lojas.
function UnlockGate({ email, onUnlocked }: { email: string | undefined; onUnlocked: () => void }) {
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
      <p className="text-xs text-slate-500">Por segurança, confirme sua senha para ver e alterar o ciclo de uso das lojas.</p>
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
      <button type="submit" disabled={busy} className="rounded-xl bg-cyan-500 text-slate-950 font-semibold px-3 py-2 text-sm disabled:opacity-50 self-start">
        {busy ? 'Verificando…' : 'Desbloquear'}
      </button>
    </form>
  );
}

function ExitConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onCancel}>
      <div className="max-w-sm w-full rounded-2xl border border-slate-800 bg-slate-900 p-6" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm mb-4">Você deseja sair do Modo Construtor?</p>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
            Não
          </button>
          <button type="button" onClick={onConfirm} className="rounded-lg bg-rose-600 text-white font-medium px-4 py-2 text-sm">
            Sim
          </button>
        </div>
      </div>
    </div>
  );
}

function BillingTable() {
  const { data: stores } = useStoresBillingForBuilder();
  const [renewingStoreId, setRenewingStoreId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!stores) {
    return <p className="text-xs text-slate-500 text-center py-4">Carregando lojas…</p>;
  }

  return (
    <>
      <p className="text-xs text-slate-500 mb-4">
        Lista única, igual para qualquer loja a partir da qual este modo seja aberto — nunca restrita a uma loja em
        particular.
      </p>
      <div className="flex flex-col gap-2">
        {stores.map((s) => (
          <StoreBillingRow
            key={s.store_id}
            store={s}
            renewing={renewingStoreId === s.store_id}
            onStartRenew={() => setRenewingStoreId(s.store_id)}
            onCancelRenew={() => setRenewingStoreId(null)}
            onError={setError}
          />
        ))}
      </div>
      {error && <p className="text-xs text-rose-400 mt-3">{error}</p>}
    </>
  );
}

type BuilderStoreBillingRow = {
  store_id: string;
  nome_loja: string | null;
  numero_loja: string | null;
  status: string;
  cycle_type: string | null;
  started_at: string | null;
  ends_at: string | null;
};

function StoreBillingRow({
  store,
  renewing,
  onStartRenew,
  onCancelRenew,
  onError,
}: {
  store: BuilderStoreBillingRow;
  renewing: boolean;
  onStartRenew: () => void;
  onCancelRenew: () => void;
  onError: (message: string) => void;
}) {
  const startOrRenew = useStartOrRenewBillingCycle();
  const [cycleType, setCycleType] = useState<BillingCycleType>('30');

  const remaining = store.ends_at ? daysRemaining(store.ends_at, todayISO()) : null;
  const blocked = remaining !== null && remaining < -BILLING_GRACE_DAYS;

  async function handleConfirm() {
    onError('');
    try {
      await startOrRenew.mutateAsync({ storeId: store.store_id, cycleType });
      onCancelRenew();
    } catch (e) {
      onError(errorMessage(e, 'Falha ao iniciar/renovar o ciclo.'));
    }
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold">{store.nome_loja || '(sem nome)'}</div>
          <div className="text-xs text-slate-500">#{store.numero_loja || '—'}</div>
        </div>
        <div className="text-right">
          {!store.ends_at ? (
            <span className="text-xs text-slate-500">Sem ciclo cadastrado</span>
          ) : blocked ? (
            <span className="text-xs text-rose-400">Vencido há {Math.abs(remaining!)} dia(s)</span>
          ) : (
            <span className="text-xs text-slate-400">
              {BILLING_CYCLE_LABELS[store.cycle_type as BillingCycleType] ?? store.cycle_type} — termina em{' '}
              {new Date(store.ends_at + 'T00:00:00').toLocaleDateString('pt-BR')} ({remaining} dia(s))
            </span>
          )}
        </div>
        {!renewing && (
          <button
            type="button"
            onClick={onStartRenew}
            className="rounded-lg border border-cyan-500 text-cyan-400 px-3 py-1.5 text-sm"
          >
            {store.ends_at ? 'Renovar ciclo' : 'Iniciar ciclo'}
          </button>
        )}
      </div>

      {renewing && (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <select value={cycleType} onChange={(e) => setCycleType(e.target.value as BillingCycleType)} className="input !w-auto">
            {Object.entries(BILLING_CYCLE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={startOrRenew.isPending}
            className="rounded-lg bg-cyan-500 text-slate-950 font-medium px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {startOrRenew.isPending ? 'Confirmando…' : 'Confirmar pagamento e aplicar'}
          </button>
          <button type="button" onClick={onCancelRenew} className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2">
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
