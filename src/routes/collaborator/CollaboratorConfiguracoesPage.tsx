import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { PhotoCropModal } from '../../components/PhotoCropModal';
import { useRequestNewPassword, useUpdateOwnCollaboratorPhoto } from '../../lib/mutations';
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
  const requestPassword = useRequestNewPassword(profile?.store_id, profile?.collaborator_id ?? undefined);

  const [cropTarget, setCropTarget] = useState<'avatar' | 'conquista' | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const me = collaborators?.find((c) => c.id === profile?.collaborator_id);
  const pendente = myRequest?.status === 'pendente';

  function handleFileSelected(target: 'avatar' | 'conquista', file: File | undefined) {
    if (!file) return;
    setPendingFile(file);
    setCropTarget(target);
  }

  async function handleCropped(blob: Blob) {
    if (!profile?.store_id || !cropTarget) return;
    setUploading(true);
    try {
      const file = new File([blob], 'foto.webp', { type: 'image/webp' });
      const collaboratorId = profile.collaborator_id;
      if (!collaboratorId) return;
      const path = cropTarget === 'avatar' ? `collaborators/${collaboratorId}` : `collaborators/${collaboratorId}-conquista`;
      const url = await uploadPhoto(profile.store_id, path, file);
      await updatePhoto.mutateAsync(cropTarget === 'avatar' ? { fotoUrl: url } : { fotoConquistaUrl: url });
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
