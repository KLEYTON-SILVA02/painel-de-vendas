import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type Tab = 'admin' | 'colaborador';

export function LoginPage() {
  const [tab, setTab] = useState<Tab>('admin');

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-xl">
        <h1 className="text-2xl font-semibold text-center mb-1">Painel de Gestão de Vendas</h1>
        <p className="text-center text-slate-400 text-sm mb-6">Entre para continuar</p>

        <div className="flex mb-6 rounded-lg bg-slate-800 p-1 text-sm">
          <button
            className={`flex-1 rounded-md py-1.5 transition ${tab === 'admin' ? 'bg-cyan-500 text-slate-950 font-medium' : 'text-slate-300'}`}
            onClick={() => setTab('admin')}
          >
            Administrador
          </button>
          <button
            className={`flex-1 rounded-md py-1.5 transition ${tab === 'colaborador' ? 'bg-cyan-500 text-slate-950 font-medium' : 'text-slate-300'}`}
            onClick={() => setTab('colaborador')}
          >
            Colaborador
          </button>
        </div>

        {tab === 'admin' ? <AdminLoginForm /> : <CollaboratorLoginForm />}
      </div>
    </div>
  );
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-sm text-rose-400 mt-2">{message}</p>;
}

function AdminLoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) setError('E-mail ou senha inválidos.');
      } else {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) setError(err.message);
        else setError('Conta criada. Verifique o e-mail se a confirmação estiver ativa, ou apenas entre.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input
        type="email"
        required
        placeholder="E-mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
      />
      <input
        type="password"
        required
        minLength={6}
        placeholder="Senha"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
      />
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-cyan-500 text-slate-950 font-medium py-2 text-sm disabled:opacity-50"
      >
        {mode === 'login' ? 'Entrar' : 'Criar conta de administrador'}
      </button>
      <FieldError message={error} />
      <button
        type="button"
        className="w-full text-xs text-slate-400 hover:text-slate-200 mt-1"
        onClick={() => {
          setMode(mode === 'login' ? 'signup' : 'login');
          setError(null);
        }}
      >
        {mode === 'login' ? 'Primeiro acesso? Criar conta de administrador' : 'Já tenho conta — entrar'}
      </button>
    </form>
  );
}

function CollaboratorLoginForm() {
  const [matricula, setMatricula] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { data: email, error: resolveErr } = await supabase.rpc('resolve_collaborator_email', {
        p_matricula: matricula,
      });
      if (resolveErr || !email) {
        setError('Matrícula não encontrada.');
        return;
      }
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) setError('Matrícula ou senha inválidos.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input
        type="text"
        required
        placeholder="Matrícula"
        value={matricula}
        onChange={(e) => setMatricula(e.target.value)}
        className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
      />
      <input
        type="password"
        required
        placeholder="Senha"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
      />
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-cyan-500 text-slate-950 font-medium py-2 text-sm disabled:opacity-50"
      >
        Entrar
      </button>
      <FieldError message={error} />
    </form>
  );
}
