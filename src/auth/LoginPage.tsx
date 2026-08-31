import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/login-retro-future.css';
import gvLogo from '../assets/brand/gv-logo.png';
import whatsappQr from '../assets/brand/whatsapp-qr.jpg';
import instagramQr from '../assets/brand/instagram-qr.jpg';

type Tab = 'admin' | 'colaborador';
type SocialModal = 'whatsapp' | 'instagram' | 'email' | null;

const WHATSAPP_URL = 'https://wa.me/qr/WEP75MIQBQSPB1';
const INSTAGRAM_URL = 'https://www.instagram.com/kleytonmsilva?igsi=MWM0bnNscmtjNGkxag==';
const EMAIL_ADDRESS = 'kleyton.silva.celular@gmail.com';

// Mobile v2 reskin (see mv2-* classes in src/styles/mobile-v2.css, ported
// 1:1 from the "Scanner Técnico" login spec). Auth logic is untouched —
// only the markup/classes changed. Remember-me and "Esqueci senha" are
// new UI the spec shows but never defines behavior for — visually
// complete but inert. WhatsApp/QR/Instagram open a modal with the
// contact's real QR code and link.
export function LoginPage() {
  const [tab, setTab] = useState<Tab>('admin');
  const [socialModal, setSocialModal] = useState<SocialModal>(null);

  return (
    <div className="mv2 mv2-login-page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="mv2-login-card">
        <div className="mv2-login-header">
          <div className="mv2-logo-ring">
            <img src={gvLogo} alt="Gestão de Vendas" />
          </div>
          <h1>GESTÃO DE VENDAS</h1>
          <div className="mv2-subtitle">Entre para continuar</div>
        </div>

        <div className="mv2-role-toggle">
          <button type="button" className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}>
            Administrador
          </button>
          <button type="button" className={tab === 'colaborador' ? 'active' : ''} onClick={() => setTab('colaborador')}>
            Colaborador
          </button>
        </div>

        {tab === 'admin' ? <AdminLoginForm /> : <CollaboratorLoginForm />}

        <div className="mv2-divider">ou</div>

        <div className="mv2-social-row">
          <button type="button" className="mv2-whatsapp" title="WhatsApp" onClick={() => setSocialModal('whatsapp')}>
            <WhatsAppIcon />
          </button>
          <button type="button" title="E-mail" onClick={() => setSocialModal('email')}>
            <EmailIcon />
          </button>
          <button type="button" className="mv2-instagram" title="Instagram" onClick={() => setSocialModal('instagram')}>
            <InstagramIcon />
          </button>
        </div>
      </div>

      {socialModal && (
        <SocialQrModal
          kind={socialModal}
          onClose={() => setSocialModal(null)}
        />
      )}
    </div>
  );
}

function SocialQrModal({ kind, onClose }: { kind: 'whatsapp' | 'instagram' | 'email'; onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // TODO: swap in the e-mail QR card image once it's available.
  const qrImage = kind === 'whatsapp' ? whatsappQr : kind === 'instagram' ? instagramQr : null;
  const url = kind === 'whatsapp' ? WHATSAPP_URL : kind === 'instagram' ? INSTAGRAM_URL : `mailto:${EMAIL_ADDRESS}`;
  const label = kind === 'whatsapp' ? 'WhatsApp' : kind === 'instagram' ? 'Instagram' : 'E-mail';

  return (
    <div className="mv2-qr-modal-backdrop" onClick={onClose}>
      <div className="mv2-qr-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="mv2-qr-modal-close" onClick={onClose} aria-label="Fechar">
          ×
        </button>
        {qrImage && <img src={qrImage} alt={`QR Code do ${label}`} className="mv2-qr-modal-image" />}
        <a href={url} target={kind === 'email' ? undefined : '_blank'} rel="noopener noreferrer" className="mv2-qr-modal-link">
          Abrir {label}
        </a>
      </div>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.29-1.39a9.9 9.9 0 0 0 4.75 1.21h.01c5.46 0 9.9-4.45 9.9-9.91C21.96 6.45 17.5 2 12.04 2Zm5.79 14.03c-.24.68-1.19 1.24-1.95 1.4-.53.11-1.22.2-3.55-.76-2.98-1.24-4.9-4.27-5.05-4.47-.15-.2-1.2-1.6-1.2-3.05 0-1.45.76-2.16 1.03-2.45.24-.27.58-.36.86-.36.14 0 .28.01.4.02.31.01.47.03.68.55.24.6.83 2.05.9 2.2.07.15.12.32.02.52-.09.2-.14.32-.28.49-.14.17-.29.38-.42.51-.14.14-.29.29-.13.57.16.28.7 1.16 1.51 1.88 1.04.93 1.9 1.22 2.19 1.36.29.14.46.12.63-.07.17-.19.72-.84.92-1.13.19-.28.39-.24.65-.14.27.09 1.71.81 2 .95.29.15.48.22.55.34.07.13.07.72-.17 1.4Z" />
    </svg>
  );
}
function EmailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
function InstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p style={{ color: '#ff8a8a', fontSize: 10, margin: 0 }}>{message}</p>;
}

function AdminLoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
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
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label className="mv2-input-group">
        <UserIcon />
        <input type="email" required placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="mv2-input-group">
        <LockIcon />
        <input type="password" required minLength={6} placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>

      <div className="mv2-form-row">
        <label className="mv2-remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Lembrar-me
        </label>
        <button type="button" className="mv2-forgot">
          Esqueci senha
        </button>
      </div>

      <button type="submit" disabled={busy} className="mv2-btn-primary">
        {mode === 'login' ? 'Entrar' : 'Criar conta de administrador'}
      </button>
      <FieldError message={error} />
      <button
        type="button"
        className="mv2-link-secondary"
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
  const [remember, setRemember] = useState(false);
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
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label className="mv2-input-group">
        <UserIcon />
        <input type="text" required placeholder="Matrícula" value={matricula} onChange={(e) => setMatricula(e.target.value)} />
      </label>
      <label className="mv2-input-group">
        <LockIcon />
        <input type="password" required placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>

      <div className="mv2-form-row">
        <label className="mv2-remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Lembrar-me
        </label>
        <button type="button" className="mv2-forgot">
          Esqueci senha
        </button>
      </div>

      <button type="submit" disabled={busy} className="mv2-btn-primary">
        Entrar
      </button>
      <FieldError message={error} />
    </form>
  );
}
