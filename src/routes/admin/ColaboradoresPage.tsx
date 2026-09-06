import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { PageLoading } from '../../components/PageLoading';
import { useAuth } from '../../auth/AuthContext';
import { SimpleSheetImportPanel } from '../../components/admin/SimpleSheetImportPanel';
import { PhotoCropModal } from '../../components/PhotoCropModal';
import { useReauthGuard } from '../../hooks/useReauthGuard';
import { grantCollaboratorLogin, resetCollaboratorLogin } from '../../lib/collaborators';
import { daysSince } from '../../lib/business/summary';
import { normalizeMatricula } from '../../lib/business/parsing';
import type { Collaborator } from '../../lib/business/types';
import { VISITANTE_SETOR } from '../../lib/business/types';
import { VISITOR_CATEGORY_OPTIONS } from '../../lib/business/visitorCategories';
import { fmtMoney } from '../../lib/format';
import { useBulkUpsertCollaborators, useCreateCollaborator, useDeleteCollaborators, useUpdateCollaborator } from '../../lib/mutations';
import { PASSWORD_HINT, PASSWORD_MIN_LENGTH, validatePassword } from '../../lib/passwordPolicy';
import { useCategoryTypes, useCollaborators, useCollaboratorsWithLogin, useSales } from '../../lib/queries';
import { uploadPhoto } from '../../lib/storage';

const SETORES = ['Balcão', 'Caixa', 'Dermoconsultora', 'Farmacêutico', 'Gerência', VISITANTE_SETOR];

function VisitorCategoryChecklist({
  hasBio,
  selected,
  onToggle,
}: {
  hasBio: boolean;
  selected: string[];
  onToggle: (key: string) => void;
}) {
  const options = VISITOR_CATEGORY_OPTIONS.filter((o) => o.key !== 'biosintetica' || hasBio);
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">Categorias visíveis para o visitante</label>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {options.map((o) => (
          <label key={o.key} className="flex items-center gap-1.5 text-xs text-slate-300">
            <input type="checkbox" checked={selected.includes(o.key)} onChange={() => onToggle(o.key)} />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export function ColaboradoresPage() {
  const { profile } = useAuth();
  const location = useLocation();
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: withLogin } = useCollaboratorsWithLogin();
  const { data: categoryTypes } = useCategoryTypes();
  const hasBio = (categoryTypes ?? []).some((c) => c.chave === 'biosintetica');
  const createCollaborator = useCreateCollaborator(profile?.store_id);
  const bulkUpsertCollaborators = useBulkUpsertCollaborators(profile?.store_id);
  const updateCollaborator = useUpdateCollaborator();
  const deleteCollaborators = useDeleteCollaborators();
  const { guard, reauthModal } = useReauthGuard();

  const [matricula, setMatricula] = useState('');
  const [nome, setNome] = useState('');
  const [apelido, setApelido] = useState('');
  const [celular, setCelular] = useState('');
  const [setor, setSetor] = useState(SETORES[0]);
  const [categoriasVisitante, setCategoriasVisitante] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Collaborator | null>(null);
  const [grantingFor, setGrantingFor] = useState<Collaborator | null>(null);
  const [resettingFor, setResettingFor] = useState<Collaborator | null>(null);

  // Arriving here from the ADM shell's password-request badge ("gerar nova
  // senha" for a colaborador who solicited one) — jump straight to the
  // reset modal instead of making the ADM find them in the grid again.
  const openResetFor = (location.state as { openResetFor?: string } | null)?.openResetFor;
  useEffect(() => {
    if (!openResetFor || !collaborators) return;
    const target = collaborators.find((c) => c.id === openResetFor);
    if (target) setResettingFor(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openResetFor, collaborators]);

  // A per-collaborator full re-scan of `sales` (routinely tens of
  // thousands of rows) on every render — as this used to do by calling
  // lastSaleDateFor(sales, c.matricula) inside the .map() below — meant
  // typing a single character in the "Novo colaborador" form (or any other
  // state change on this screen) re-ran collaborators.length × sales.length
  // comparisons synchronously before the next paint. Indexing once per
  // `sales` change instead turns that into a single O(sales) pass, reused
  // for every collaborator's card.
  const lastSaleByMatricula = useMemo(() => {
    const map = new Map<string, string>();
    (sales ?? []).forEach((s) => {
      if (!s.dataISO) return;
      const key = normalizeMatricula(s.matricula);
      const current = map.get(key);
      if (!current || s.dataISO > current) map.set(key, s.dataISO);
    });
    return map;
  }, [sales]);

  if (!collaborators || !sales || !withLogin) return <PageLoading />;

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!matricula.trim() || !nome.trim()) return;
    createCollaborator.mutate({
      matricula: matricula.trim(),
      nome: nome.trim(),
      apelido: apelido.trim(),
      setor,
      celular: celular.trim() || null,
      ...(setor === VISITANTE_SETOR && { categoriasVisitante }),
    });
    setMatricula('');
    setNome('');
    setApelido('');
    setCelular('');
    setCategoriasVisitante([]);
  }

  function toggleNovoCategoriaVisitante(key: string) {
    setCategoriasVisitante((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
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
    const count = selected.size;
    guard(
      `Excluir ${count} colaborador(es) selecionado(s)? Essa ação não pode ser desfeita. Confirme sua senha para continuar.`,
      () => {
        deleteCollaborators.mutate(Array.from(selected));
        setSelected(new Set());
        setSelectMode(false);
      },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {reauthModal}
      <form onSubmit={handleAdd} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-3">Novo colaborador</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
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
            <label className="block text-xs text-slate-400 mb-1">Celular</label>
            <input value={celular} onChange={(e) => setCelular(e.target.value)} className="input" placeholder="(opcional)" />
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
        {setor === VISITANTE_SETOR && (
          <div className="mt-3">
            <VisitorCategoryChecklist hasBio={hasBio} selected={categoriasVisitante} onToggle={toggleNovoCategoriaVisitante} />
          </div>
        )}
      </form>

      <SimpleSheetImportPanel
        title="Importar planilha de colaboradores"
        columns={['Código de venda', 'Nome', 'Apelido', 'Setor', 'Celular']}
        idColumnIndex={0}
        onConfirm={async (rows) => {
          const valid = rows.filter((r) => r[0]?.trim() && r[1]?.trim());
          if (valid.length === 0) return { count: 0, skipped: rows.length };
          await bulkUpsertCollaborators.mutateAsync(
            valid.map((r) => ({
              matricula: r[0].trim(),
              nome: r[1].trim(),
              apelido: r[2]?.trim() || '',
              setor: r[3]?.trim() || SETORES[0],
              celular: r[4]?.trim() || null,
            })),
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
              const last = lastSaleByMatricula.get(normalizeMatricula(c.matricula)) ?? null;
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
                      guard(
                        `Excluir "${c.apelido || c.nome}"? Essa ação não pode ser desfeita. Confirme sua senha para continuar.`,
                        () => deleteCollaborators.mutate([c.id]),
                      );
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
                  {!hasLogin ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setGrantingFor(c);
                      }}
                      className="text-[11px] rounded-lg border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800 w-full"
                    >
                      🔑 Criar acesso
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setResettingFor(c);
                      }}
                      className="text-[11px] rounded-lg border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800 w-full"
                    >
                      🔑 Gerar nova senha
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
          hasBio={hasBio}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            updateCollaborator.mutate({ id: editing.id, patch });
            setEditing(null);
          }}
        />
      )}

      {grantingFor && <GrantLoginModal collaborator={grantingFor} onClose={() => setGrantingFor(null)} />}
      {resettingFor && <ResetLoginModal collaborator={resettingFor} onClose={() => setResettingFor(null)} />}
    </div>
  );
}

