import { useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { PodiumStaircase } from '../../components/ranking/PodiumStaircase';
import {
  computeDinamicaProgresso,
  computeDinamicaRanking,
  dynamicStatus,
} from '../../lib/business/dynamics';
import type { Collaborator, Dynamic, Sale } from '../../lib/business/types';
import { fmtDateBR, fmtMoney } from '../../lib/format';
import { useCreateDynamic, useDeleteDynamic } from '../../lib/mutations';
import { useCollaborators, useDynamics, useSales, useStoreSettings } from '../../lib/queries';

const todayISO = () => new Date().toISOString().slice(0, 10);
const SETOR_ALVO_LABEL: Record<Dynamic['setorAlvo'], string> = { balcao: 'Balcão', caixa: 'Caixa', ambos: 'Balcão + Caixa' };

export function DinamicasPage() {
  const { profile } = useAuth();
  const { data: dynamics } = useDynamics();
  const { data: sales } = useSales();
  const { data: collaborators } = useCollaborators();
  const { data: storeSettings } = useStoreSettings();
  const [tab, setTab] = useState<'ativas' | 'galeria'>('ativas');
  const createDynamic = useCreateDynamic(profile?.store_id);
  const deleteDynamic = useDeleteDynamic();

  if (!dynamics || !sales || !collaborators || !storeSettings) {
    return <div className="text-sm text-slate-500 p-6">Carregando…</div>;
  }

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

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-purple-400 font-semibold">🎯 Dinâmicas Comerciais</h3>
        <p className="text-xs text-slate-500 mt-1">
          Campanhas e metas temporárias da loja, com período, produtos e participantes próprios.
        </p>
      </div>

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
                  modeloRanking={storeSettings.modelo_ranking as 'escadinha' | 'lista'}
                  onDelete={() => deleteDynamic.mutate(d.id)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <NewDynamicForm
            collaborators={collaborators}
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
                    modeloRanking={storeSettings.modelo_ranking as 'escadinha' | 'lista'}
                    onDelete={() => deleteDynamic.mutate(d.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="text-[11px] text-slate-400 mb-1">{label}</div>
      <div className="text-sm font-mono font-semibold" style={{ color }}>
        {value}
      </div>
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
  modeloRanking,
  onDelete,
}: {
  d: Dynamic;
  status: 'ativa' | 'agendada' | 'encerrada';
  sales: Sale[];
  collaborators: Collaborator[];
  modeloRanking: 'escadinha' | 'lista';
  onDelete: () => void;
}) {
  const isUnidade = d.metrica === 'unidade';
  const realizado = computeDinamicaProgresso(d, sales, collaborators);
  const pct = d.metaValor > 0 ? Math.min(100, (realizado / d.metaValor) * 100) : null;
  const ranking = computeDinamicaRanking(d, sales, collaborators)
    .filter((r) => r.valor > 0 || r.itens > 0)
    .slice(0, 10);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <b className="text-sm">{d.titulo}</b>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_PILL[status]}`}>{STATUS_LABEL[status]}</span>
        </div>
        <button onClick={onDelete} className="text-slate-500 hover:text-rose-400 text-sm">
          ✕
        </button>
      </div>
      <div className="text-xs text-slate-400 mt-1.5">
        {fmtDateBR(d.dataInicio)} → {fmtDateBR(d.dataFim)}
        {d.metaValor > 0 && ` · meta ${isUnidade ? `${d.metaValor} un.` : fmtMoney(d.metaValor)}`}
        {d.produtos.length ? ` · ${d.produtos.length} produto(s) específico(s)` : ' · todos os produtos'}
        {d.participantes.length ? ` · ${d.participantes.length} participante(s)` : ' · todos os colaboradores'}
        {` · Setor: ${SETOR_ALVO_LABEL[d.setorAlvo]}`}
      </div>
      {d.descricao && <div className="text-xs text-slate-400 mt-1">{d.descricao}</div>}
      <div className="text-xs font-mono text-green-400 mt-2">
        Realizado: {isUnidade ? `${realizado} un.` : fmtMoney(realizado)}
        {pct !== null && ` · ${pct.toFixed(0)}% da meta`}
      </div>
      {pct !== null && (
        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden mt-1">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500" style={{ width: `${pct}%` }} />
        </div>
      )}
      {ranking.length > 0 && (
        <div className="mt-3">
          <PodiumStaircase
            ranking={ranking}
            getValue={(r) => (isUnidade ? r.itens : r.valor)}
            formatValue={(v) => (isUnidade ? `${v} un.` : fmtMoney(v))}
            variant={modeloRanking}
          />
        </div>
      )}
    </div>
  );
}

function NewDynamicForm({
  collaborators,
  onCreate,
  creating,
}: {
  collaborators: { id: string; matricula: string; nome: string; apelido: string | null }[];
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
  }) => void;
  creating: boolean;
}) {
  const today = todayISO();
  const [titulo, setTitulo] = useState('');
  const [dataInicio, setDataInicio] = useState(today);
  const [dataFim, setDataFim] = useState(today);
  const [setorAlvo, setSetorAlvo] = useState<Dynamic['setorAlvo']>('ambos');
  const [metrica, setMetrica] = useState<'valor' | 'unidade'>('valor');
  const [metaValor, setMetaValor] = useState(0);
  const [descricao, setDescricao] = useState('');
  const [produtoInput, setProdutoInput] = useState('');
  const [produtos, setProdutos] = useState<string[]>([]);
  const [participantes, setParticipantes] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);

  function addProduto() {
    const nome = produtoInput.trim();
    if (!nome) return;
    setProdutos((prev) => [...prev, nome]);
    setProdutoInput('');
  }

  function toggleParticipante(matricula: string) {
    setParticipantes((prev) => (prev.includes(matricula) ? prev.filter((m) => m !== matricula) : [...prev, matricula]));
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
    });
    setTitulo('');
    setDescricao('');
    setSetorAlvo('ambos');
    setMetaValor(0);
    setProdutos([]);
    setParticipantes([]);
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Métrica da meta">
          <select value={metrica} onChange={(e) => setMetrica(e.target.value as 'valor' | 'unidade')} className="input">
            <option value="valor">Moeda (R$)</option>
            <option value="unidade">Unidade (un.)</option>
          </select>
        </Field>
        <Field label="Meta (opcional)">
          <input type="number" value={metaValor} onChange={(e) => setMetaValor(Number(e.target.value))} className="input" />
        </Field>
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

      <div>
        <label className="block text-xs text-slate-400 mb-1">Produtos participantes (opcional — vazio = todos os produtos)</label>
        <div className="flex gap-2">
          <input
            value={produtoInput}
            onChange={(e) => setProdutoInput(e.target.value)}
            placeholder="nome do produto"
            className="input flex-1"
          />
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

      <div>
        <label className="block text-xs text-slate-400 mb-1">Colaboradores participantes (opcional — nenhum marcado = todos)</label>
        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
          {collaborators.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5 text-xs bg-slate-800 rounded-full px-2.5 py-1 cursor-pointer">
              <input type="checkbox" checked={participantes.includes(c.matricula)} onChange={() => toggleParticipante(c.matricula)} />
              {c.apelido || c.nome}
            </label>
          ))}
        </div>
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
