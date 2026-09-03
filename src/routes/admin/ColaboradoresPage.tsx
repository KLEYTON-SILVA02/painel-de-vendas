import { useState, type FormEvent } from 'react';
import { PageLoading } from '../../components/PageLoading';
import { useAuth } from '../../auth/AuthContext';
import { SimpleSheetImportPanel } from '../../components/admin/SimpleSheetImportPanel';
import { PhotoCropModal } from '../../components/PhotoCropModal';
import { grantCollaboratorLogin } from '../../lib/collaborators';
import { daysSince, lastSaleDateFor } from '../../lib/business/summary';
import type { Collaborator } from '../../lib/business/types';
import { fmtMoney } from '../../lib/format';
import { useBulkUpsertCollaborators, useCreateCollaborator, useDeleteCollaborators, useUpdateCollaborator } from '../../lib/mutations';
import { useCollaborators, useCollaboratorsWithLogin, useSales } from '../../lib/queries';
import { uploadPhoto } from '../../lib/storage';

const SETORES = ['Balcão', 'Caixa', 'Dermoconsultora', 'Farmacêutico', 'Gerência'];

export function ColaboradoresPage() {
  const { profile } = useAuth();
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: withLogin } = useCollaboratorsWithLogin();
  const createCollaborator = useCreateCollaborator(profile?.store_id);
  const bulkUpsertCollaborators = useBulkUpsertCollaborators(profile?.store_id);
  const updateCollaborator = useUpdateCollaborator();
  const deleteCollaborators = useDeleteCollaborators();

  const [matricula, setMatricula] = useState('');
  const [nome, setNome] = useState('');
  const [apelido, setApelido] = useState('');
  const [setor, setSetor] = useState(SETORES[0]);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Collaborator | null>(null);
  const [grantingFor, setGrantingFor] = useState<Collaborator | null>(null);

  if (!collaborators || !sales || !withLogin) return <PageLoading />;

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!matricula.trim() || !nome.trim()) return;
    createCollaborator.mutate({ matricula: matricula.trim(), nome: nome.trim(), apelido: apelido.trim(), setor });
    setMatricula('');
    setNome('');
    setApelido('');
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDeleteSelected() {
    if (selected.size === 0) return;
    deleteCollaborators.mutate(Array.from(selected));
    setSelected(new Set());
    setSelectMode(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleAdd} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-3">Novo colaborador</h3>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Matrícula</label>
            <input value={matricula} onChange={(e) => setMatricula(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Nome completo</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Apelido</label>
            <input value={apelido} onChange={(e) => setApelido(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Setor</label>
            <select value={setor} onChange={(e) => setSetor(e.target.value)} className="input">
              {SETORES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm">
            + Adicionar
          </button>
        </div>
      </form>

      <SimpleSheetImportPanel
        title="Importar planilha de colaboradores"
        columns={['Código de venda', 'Nome', 'Apelido', 'Setor']}
        idColumnIndex={0}
        onConfirm={async (rows) => {
          const valid = rows.filter((r) => r[0]?.trim() && r[1]?.trim());
          if (valid.length === 0) return { count: 0, skipped: rows.length };
          await bulkUpsertCollaborators.mutateAsync(
            valid.map((r) => ({ matricula: r[0].trim(), nome: r[1].trim(), apelido: r[2]?.trim() || '', setor: r[3]?.trim() || SETORES[0] })),
          );
          return { count: valid.length, skipped: rows.length - valid.length };
        }}
      />

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold">Colaboradores ({collaborators.length})</h3>
          {collaborators.length > 0 && (
            <button
              onClick={() => {
                setSelectMode(!selectMode);
                setSelected(new Set());
              }}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              {selectMode ? 'Cancelar seleção' : 'Selecionar'}
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Colaboradores sem vendas há 60 dias ou mais aparecem como <b>Inativo</b>. Toque no card pra editar os
          dados e as fotos (avatar e foto da Galeria de Conquistas).
        </p>
        {selectMode && (
          <button
            onClick={handleDeleteSelected}
            disabled={selected.size === 0}
            className="mb-3 rounded-lg bg-rose-600 text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            Excluir selecionados ({selected.size})
          </button>
        )}
        {collaborators.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">Nenhum colaborador cadastrado.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {collaborators.map((c) => {
              const last = lastSaleDateFor(sales, c.matricula);
              const days = daysSince(last);
              const inativo = days !== null && days >= 60;
              const semVenda = last === null;
              const hasLogin = withLogin.has(c.id);
              return (
                <div
                  key={c.id}
                  className="relative rounded-xl bg-slate-950/60 border border-slate-800 p-3 flex flex-col items-center text-center gap-2 cursor-pointer hover:border-cyan-500"
                  onClick={() => setEditing(c)}
                >
                  {selectMode && (
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggleSelected(c.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-2 left-2"
                    />
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteCollaborators.mutate([c.id]);
                    }}
                    className="absolute top-2 right-2 text-slate-500 hover:text-rose-400"
                  >
                    ✕
                  </button>
                  {c.foto ? (
                    <img src={c.foto} alt="" className="w-16 h-16 rounded-full object-cover" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-slate-700" />
                  )}
                  <div className="min-w-0 w-full">
                    <div className="text-sm font-medium truncate">{c.apelido || c.nome}</div>
                    <div className="text-[11px] text-slate-500 font-mono truncate">#{c.matricula}</div>
                    <div className="text-[11px] text-slate-500 truncate">{c.setor || '-'}</div>
                    {c.metaIndividual > 0 && <div className="text-[11px] text-slate-500 truncate">meta {fmtMoney(c.metaIndividual)}</div>}
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full ${inativo ? 'bg-pink-500/20 text-pink-400' : 'bg-green-500/20 text-green-400'}`}
                  >
                    {inativo ? `Inativo${semVenda ? '' : ` · ${days}d`}` : 'Ativo'}
                  </span>
                  {!hasLogin && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setGrantingFor(c);
                      }}
                      className="text-[11px] rounded-lg border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800 w-full"
                    >
                      🔑 Criar acesso
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <EditCollaboratorModal
          collaborator={editing}
          storeId={profile?.store_id}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            updateCollaborator.mutate({ id: editing.id, patch });
            setEditing(null);
          }}
        />
      )}

      {grantingFor && <GrantLoginModal collaborator={grantingFor} onClose={() => setGrantingFor(null)} />}
    </div>
  );
}

function EditCollaboratorModal({
  collaborator,
  storeId,
  onClose,
  onSave,
}: {
  collaborator: Collaborator;
  storeId: string | undefined;
  onClose: () => void;
  onSave: (patch: { nome: string; apelido: string; setor: string; data_nascimento: string | null; foto_url?: string; foto_conquista_url?: string }) => void;
}) {
  const [nome, setNome] = useState(collaborator.nome);
  const [apelido, setApelido] = useState(collaborator.apelido || '');
  const [setor, setSetor] = useState(collaborator.setor || SETORES[0]);
  const [dataNascimento, setDataNascimento] = useState(collaborator.dataNascimento || '');
  const [foto, setFoto] = useState(collaborator.foto);
  const [fotoConquista, setFotoConquista] = useState(collaborator.fotoConquista ?? null);
  const [cropTarget, setCropTarget] = useState<'avatar' | 'conquista' | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  function handleFileSelected(target: 'avatar' | 'conquista', file: File | undefined) {
    if (!file) return;
    setPendingFile(file);
    setCropTarget(target);
  }

  async function handleCropped(blob: Blob) {
    if (!storeId || !cropTarget) return;
    setUploading(true);
    try {
      const file = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
      const path = cropTarget === 'avatar' ? `collaborators/${collaborator.id}` : `collaborators/${collaborator.id}-conquista`;
      const url = await uploadPhoto(storeId, path, file);
      if (cropTarget === 'avatar') setFoto(url);
      else setFotoConquista(url);
    } finally {
      setUploading(false);
      setCropTarget(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-4">Editar colaborador</h3>
        <div className="flex flex-col gap-3">
          <div className="flex gap-4 justify-center">
            <PhotoField label="Avatar" url={foto} uploading={uploading} onSelect={(f) => handleFileSelected('avatar', f)} />
            <PhotoField label="Foto p/ Conquistas" url={fotoConquista} uploading={uploading} onSelect={(f) => handleFileSelected('conquista', f)} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Matrícula</label>
            <input value={collaborator.matricula} disabled className="input opacity-50" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Nome completo</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Apelido</label>
            <input value={apelido} onChange={(e) => setApelido(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Setor</label>
            <select value={setor} onChange={(e) => setSetor(e.target.value)} className="input">
              {SETORES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Data de nascimento</label>
            <input type="date" value={dataNascimento} onChange={(e) => setDataNascimento(e.target.value)} className="input" />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300">
            Cancelar
          </button>
          <button
            onClick={() =>
              onSave({
                nome,
                apelido,
                setor,
                data_nascimento: dataNascimento || null,
                ...(foto !== collaborator.foto && { foto_url: foto ?? undefined }),
                ...(fotoConquista !== collaborator.fotoConquista && { foto_conquista_url: fotoConquista ?? undefined }),
              })
            }
            className="flex-1 rounded-lg bg-cyan-500 text-slate-950 font-medium px-3 py-2 text-sm"
          >
            Salvar
          </button>
        </div>
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
    <div className="flex flex-col items-center gap-1.5">
      <label className="relative cursor-pointer">
        {url ? (
          <img src={url} alt="" className="w-16 h-16 rounded-full object-cover" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-slate-700" />
        )}
        <span className="absolute -bottom-0.5 -right-0.5 bg-slate-800 rounded-full w-5 h-5 flex items-center justify-center text-[10px]">
          {uploading ? '…' : '📷'}
        </span>
        <input type="file" accept="image/*" className="hidden" onChange={(e) => onSelect(e.target.files?.[0])} />
      </label>
      <span className="text-[10px] text-slate-500 text-center">{label}</span>
    </div>
  );
}

function GrantLoginModal({ collaborator, onClose }: { collaborator: Collaborator; onClose: () => void }) {
  const [senha, setSenha] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await grantCollaboratorLogin(collaborator.id, senha);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar acesso');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-1">Criar acesso — {collaborator.apelido || collaborator.nome}</h3>
        <p className="text-xs text-slate-500 mb-4">
          O colaborador vai entrar usando a matrícula <b>#{collaborator.matricula}</b> e a senha definida aqui.
        </p>
        <input
          type="password"
          required
          minLength={6}
          placeholder="Senha (mín. 6 caracteres)"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="input"
        />
        {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300">
            Cancelar
          </button>
          <button type="submit" disabled={busy} className="flex-1 rounded-lg bg-cyan-500 text-slate-950 font-medium px-3 py-2 text-sm disabled:opacity-50">
            {busy ? 'Criando…' : 'Criar acesso'}
          </button>
        </div>
      </form>
    </div>
  );
}