function EditCollaboratorModal({
  collaborator,
  storeId,
  hasBio,
  onClose,
  onSave,
}: {
  collaborator: Collaborator;
  storeId: string | undefined;
  hasBio: boolean;
  onClose: () => void;
  onSave: (patch: {
    nome: string;
    apelido: string;
    celular: string | null;
    setor: string;
    data_nascimento: string | null;
    categorias_visitante: string[];
    foto_url?: string;
    foto_conquista_url?: string;
  }) => void;
}) {
  const [nome, setNome] = useState(collaborator.nome);
  const [apelido, setApelido] = useState(collaborator.apelido || '');
  const [celular, setCelular] = useState(collaborator.celular || '');
  const [setor, setSetor] = useState(collaborator.setor || SETORES[0]);
  const [dataNascimento, setDataNascimento] = useState(collaborator.dataNascimento || '');
  const [categoriasVisitante, setCategoriasVisitante] = useState<string[]>(collaborator.categoriasVisitante ?? []);
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
      const file = new File([blob], 'foto.webp', { type: 'image/webp' });
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
            <label className="block text-xs text-slate-400 mb-1">Celular</label>
            <input value={celular} onChange={(e) => setCelular(e.target.value)} className="input" placeholder="(opcional)" />
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
          {setor === VISITANTE_SETOR && (
            <VisitorCategoryChecklist
              hasBio={hasBio}
              selected={categoriasVisitante}
              onToggle={(key) =>
                setCategoriasVisitante((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
              }
            />
          )}
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
                celular: celular.trim() || null,
                setor,
                data_nascimento: dataNascimento || null,
                categorias_visitante: setor === VISITANTE_SETOR ? categoriasVisitante : [],
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
    const policyError = validatePassword(senha);
    if (policyError) {
      setError(policyError);
      return;
    }
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
          minLength={PASSWORD_MIN_LENGTH}
          placeholder={PASSWORD_HINT}
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

function ResetLoginModal({ collaborator, onClose }: { collaborator: Collaborator; onClose: () => void }) {
  const [senha, setSenha] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const policyError = validatePassword(senha);
    if (policyError) {
      setError(policyError);
      return;
    }
    setBusy(true);
    try {
      await resetCollaboratorLogin(collaborator.id, senha);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar nova senha');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-1">Gerar nova senha — {collaborator.apelido || collaborator.nome}</h3>
        <p className="text-xs text-slate-500 mb-4">
          Isso substitui a senha atual do colaborador (matrícula <b>#{collaborator.matricula}</b>) pela informada abaixo.
        </p>
        <input
          type="password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          placeholder={PASSWORD_HINT}
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
            {busy ? 'Salvando…' : 'Gerar nova senha'}
          </button>
        </div>
      </form>
    </div>
  );
}
