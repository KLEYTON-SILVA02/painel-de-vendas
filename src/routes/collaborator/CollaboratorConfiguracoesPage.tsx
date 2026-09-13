import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { PhotoCropModal } from '../../components/PhotoCropModal';
import { useRequestNewPassword, useUpdateOwnCollaboratorPhoto, useUpdateOwnCollaboratorUsername } from '../../lib/mutations';
import { useCollaborators, useMyPasswordRequest } from '../../lib/queries';
import { uploadPhoto } from '../../lib/storage';

// Collaborator-only self-service settings, reached via the menu in the
// avatar/name button on CollaboratorShell's topbar (not a bottom-nav tab —
// this isn't something opened often enough to earn one of the few tab
// slots). Own avatar + own Galeria de Conquistas photo (used on the Card de
// Campeão) upload directly here — narrow RLS scopes both to only the
// caller's own collaborator row (see update_own_collaborator_photo,
// migration 0047; storage self-write policies, migration 0046) — plus
// "Solicitar nova senha", which just files a password_requests row for the
// ADM to see and act on (migration 0045).
export function CollaboratorConfiguracoesPage() {
  const { profile } = useAuth();
  const { data: collaborators } = useCollaborators();
  const { data: myRequest } = useMyPasswordRequest();
  const updatePhoto = useUpdateOwnCollaboratorPhoto();
  const updateUsername = useUpdateOwnCollaboratorUsername();
  const requestPassword = useRequestNewPassword(profile?.store_id, profile?.collaborator_id ?? undefined);

  const [cropTarget, setCropTarget] = useState<'avatar' | 'conquista' | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [usernameSaved, setUsernameSaved] = useState(false);

  const me = collaborators?.find((c) => c.id === profile?.collaborator_id);
  const pendente = myRequest?.status === 'pendente';

  // Seeds the input from the loaded value exactly once — after that the
  // field is the user's own draft, not something to keep overwriting every
  // time `collaborators` refetches in the background.
  useEffect(() => {
    if (me && !usernameDraft) setUsernameDraft(me.username ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.username]);

  function handleSaveUsername() {
    setUsernameSaved(false);
    updateUsername.mutate(usernameDraft.trim(), { onSuccess: () => setUsernameSaved(true) });
  }

  function handleFileSelected(target: 'avatar' | 'conquista', file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    setPendingFile(file);
    setCropTarget(target);
  }

  async function handleCropped(blob: Blob) {
    if (!profile?.store_id || !cropTarget) return;
    setUploading(true);
    setUploadError(null);
    try {
      const file = new File([blob], 'foto.webp', { type: 'image/webp' });
      const collaboratorId = profile.collaborator_id;
      if (!collaboratorId) return;
      const path = cropTarget === 'avatar' ? `collaborators/${collaboratorId}` : `collaborators/${collaboratorId}-conquista`;
      const url = await uploadPhoto(profile.store_id, path, file);
      await updatePhoto.mutateAsync(cropTarget === 'avatar' ? { fotoUrl: url } : { fotoConquistaUrl: url });
    } catch (err) {
      // Antes, uma falha aqui (rede, RLS, formato de imagem não suportado
      // pelo celular) era engolida em silêncio: o modal fechava e a tela
      // voltava ao normal como se nada tivesse acontecido, sem nenhuma
      // indicação de que a foto não foi salva.
      setUploadError(err instanceof Error ? err.message : 'Não foi possível salvar a foto. Tente novamente.');
    } finally {
      setUploading(false);
      setCropTarget(null);
    }
  }

  return (
    <div>
      <div className="mv2-screen-title" style={{ ['--mv2-accent' as string]: '#00f0ff' }}>
        CONFIGURAÇÕES
      </div>

      <div className="mv2-card">
        <div className="mv2-card-title">Minhas fotos</div>
        <div style={{ display: 'flex', gap: 24, justifyContent: 'center', padding: '4px 0' }}>
          <PhotoField label="Avatar" url={me?.foto ?? null} uploading={uploading} onSelect={(f) => handleFileSelected('avatar', f)} />
          <PhotoField
            label="Foto p/ Conquistas"
            url={me?.fotoConquista ?? null}
            uploading={uploading}
            onSelect={(f) => handleFileSelected('conquista', f)}
          />
        </div>
        {uploadError && <p style={{ fontSize: 11, color: '#ff8a8a', textAlign: 'center', marginTop: 8 }}>{uploadError}</p>}
      </div>

      <div className="mv2-card">
        <div className="mv2-card-title">Nome de usuário</div>
        <p style={{ fontSize: 11, color: 'var(--mv2-texto-2)', marginBottom: 10 }}>
          Escolha um nome de usuário para entrar no app no lugar da matrícula ({me?.matricula}). Sua senha continua a
          mesma — isso só troca o que você digita para entrar.
        </p>
        <input
          value={usernameDraft}
          onChange={(e) => {
            setUsernameDraft(e.target.value);
            setUsernameSaved(false);
          }}
          placeholder="ex: joao.silva"
          className="mv2-input"
          style={{ width: '100%', marginBottom: 8 }}
          maxLength={32}
        />
        <button
          onClick={handleSaveUsername}
          disabled={updateUsername.isPending || !usernameDraft.trim() || usernameDraft.trim() === (me?.username ?? '')}
          className="mv2-btn-outline"
          style={{ width: '100%' }}
        >
          {updateUsername.isPending ? 'Salvando…' : 'Salvar nome de usuário'}
        </button>
        {updateUsername.error && (
          <p style={{ fontSize: 11, color: '#ff8a8a', marginTop: 8 }}>
            {updateUsername.error instanceof Error ? updateUsername.error.message : 'Não foi possível salvar.'}
          </p>
        )}
        {usernameSaved && !updateUsername.error && (
          <p style={{ fontSize: 11, color: '#7fe7a8', marginTop: 8 }}>✓ Nome de usuário atualizado.</p>
        )}
      </div>

      <div className="mv2-card">
        <div className="mv2-card-title">Senha de acesso</div>
        <p style={{ fontSize: 11, color: 'var(--mv2-texto-2)', marginBottom: 10 }}>
          Esqueceu sua senha? Solicite uma nova diretamente para a ADM — ela vai gerar uma nova senha para você.
        </p>
        <button
          onClick={() => requestPassword.mutate()}
          disabled={requestPassword.isPending || pendente}
          className="mv2-btn-outline"
          style={{ width: '100%' }}
        >
          {pendente ? '✓ Solicitação enviada — aguarde a ADM' : requestPassword.isPending ? 'Enviando…' : 'Solicitar nova senha'}
        </button>
      </div>

      {cropTarget && pendingFile && (
        <PhotoCropModal
          file={pendingFile}
          title={cropTarget === 'avatar' ? 'Ajustar avatar' : 'Ajustar foto da Galeria de Conquistas'}
          onCancel={() => setCropTarget(null)}
          onCropped={handleCropped}
        />
      )}
    </div>
  );
}

function PhotoField({
  label,
  url,
  uploading,
  onSelect,
}: {
  label: string;
  url: string | null;
  uploading: boolean;
  onSelect: (file: File | undefined) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <label style={{ position: 'relative', cursor: 'pointer' }}>
        {url ? (
          <img src={url} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--mv2-bg-input)' }} />
        )}
        <span
          style={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            background: '#0d0f0d',
            border: '1px solid rgba(255,255,255,.2)',
            borderRadius: '50%',
            width: 22,
            height: 22,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
          }}
        >
          {uploading ? '…' : '📷'}
        </span>
        <input type="file" accept="image/*" hidden onChange={(e) => onSelect(e.target.files?.[0])} />
      </label>
      <span style={{ fontSize: 10, color: 'var(--mv2-texto-2)', textAlign: 'center' }}>{label}</span>
    </div>
  );
}
