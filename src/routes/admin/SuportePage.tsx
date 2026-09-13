import { useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useReauthGuard } from '../../hooks/useReauthGuard';
import { PASSWORD_HINT, validatePassword } from '../../lib/passwordPolicy';
import { useEnterStoreAsBuilder, useExitBuilderSession, useTransferAdministration } from '../../lib/mutations';
import { useCollaborators, useCollaboratorsWithLogin, useIsPlatformBuilder, useStore, useStoresForBuilder } from '../../lib/queries';
import { supabase } from '../../lib/supabase';

// Área de Suporte — Fase 1 (troca de senha, transferência de administração,
// e-mail de recuperação) pedida explicitamente pelo usuário pra separar sua
// conta pessoal do dia a dia de uma loja, e Fase 2 ("Acesso Construtor":
// login pessoal + allow-list pra entrar em qualquer loja, sem senha mestre
// — ver migration 0072). O fluxo de pedido de autorização remota + bloqueio
// de tela pra outros usuários continua fora do escopo, de propósito.
export function SuportePage() {
  const { session, signOut } = useAuth();
  const { data: isPlatformBuilder } = useIsPlatformBuilder();

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-1">🛡️ Área de Suporte</h3>
        <p className="text-xs text-slate-500">
          Troque sua própria senha, cadastre um e-mail de recuperação para sua conta, ou transfira a administração
          desta loja para outro colaborador.
        </p>
      </div>

      <TrocaSenhaCard email={session?.user.email} />
      <EmailRecuperacaoCard email={session?.user.email} />
      <TransferenciaAdminCard onTransferred={signOut} />
      {isPlatformBuilder && <AcessoConstrutorCard />}
    </div>
  );
}

function TrocaSenhaCard({ email }: { email: string | undefined }) {
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!email) {
      setError('Sessão inválida — faça login novamente.');
      return;
    }
    const policyError = validatePassword(novaSenha);
    if (policyError) {
      setError(policyError);
      return;
    }
    if (novaSenha !== confirmaSenha) {
      setError('As senhas novas não coincidem.');
      return;
    }
    setBusy(true);
    try {
      // Reconfirma a senha atual antes de trocar — mesma lógica do
      // ReauthModal (uma sessão logada e esquecida na tela não deveria
      // bastar pra trocar a senha sozinha).
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: senhaAtual });
      if (signInErr) {
        setError('Senha atual incorreta.');
        return;
      }
      const { error: updateErr } = await supabase.auth.updateUser({ password: novaSenha });
      if (updateErr) {
        setError(updateErr.message);
        return;
      }
      setSenhaAtual('');
      setNovaSenha('');
      setConfirmaSenha('');
      setSuccess(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="font-semibold mb-1 text-sm">🔑 Trocar minha senha</h3>
      <p className="text-xs text-slate-500 mb-3">Troca a senha da sua própria conta de administrador.</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 max-w-sm">
        <input
          type="password"
          required
          placeholder="Senha atual"
          value={senhaAtual}
          onChange={(e) => setSenhaAtual(e.target.value)}
          className="input"
        />
        <input
          type="password"
          required
          placeholder={PASSWORD_HINT}
          value={novaSenha}
          onChange={(e) => setNovaSenha(e.target.value)}
          className="input"
        />
        <input
          type="password"
          required
          placeholder="Confirmar nova senha"
          value={confirmaSenha}
          onChange={(e) => setConfirmaSenha(e.target.value)}
          className="input"
        />
        {error && <p className="text-xs text-rose-400">{error}</p>}
        {success && <p className="text-xs text-green-400">Senha atualizada com sucesso.</p>}
        <button
          type="submit"
          disabled={busy}
          className="self-start rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? 'Salvando…' : 'Trocar senha'}
        </button>
      </form>
    </div>
  );
}

