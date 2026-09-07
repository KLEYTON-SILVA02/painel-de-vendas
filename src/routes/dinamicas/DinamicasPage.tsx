import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { PageLoading } from '../../components/PageLoading';
import { useAuth } from '../../auth/AuthContext';
import { CategoriasProdutosEditor } from '../../components/dinamicas/CategoriasProdutosEditor';
import { ParticipantesPicker } from '../../components/dinamicas/ParticipantesPicker';
import { DinamicaProgressList } from '../../components/ranking/DinamicaProgressList';
import {
  computeDinamicaCategoriaTotais,
  computeDinamicaProgresso,
  computeDinamicaRanking,
  dinamicaMetaTotal,
  dinamicaUnidadeLabel,
  dynamicStatus,
} from '../../lib/business/dynamics';
import { useReauthGuard } from '../../hooks/useReauthGuard';
import type { Collaborator, Dynamic, DynamicProductCategory, Sale } from '../../lib/business/types';
import { VISITANTE_SETOR } from '../../lib/business/types';
import { fmtDateBR, fmtMoney } from '../../lib/format';
import { todayISO } from '../../lib/dateRange';
import { useCreateDynamic, useDeleteDynamic, useUpdateDynamic } from '../../lib/mutations';
import { useCollaborators, useDynamics, useSales } from '../../lib/queries';
import type { Json, TablesUpdate } from '../../types/database';

