import { useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { grantCollaboratorLogin } from '../../lib/collaborators';
import { daysSince, lastSaleDateFor } from '../../lib/business/summary';
import type { Collaborator } from '../../lib/business/types';
import { fmtMoney } from '../../lib/format';
import { useCreateCollaborator, useDeleteCollaborators, useUpdateCollaborator } from '../../lib/mutations';
import { useCollaborators, useCollaboratorsWithLogin, useSales } from '../../lib/queries';
import { uploadPhoto } from '../../lib/storage';

const SETORES = ['Balcão', 'Caixa', 'Dermoconsultora', 'Farmacêutico', 'Gerência'];

export function ColaboradoresPage() {
  const { profile } = useAuth();
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: withLogin } = useCollaboratorsWithLogin();
  const createCollaborator = useCreateCollaborator(profile?.store_id);
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

  if (!collaborators || !sales || !withLogin) return <div className="text-sm text-slate-500 p-6">Carregando…</div>;

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!matricula.trim() || !nome.trim()) return;
    createCollaborator.mutate({ matricula: matricula.trim(), nome: nome.trim(), apelido: apelido.trim(), setor });
    setMatricula('');
    setNome('');
    setApelido('');
  }

  async function handlePhotoChange(c: Collaborator, file: File) {
    if (!profile?.store_id) return;
    const url = await uploadPhoto(profile.store_id, `collaborators/${c.id}`, file);
    updateCollaborator.mutate({ id: c.id, patch: { foto_url: url } });
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
    <div className="flex flex-col gap-4">
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
          Colaboradores sem vendas há 60 dias ou mais aparecem como <b>Inativo</b>. Toque no ícone de câmera pra
          trocar a foto, ou no lápis pra editar os dados.
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
          <div className="flex flex-col gap-2">
            {collaborators.map((c) => {
              const last = lastSaleDateFor(sales, c.matricula);
              const days = daysSince(last);
              const inativo = days !== null && days >= 60;
              const semVenda = last === null;
              const hasLogin = withLogin.has(c.id);
              return (
                <div key={c.id} className="flex items-center gap-3 rounded-lg bg-slate-950/60 border border-slate-800 p-3">
                  {selectMode && (
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelected(c.id)} />
                  )}
                  <label className="relative cursor-pointer shrink-0">
                    {c.foto ? (
                      <img src={c.foto} alt="" className="w-11 h-11 rounded-full object-cover" />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-slate-700" />
                    )}
                    <span className="absolute -bottom-0.5 -right-0.5 bg-slate-800 rounded-full w-4 h-4 flex items-center justify-center text-[9px]">
                      📷
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handlePhotoChange(c, e.target.files[0])}
                    />
                  </label>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {c.apelido || c.nome} <span className="text-xs text-slate-500 font-mono">#{c.matricula}</span>
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {c.nome} · {c.setor || '-'}
                      {c.metaIndividual ? ` · meta ${fmtMoney(c.metaIndividual)}` : ''}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${inativo ? 'bg-pink-500/20 text-pink-400' : 'bg-green-500/20 text-green-400'}`}
                  >
                    {inativo ? `Inativo${semVenda ? '' : ` · ${days}d`}` : 'Ativo'}
                  </span>
                  {!hasLogin && (
                    <button
                      onClick={() => setGrantingFor(c)}
                      className="text-xs rounded-lg border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800 shrink-0"
                    >
                      🔑 Criar acesso
                    </button>
                  )}
                  <button onClick={() => setEditing(c)} className="text-slate-400 hover:text-slate-200 shrink-0">
                    ✎
                  </button>
                  <button
                    onClick={() => deleteCollaborators.mutate([c.id])}
                    className="text-slate-500 hover:text-rose-400 shrink-0"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <EditCollaboratorModal
          collaborator={editing}
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
  onClose,
  onSave,
}: {
  collaborator: Collaborator;
  onClose: () => void;
  onSave: (patch: { nome: string; apelido: string; setor: string; meta_individual: number }) => void;
}) {
  const [nome, setNome] = useState(collaborator.nome);
  const [apelido, setApelido] = useState(collaborator.apelido || '');
  const [setor, setSetor] = useState(collaborator.setor || SETORES[0]);
  const [meta, setMeta] = useState(collaborator.metaIndividual);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-4">Editar colaborador</h3>
        <div className="flex flex-col gap-3">
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
            <label className="block text-xs text-slate-400 mb-1">Meta individual (R$/mês)</label>
            <input type="number" value={meta} onChange={(e) => setMeta(Number(e.target.value))} className="input" />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300">
            Cancelar
          </button>
          <button
            onClick={() => onSave({ nome, apelido, setor, meta_individual: meta })}
            className="flex-1 rounded-lg bg-cyan-500 text-slate-950 font-medium px-3 py-2 text-sm"
          >
            Salvar
          </button>
        </div>
      </div>
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