function EmailRecuperacaoCard({ email }: { email: string | undefined }) {
  const [novoEmail, setNovoEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSent(false);
    setBusy(true);
    try {
      // Fluxo nativo do Supabase Auth: ele mesmo envia o link de confirmação
      // pro e-mail novo (e, por padrão, avisa o antigo também) — o e-mail só
      // vira o oficial da conta depois que o link é confirmado.
      const { error: updateErr } = await supabase.auth.updateUser({ email: novoEmail.trim() });
      if (updateErr) {
        setError(updateErr.message);
        return;
      }
      setNovoEmail('');
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="font-semibold mb-1 text-sm">📧 E-mail de recuperação</h3>
      <p className="text-xs text-slate-500 mb-3">
        {email ? (
          <>
            E-mail atual: <b>{email}</b>.{' '}
          </>
        ) : null}
        Cadastre um e-mail de verdade para poder recuperar sua senha caso esqueça — o sistema envia um link de
        confirmação para o e-mail novo antes de ativá-lo.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 max-w-md">
        <input
          type="email"
          required
          placeholder="novo@email.com"
          value={novoEmail}
          onChange={(e) => setNovoEmail(e.target.value)}
          className="input flex-1"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? 'Enviando…' : 'Enviar confirmação'}
        </button>
      </form>
      {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
      {sent && <p className="text-xs text-green-400 mt-2">Link de confirmação enviado — confira a caixa de entrada do novo e-mail.</p>}
    </div>
  );
}

function TransferenciaAdminCard({ onTransferred }: { onTransferred: () => Promise<void> }) {
  const { data: collaborators } = useCollaborators();
  const { data: withLogin } = useCollaboratorsWithLogin();
  const transfer = useTransferAdministration();
  const { guard, reauthModal } = useReauthGuard();
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Só quem já tem login pode virar ADM — a promoção só reaproveita o
  // acesso que já existe (mesma senha de sempre), sem criar credencial
  // nova. Se ainda não tem, o ADM cria o acesso em Colaboradores primeiro.
  const elegiveis = (collaborators ?? []).filter((c) => withLogin?.has(c.id));

  function handleTransferClick() {
    const target = elegiveis.find((c) => c.id === selectedId);
    if (!target) return;
    setError(null);
    guard(
      `Isso vai transferir a administração desta loja para "${target.apelido || target.nome}". Você (ADM atual) perde o acesso administrativo desta loja imediatamente e será desconectado. Essa ação não pode ser desfeita por aqui.`,
      async () => {
        try {
          await transfer.mutateAsync(selectedId);
          setDone(true);
          setTimeout(() => onTransferred(), 1800);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Falha ao transferir a administração.');
        }
      },
      'Confirmar transferência',
    );
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-1 text-sm">🔁 Transferência de administração</h3>
        <p className="text-xs text-green-400">Administração transferida com sucesso. Encerrando sua sessão…</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-rose-900/60 bg-rose-950/10 p-4">
      {reauthModal}
      <h3 className="font-semibold mb-1 text-sm text-rose-400">🔁 Transferência de administração</h3>
      <p className="text-xs text-slate-500 mb-3">
        Passe o título de administrador desta loja para um colaborador que já tenha acesso (crie o acesso dele antes,
        em Colaboradores). Depois de transferir, só ele fica com acesso ADM — sua sessão atual é encerrada, mas sua
        conta pessoal continua existindo normalmente.
      </p>
      {elegiveis.length === 0 ? (
        <p className="text-xs text-slate-500">
          Nenhum colaborador com acesso ainda. Crie o acesso de alguém em Colaboradores ("🔑 Criar acesso") antes de
          transferir.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="input !w-auto">
            <option value="">Selecione um colaborador…</option>
            {elegiveis.map((c) => (
              <option key={c.id} value={c.id}>
                {c.apelido || c.nome} (#{c.matricula})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleTransferClick}
            disabled={!selectedId || transfer.isPending}
            className="rounded-lg bg-rose-600 text-white font-medium px-4 py-2 text-sm disabled:opacity-50"
          >
            {transfer.isPending ? 'Transferindo…' : 'Transferir administração'}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
    </div>
  );
}

function AcessoConstrutorCard() {
  const { refreshProfile } = useAuth();
  const { data: currentStore } = useStore();
  const { data: stores } = useStoresForBuilder();
  const enterStore = useEnterStoreAsBuilder();
  const exitSession = useExitBuilderSession();
  const [targetId, setTargetId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const outrasLojas = (stores ?? []).filter((s) => s.id !== currentStore?.id);

  async function handleSwitch() {
    if (!targetId) return;
    setError(null);
    setBusy(true);
    try {
      await enterStore.mutateAsync(targetId);
      await refreshProfile();
      setTargetId('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao entrar na loja.');
    } finally {
      setBusy(false);
    }
  }

  async function handleExit() {
    setError(null);
    setBusy(true);
    try {
      await exitSession.mutateAsync();
      await refreshProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao sair do modo Construtor.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-cyan-500/40 bg-cyan-500/5 p-4">
      <h3 className="font-semibold mb-1 text-sm text-cyan-400">🛠️ Acesso Construtor</h3>
      <p className="text-xs text-slate-500 mb-3">
        Loja atual: <b>{currentStore?.nome_loja || '—'}</b> (#{currentStore?.numero_loja || '—'}). Troque para outra
        loja ou saia do modo Construtor para voltar à tela de seleção.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="input !w-auto">
          <option value="">Ir para outra loja…</option>
          {outrasLojas.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome_loja || '(sem nome)'} (#{s.numero_loja || '—'})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleSwitch}
          disabled={!targetId || busy}
          className="rounded-lg border border-cyan-500 text-cyan-400 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Entrar
        </button>
        <button
          type="button"
          onClick={handleExit}
          disabled={busy}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          Sair do modo Construtor
        </button>
      </div>
      {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
    </div>
  );
}