export function DinamicasPage() {
  const { profile } = useAuth();
  const { data: dynamics } = useDynamics();
  const { data: sales } = useSales();
  const { data: collaborators } = useCollaborators();
  const [tab, setTab] = useState<'ativas' | 'galeria'>('ativas');
  const [editing, setEditing] = useState<Dynamic | null>(null);
  const createDynamic = useCreateDynamic(profile?.store_id);
  const updateDynamic = useUpdateDynamic();
  const deleteDynamic = useDeleteDynamic();
  const { guard, reauthModal } = useReauthGuard();

  // Real product names as they appear in the sales history — the same
  // strings computeDinamicaProgresso/computeDinamicaRanking match against
  // (via normalize()) — so a suggestion picked here is guaranteed to
  // actually match sales, unlike names pulled from the separate
  // keyword-classification `products` table.
  const productNames = useMemo(() => {
    const set = new Set<string>();
    (sales ?? []).forEach((s) => {
      if (s.produto) set.add(s.produto);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [sales]);

  if (!dynamics || !sales || !collaborators) {
    return <PageLoading />;
  }

  // Visitante collaborators are view-only — they never sell, so they never
  // belong in a picker used to assign them as dynamic participants (they'd
  // just sit at 0 forever). Only affects the participant checklist; the
  // ranking display below still gets the full `collaborators` list, same as
  // any other read-only view.
  const participantCollaborators = collaborators.filter((c) => c.setor !== VISITANTE_SETOR);

  const today = todayISO();
  const list = dynamics.slice().sort((a, b) => (b.dataInicio || '').localeCompare(a.dataInicio || ''));
  const ativas = list.filter((d) => dynamicStatus(d, today) === 'ativa');
  const agendadas = list.filter((d) => dynamicStatus(d, today) === 'agendada');
  const encerradas = list.filter((d) => dynamicStatus(d, today) === 'encerrada');
  const listaAtual = ativas.concat(agendadas);

  let diasProximaEncerrar: number | null = null;
  ativas.forEach((d) => {
    const dias = Math.ceil((new Date(d.dataFim).getTime() - new Date(today).getTime()) / 86400000);
    if (diasProximaEncerrar === null || dias < diasProximaEncerrar) diasProximaEncerrar = dias;
  });

  function handleDeleteDynamic(id: string) {
    guard('Excluir esta dinâmica? Essa ação não pode ser desfeita. Confirme sua senha para continuar.', () => deleteDynamic.mutate(id));
  }

  return (
    <div className="flex flex-col gap-3">
      {reauthModal}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Dinâmicas cadastradas" value={String(list.length)} color="#a82bff" />
        <StatCard label="Ativas agora" value={String(ativas.length)} color="#14ff00" />
        <StatCard
          label="Dias p/ próxima encerrar"
          value={diasProximaEncerrar !== null ? `${diasProximaEncerrar} dia(s)` : '—'}
          color="#ffd700"
        />
      </div>

      <div className="flex gap-1">
        <button
          onClick={() => setTab('ativas')}
          className={`rounded-lg px-3 py-1.5 text-sm ${tab === 'ativas' ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
        >
          Ativas / Agendadas
        </button>
        <button
          onClick={() => setTab('galeria')}
          className={`rounded-lg px-3 py-1.5 text-sm ${tab === 'galeria' ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
        >
          🖼️ Galeria de Dinâmicas
        </button>
      </div>

      {tab === 'galeria' ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-semibold mb-1">🖼️ Galeria de Dinâmicas ({encerradas.length})</h3>
          <p className="text-xs text-slate-500 mb-3">Dinâmicas já encerradas, com o resultado final de cada colaborador.</p>
          {encerradas.length === 0 ? (
            <div className="text-sm text-slate-500 py-4 text-center">Nenhuma dinâmica encerrada ainda.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {encerradas.map((d) => (
                <DinamicaCard
                  key={d.id}
                  d={d}
                  status="encerrada"
                  sales={sales}
                  collaborators={collaborators}
                  onDelete={() => handleDeleteDynamic(d.id)}
                  onEdit={() => setEditing(d)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <NewDynamicForm
            collaborators={participantCollaborators}
            productNames={productNames}
            onCreate={(input) => createDynamic.mutate(input)}
            creating={createDynamic.isPending}
          />
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="font-semibold mb-3">Ativas e agendadas ({listaAtual.length})</h3>
            {listaAtual.length === 0 ? (
              <div className="text-sm text-slate-500 py-4 text-center">Nenhuma dinâmica ativa ou agendada.</div>
            ) : (
              <div className="flex flex-col gap-3">
                {listaAtual.map((d) => (
                  <DinamicaCard
                    key={d.id}
                    d={d}
                    status={dynamicStatus(d, today)}
                    sales={sales}
                    collaborators={collaborators}
                    onDelete={() => handleDeleteDynamic(d.id)}
                    onEdit={() => setEditing(d)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {editing && (
        <EditDynamicModal
          dynamic={editing}
          collaborators={participantCollaborators}
          productNames={productNames}
          saving={updateDynamic.isPending}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            updateDynamic.mutate(
              { id: editing.id, patch },
              { onSuccess: () => setEditing(null) },
            );
          }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="text-[11px] text-slate-400 mb-1">{label}</div>
      <div className="text-sm font-mono font-semibold" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

const STATUS_PILL: Record<string, string> = {
  ativa: 'bg-green-500/20 text-green-400',
  encerrada: 'bg-slate-700 text-slate-300',
  agendada: 'bg-orange-500/20 text-orange-400',
};
const STATUS_LABEL: Record<string, string> = { ativa: 'Ativa', encerrada: 'Encerrada', agendada: 'Agendada' };

function DinamicaCard({
  d,
  status,
  sales,
  collaborators,
  onDelete,
  onEdit,
}: {
  d: Dynamic;
  status: 'ativa' | 'agendada' | 'encerrada';
  sales: Sale[];
  collaborators: Collaborator[];
  onDelete: () => void;
  onEdit: () => void;
}) {
  const isUnidade = d.metrica === 'unidade';
  const realizado = computeDinamicaProgresso(d, sales, collaborators);
  const metaTotal = dinamicaMetaTotal(d, collaborators);
  const pct = metaTotal > 0 ? Math.min(100, (realizado / metaTotal) * 100) : null;
  // Every eligible participant, not just the ones already ahead — this is
  // the campaign's roster, so someone at 0% still belongs on it.
  const ranking = computeDinamicaRanking(d, sales, collaborators);
  const categoriaTotais = computeDinamicaCategoriaTotais(d, sales, collaborators);
  const unidadeLabel = dinamicaUnidadeLabel(d);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <b className="text-sm">{d.titulo}</b>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_PILL[status]}`}>{STATUS_LABEL[status]}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onEdit} className="text-slate-500 hover:text-cyan-400 text-sm">
            ✎
          </button>
          <button onClick={onDelete} className="text-slate-500 hover:text-rose-400 text-sm">
            ✕
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
        <StatCard label="Realizado" value={isUnidade ? `${realizado} ${unidadeLabel}` : fmtMoney(realizado)} color="#14ff00" />
        <StatCard label="% da meta" value={pct !== null ? `${pct.toFixed(0)}%` : '—'} color="#ffb700" />
        <StatCard label="Período" value={`${fmtDateBR(d.dataInicio)} → ${fmtDateBR(d.dataFim)}`} color="#00f0ff" />
        <StatCard label="Meta total" value={metaTotal > 0 ? (isUnidade ? `${metaTotal} ${unidadeLabel}` : fmtMoney(metaTotal)) : '—'} color="#a82bff" />
        <StatCard label="Participantes" value={String(ranking.length)} color="#ff3df0" />
      </div>
      {categoriaTotais.length > 0 && (
        <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(160px, 1fr))` }}>
          {categoriaTotais.map((cat) => (
            <StatCard
              key={cat.id}
              label={cat.nome}
              value={
                cat.pontuacao !== null
                  ? fmtMoney(cat.pontuacao)
                  : isUnidade
                    ? `${cat.itens} ${unidadeLabel}`
                    : fmtMoney(cat.valor)
              }
              sub={cat.pontuacao !== null ? `${cat.itens} ${unidadeLabel} vendido${cat.itens === 1 ? '' : 's'}` : undefined}
              color="#00b6da"
            />
          ))}
        </div>
      )}
      <div className="mt-3">
        <DinamicaProgressList ranking={ranking} isUnidade={isUnidade} din={d} sales={sales} showSaleDates />
      </div>
    </div>
  );
}

function NewDynamicForm({
  collaborators,
  productNames,
  onCreate,
  creating,
}: {
  collaborators: { id: string; matricula: string; nome: string; apelido: string | null; foto?: string | null }[];
  productNames: string[];
  onCreate: (input: {
    titulo: string;
    descricao: string;
    data_inicio: string;
    data_fim: string;
    meta_valor: number;
    metrica: 'valor' | 'unidade';
    produtos: string[];
    participantes: string[];
    setor_alvo: Dynamic['setorAlvo'];
    meta_modo: Dynamic['metaModo'];
    metas_individuais: Record<string, number>;
    categorias_produtos: Json;
    multiplicador_ativo: boolean;
    multiplicador_valor: number;
    medida_label: string;
  }) => void;
  creating: boolean;
}) {
  const today = todayISO();
  const [titulo, setTitulo] = useState('');
  const [dataInicio, setDataInicio] = useState(today);
  const [dataFim, setDataFim] = useState(today);
  const [setorAlvo, setSetorAlvo] = useState<Dynamic['setorAlvo']>('ambos');
  const [metrica, setMetrica] = useState<'valor' | 'unidade'>('valor');
  const [medidaLabel, setMedidaLabel] = useState('');
  const [metaModo, setMetaModo] = useState<Dynamic['metaModo']>('geral');
  const [metaValor, setMetaValor] = useState(0);
  const [metasIndividuais, setMetasIndividuais] = useState<Record<string, number>>({});
  const [descricao, setDescricao] = useState('');
  const [produtoInput, setProdutoInput] = useState('');
  const [produtos, setProdutos] = useState<string[]>([]);
  const [participantes, setParticipantes] = useState<string[]>([]);
  const [categoriasProdutos, setCategoriasProdutos] = useState<DynamicProductCategory[]>([]);
  const [multiplicador, setMultiplicador] = useState({ ativo: false, valor: 0 });
  const [expanded, setExpanded] = useState(false);
  const produtosListId = useId();

  function addProduto() {
    const nome = produtoInput.trim();
    if (!nome) return;
    setProdutos((prev) => [...prev, nome]);
    setProdutoInput('');
  }

  function toggleParticipante(matricula: string) {
    setParticipantes((prev) => (prev.includes(matricula) ? prev.filter((m) => m !== matricula) : [...prev, matricula]));
  }

  function setMetaIndividual(matricula: string, value: number) {
    setMetasIndividuais((prev) => ({ ...prev, [matricula]: value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || !dataInicio || !dataFim) return;
    onCreate({
      titulo: titulo.trim(),
      descricao,
      data_inicio: dataInicio,
      data_fim: dataFim,
      meta_valor: metaValor,
      metrica,
      produtos,
      participantes,
      setor_alvo: setorAlvo,
      meta_modo: metaModo,
      metas_individuais: metasIndividuais,
      categorias_produtos: categoriasProdutos as unknown as Json,
      multiplicador_ativo: multiplicador.ativo,
      multiplicador_valor: multiplicador.valor,
      medida_label: medidaLabel.trim(),
    });
    setTitulo('');
    setDescricao('');
    setSetorAlvo('ambos');
    setMetaModo('geral');
    setMetaValor(0);
    setMetasIndividuais({});
    setProdutos([]);
    setParticipantes([]);
    setCategoriasProdutos([]);
    setMultiplicador({ ativo: false, valor: 0 });
    setMedidaLabel('');
    setExpanded(false);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="font-semibold text-left flex items-center justify-between"
      >
        <span>+ Nova dinâmica</span>
        <span className="text-xs text-slate-400">{expanded ? '▲ recolher' : '▼ expandir'}</span>
      </button>
      {expanded && (
        <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Nome da dinâmica">
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="input" />
        </Field>
        <Field label="Início">
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="input" />
        </Field>
        <Field label="Fim">
          <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="input" />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Métrica da meta">
          <select value={metrica} onChange={(e) => setMetrica(e.target.value as 'valor' | 'unidade')} className="input">
            <option value="valor">Moeda (R$)</option>
            <option value="unidade">Unidade</option>
          </select>
        </Field>
        {metrica === 'unidade' && (
          <Field label="Tipo de medida (opcional)">
            <input
              value={medidaLabel}
              onChange={(e) => setMedidaLabel(e.target.value)}
              placeholder="un. (padrão) — ex: caixas, pares, litros"
              className="input"
            />
          </Field>
        )}
        <Field label="Modo da meta">
          <select value={metaModo} onChange={(e) => setMetaModo(e.target.value as Dynamic['metaModo'])} className="input">
            <option value="geral">Meta geral (compartilhada)</option>
            <option value="individual">Meta individual por colaborador</option>
          </select>
        </Field>
        {metaModo === 'geral' && (
          <Field label="Meta (opcional)">
            <input type="number" value={metaValor} onChange={(e) => setMetaValor(Number(e.target.value))} className="input" />
          </Field>
        )}
      </div>
      <Field label="Setor participante">
        <select value={setorAlvo} onChange={(e) => setSetorAlvo(e.target.value as Dynamic['setorAlvo'])} className="input">
          <option value="ambos">Balcão + Caixa</option>
          <option value="balcao">Balcão</option>
          <option value="caixa">Caixa</option>
        </select>
      </Field>
      <Field label="Descrição">
        <input
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Premiação, regras, grupo de WhatsApp..."
          className="input"
        />
      </Field>

      <CategoriasProdutosEditor
        categorias={categoriasProdutos}
        onChange={setCategoriasProdutos}
        productNames={productNames}
        multiplicador={multiplicador}
        onMultiplicadorChange={setMultiplicador}
      />

      {categoriasProdutos.length === 0 && (
        <div>
          <label className="block text-xs text-slate-400 mb-1">Produtos participantes (opcional — vazio = todos os produtos)</label>
          <div className="flex gap-2">
            <input
              list={produtosListId}
              value={produtoInput}
              onChange={(e) => setProdutoInput(e.target.value)}
              placeholder="buscar produto já vendido, ou digitar nome exato / palavra-chave"
              className="input flex-1"
            />
            <datalist id={produtosListId}>
              {productNames.map((nome) => (
                <option key={nome} value={nome} />
              ))}
            </datalist>
            <button type="button" onClick={addProduto} className="rounded-md bg-amber-500 text-slate-950 px-3 py-1.5 text-xs font-medium">
              + Add
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {produtos.length === 0 ? (
              <span className="text-xs text-slate-500">Nenhum produto adicionado — vale para todos.</span>
            ) : (
              produtos.map((p, i) => (
                <span key={i} className="text-xs bg-slate-800 rounded-full px-2 py-1 flex items-center gap-1.5">
                  {p}
                  <button type="button" onClick={() => setProdutos((prev) => prev.filter((_, idx) => idx !== i))} className="text-slate-500 hover:text-rose-400">
                    ✕
                  </button>
                </span>
              ))
            )}
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs text-slate-400 mb-1">
          Colaboradores participantes (opcional — nenhum marcado = todos)
          {metaModo === 'individual' && ' — marque e defina a meta de cada um'}
        </label>
        <ParticipantesPicker
          collaborators={collaborators}
          participantes={participantes}
          onToggle={toggleParticipante}
          metaModo={metaModo}
          metasIndividuais={metasIndividuais}
          onMetaChange={setMetaIndividual}
        />
      </div>

      <button
        type="submit"
        disabled={creating}
        className="self-start rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm disabled:opacity-50"
      >
        {creating ? 'Criando…' : '+ Criar dinâmica'}
      </button>
        </>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

export function EditDynamicModal({
  dynamic,
  collaborators,
  productNames,
  saving,
  onClose,
  onSave,
}: {
  dynamic: Dynamic;
  collaborators: { id: string; matricula: string; nome: string; apelido: string | null; foto?: string | null }[];
  productNames: string[];
  saving: boolean;
  onClose: () => void;
  onSave: (patch: TablesUpdate<'dynamics'>) => void;
}) {
  const [titulo, setTitulo] = useState(dynamic.titulo);
  const [descricao, setDescricao] = useState(dynamic.descricao);
  const [dataInicio, setDataInicio] = useState(dynamic.dataInicio);
  const [dataFim, setDataFim] = useState(dynamic.dataFim);
  const [setorAlvo, setSetorAlvo] = useState<Dynamic['setorAlvo']>(dynamic.setorAlvo);
  const [metrica, setMetrica] = useState<'valor' | 'unidade'>(dynamic.metrica);
  const [medidaLabel, setMedidaLabel] = useState(dynamic.medidaLabel);
  const [metaModo, setMetaModo] = useState<Dynamic['metaModo']>(dynamic.metaModo);
  const [metaValor, setMetaValor] = useState(dynamic.metaValor);
  const [metasIndividuais, setMetasIndividuais] = useState<Record<string, number>>(dynamic.metasIndividuais);
  const [produtoInput, setProdutoInput] = useState('');
  const [produtos, setProdutos] = useState<string[]>(dynamic.produtos);
  const [participantes, setParticipantes] = useState<string[]>(dynamic.participantes);
  const [categoriasProdutos, setCategoriasProdutos] = useState<DynamicProductCategory[]>(dynamic.categoriasProdutos);
  const [multiplicador, setMultiplicador] = useState(dynamic.multiplicador);
  const produtosListId = useId();

  function addProduto() {
    const nome = produtoInput.trim();
    if (!nome) return;
    setProdutos((prev) => [...prev, nome]);
    setProdutoInput('');
  }

  function toggleParticipante(matricula: string) {
    setParticipantes((prev) => (prev.includes(matricula) ? prev.filter((m) => m !== matricula) : [...prev, matricula]));
  }

  function setMetaIndividual(matricula: string, value: number) {
    setMetasIndividuais((prev) => ({ ...prev, [matricula]: value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || !dataInicio || !dataFim) return;
    onSave({
      titulo: titulo.trim(),
      descricao,
      data_inicio: dataInicio,
      data_fim: dataFim,
      meta_valor: metaValor,
      metrica,
      produtos,
      participantes,
      setor_alvo: setorAlvo,
      meta_modo: metaModo,
      metas_individuais: metasIndividuais,
      categorias_produtos: categoriasProdutos as unknown as Json,
      multiplicador_ativo: multiplicador.ativo,
      multiplicador_valor: multiplicador.valor,
      medida_label: medidaLabel.trim(),
    });
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900 p-5 max-h-[90vh] overflow-y-auto flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold">Editar dinâmica</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Nome da dinâmica">
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="input" />
          </Field>
          <Field label="Início">
            <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="input" />
          </Field>
          <Field label="Fim">
            <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="input" />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Métrica da meta">
            <select value={metrica} onChange={(e) => setMetrica(e.target.value as 'valor' | 'unidade')} className="input">
              <option value="valor">Moeda (R$)</option>
              <option value="unidade">Unidade</option>
            </select>
          </Field>
          {metrica === 'unidade' && (
            <Field label="Tipo de medida (opcional)">
              <input
                value={medidaLabel}
                onChange={(e) => setMedidaLabel(e.target.value)}
                placeholder="un. (padrão) — ex: caixas, pares, litros"
                className="input"
              />
            </Field>
          )}
          <Field label="Modo da meta">
            <select value={metaModo} onChange={(e) => setMetaModo(e.target.value as Dynamic['metaModo'])} className="input">
              <option value="geral">Meta geral (compartilhada)</option>
              <option value="individual">Meta individual por colaborador</option>
            </select>
          </Field>
          {metaModo === 'geral' && (
            <Field label="Meta (opcional)">
              <input type="number" value={metaValor} onChange={(e) => setMetaValor(Number(e.target.value))} className="input" />
            </Field>
          )}
        </div>
        <Field label="Setor participante">
          <select value={setorAlvo} onChange={(e) => setSetorAlvo(e.target.value as Dynamic['setorAlvo'])} className="input">
            <option value="ambos">Balcão + Caixa</option>
            <option value="balcao">Balcão</option>
            <option value="caixa">Caixa</option>
          </select>
        </Field>
        <Field label="Descrição">
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Premiação, regras, grupo de WhatsApp..."
            className="input"
          />
        </Field>

        <CategoriasProdutosEditor
          categorias={categoriasProdutos}
          onChange={setCategoriasProdutos}
          productNames={productNames}
          multiplicador={multiplicador}
          onMultiplicadorChange={setMultiplicador}
        />

        {categoriasProdutos.length === 0 && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">Produtos participantes (opcional — vazio = todos os produtos)</label>
            <div className="flex gap-2">
              <input
                list={produtosListId}
                value={produtoInput}
                onChange={(e) => setProdutoInput(e.target.value)}
                placeholder="buscar produto já vendido, ou digitar nome exato / palavra-chave"
                className="input flex-1"
              />
              <datalist id={produtosListId}>
                {productNames.map((nome) => (
                  <option key={nome} value={nome} />
                ))}
              </datalist>
              <button type="button" onClick={addProduto} className="rounded-md bg-amber-500 text-slate-950 px-3 py-1.5 text-xs font-medium">
                + Add
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {produtos.length === 0 ? (
                <span className="text-xs text-slate-500">Nenhum produto adicionado — vale para todos.</span>
              ) : (
                produtos.map((p, i) => (
                  <span key={i} className="text-xs bg-slate-800 rounded-full px-2 py-1 flex items-center gap-1.5">
                    {p}
                    <button type="button" onClick={() => setProdutos((prev) => prev.filter((_, idx) => idx !== i))} className="text-slate-500 hover:text-rose-400">
                      ✕
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Colaboradores participantes (opcional — nenhum marcado = todos)
            {metaModo === 'individual' && ' — marque e defina a meta de cada um'}
          </label>
          <ParticipantesPicker
            collaborators={collaborators}
            participantes={participantes}
            onToggle={toggleParticipante}
            metaModo={metaModo}
            metasIndividuais={metasIndividuais}
            onMetaChange={setMetaIndividual}
          />
        </div>

        <div className="flex gap-2 mt-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-cyan-500 text-slate-950 font-medium px-3 py-2 text-sm disabled:opacity-50">
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}
