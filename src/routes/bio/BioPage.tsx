import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { MetricsFilterBar, type MfbStatCard } from '../../components/MetricsFilterBar';
import { PodiumStaircase } from '../../components/ranking/PodiumStaircase';
import {
  auditBioOutsideBalcao,
  BALCAO_SETOR,
  computeBioSummary,
} from '../../lib/business/bio';
import { classifyBio, type BioGroupKey } from '../../lib/business/classification';
import { diasRestantesNoMes } from '../../lib/business/goals';
import type { BioGroupsProducts, BioWeights } from '../../lib/business/types';
import { fmtDateBR } from '../../lib/format';
import { useAddBioProduct, useDeleteBioProduct, useUpdateBioWeights } from '../../lib/mutations';
import { useBioGroups, useCollaborators, useSales, useStoreSettings } from '../../lib/queries';
import { useDateRange } from '../DateRangeContext';

const BIO_GROUP_KEYS: BioGroupKey[] = ['G1', 'G2', 'G3', 'G4'];
const GRUPO_LABELS: Record<BioGroupKey, string> = { G1: 'Grupo 1', G2: 'Grupo 2', G3: 'Grupo 3', G4: 'Grupo 4' };
const CAT_LABEL_SHORT: Record<string, string> = { DERM: 'Dermo', GEN: 'Gen/Sim', MP: 'Marcas Excl.', MER: 'Merc. Geral' };

function groupBioRows(rows: { grupo: string; nome: string; palavras: string[]; id: string }[] | undefined): BioGroupsProducts {
  const result: BioGroupsProducts = { G1: [], G2: [], G3: [], G4: [] };
  (rows ?? []).forEach((r) => {
    const g = r.grupo as BioGroupKey;
    if (result[g]) result[g].push({ nome: r.nome, palavras: r.palavras });
  });
  return result;
}

export function BioPage() {
  const { profile } = useAuth();
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: storeSettings } = useStoreSettings();
  const { data: bioGroupRows } = useBioGroups();
  const { dashFrom, dashTo } = useDateRange();
  const [view, setView] = useState<'ranking' | 'grupos' | 'pontos'>('ranking');
  const [bioFilter, setBioFilter] = useState<BioGroupKey | 'ALL'>('ALL');
  const [tableView, setTableView] = useState<'padrao' | 'bio'>('padrao');

  if (!collaborators || !sales || !storeSettings || !bioGroupRows) {
    return <div className="text-sm text-slate-500 p-6">Carregando…</div>;
  }

  const bioGroups = groupBioRows(bioGroupRows);
  const bioWeights = storeSettings.bio_weights as unknown as BioWeights;

  if (view === 'grupos') {
    return (
      <BioGruposView
        storeId={profile?.store_id}
        bioGroups={bioGroups}
        rows={bioGroupRows}
        onBack={() => setView('ranking')}
      />
    );
  }
  if (view === 'pontos') {
    return <BioPontosView storeId={profile?.store_id} bioWeights={bioWeights} onBack={() => setView('ranking')} />;
  }

  const ranking = computeBioSummary(sales, collaborators, bioGroups, bioWeights, dashFrom, dashTo, bioFilter);
  const foraDoBalcao = auditBioOutsideBalcao(
    sales.filter((s) => (!s.dataISO || (s.dataISO >= dashFrom && s.dataISO <= dashTo))),
    collaborators,
    bioGroups,
  );
  const balcaoMatriculas = new Set(collaborators.filter((c) => c.setor === BALCAO_SETOR).map((c) => c.matricula));
  // "Visão Padrão" stays Balcão-only (it's about the sector's general sales).
  // "Visão BIOSINTÉTICA" shows every G1-G4 sale regardless of sector — a sale
  // by someone outside Balcão isn't hidden, just flagged with "!" in the row.
  const salesForTable = sales
    .filter((s) => {
      if (s.dataISO && s.dataISO < dashFrom) return false;
      if (s.dataISO && s.dataISO > dashTo) return false;
      if (tableView === 'bio') return !!classifyBio(s.produto, bioGroups);
      return balcaoMatriculas.has(s.matricula);
    })
    .sort((a, b) => (b.dataISO || '').localeCompare(a.dataISO || ''))
    .slice(0, 150);

  const modeloRanking = storeSettings.modelo_ranking as 'escadinha' | 'lista';
  const totalItensBio = ranking.reduce((a, r) => a + r.itens, 0);
  const vendedoresAtivos = ranking.filter((r) => r.itens > 0).length;
  const dias = diasRestantesNoMes();

  const statCards: MfbStatCard[] = [
    { label: 'Dias restantes do mês', value: `${dias} dia(s)`, color: '#14ff00' },
    { label: 'Itens vendidos G1-G4', value: `${totalItensBio} un.`, color: '#a82bff' },
    { label: 'Vendedores ativos', value: String(vendedoresAtivos), color: '#ff3df0' },
    {
      actions: [
        { label: 'Gerenciar Grupos', color: '#00c2ff', onClick: () => setView('grupos') },
        { label: 'Gerenciar Pontos', color: '#ff8a00', onClick: () => setView('pontos') },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-green-400 font-semibold mb-3">🧪 BIOSINTÉTICA — Ranking Balcão</h3>
        <MetricsFilterBar statCards={statCards} />
      </div>

      {foraDoBalcao.length > 0 && (
        <div className="rounded-xl border border-pink-500/40 bg-pink-500/5 p-3 text-xs text-pink-300 flex items-center gap-2">
          <span>⚠️</span>
          <span>
            Existem <b>{foraDoBalcao.length} venda(s)</b> de produtos G1–G4 registradas por colaboradores fora do setor
            Balcão neste período. Elas não entram neste ranking.
          </span>
        </div>
      )}

      <div className="flex gap-1">
        {(['ALL', ...BIO_GROUP_KEYS] as const).map((k) => (
          <button
            key={k}
            onClick={() => setBioFilter(k)}
            className={`rounded-lg px-3 py-1.5 text-xs ${bioFilter === k ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
          >
            {k === 'ALL' ? 'Todos' : k}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        {collaborators.filter((c) => c.setor === BALCAO_SETOR).length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">Nenhum colaborador cadastrado no setor Balcão.</div>
        ) : (
          <PodiumStaircase
            ranking={ranking.filter((r) => r.itens > 0)}
            getValue={(r) => r.pontos}
            formatValue={(v) => `${v.toFixed(1)} pts`}
            getSub={(r) => `${r.itens} un.`}
            variant={modeloRanking}
          />
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold">Lista de vendas — Balcão</h3>
          <div className="flex gap-1">
            <button
              onClick={() => setTableView('padrao')}
              className={`rounded-lg px-2.5 py-1 text-xs ${tableView === 'padrao' ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
            >
              Visão Padrão
            </button>
            <button
              onClick={() => setTableView('bio')}
              className={`rounded-lg px-2.5 py-1 text-xs ${tableView === 'bio' ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
            >
              Visão BIOSINTÉTICA
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          {tableView === 'bio'
            ? 'Mostra só as vendas de produtos dos grupos G1-G4, com a pontuação calculada.'
            : 'Mostra todas as vendas do setor Balcão no período, com a categoria de cada produto.'}
        </p>
        {salesForTable.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">Nenhuma venda no período.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-800">
                  <th className="py-1.5 pr-3">Data</th>
                  <th className="py-1.5 pr-3">Matrícula</th>
                  <th className="py-1.5 pr-3">Vendedor</th>
                  <th className="py-1.5 pr-3">Produto</th>
                  <th className="py-1.5 pr-3">Qtd</th>
                  <th className="py-1.5 pr-3">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {salesForTable.map((s) => {
                  const g = classifyBio(s.produto, bioGroups);
                  const pontos = g ? s.qtd * (bioWeights[g] || 0) : 0;
                  const outsideBalcao = tableView === 'bio' && g && !balcaoMatriculas.has(s.matricula);
                  return (
                    <tr key={s.id} className="border-b border-slate-900">
                      <td className="py-1.5 pr-3 font-mono">{fmtDateBR(s.dataISO)}</td>
                      <td className="py-1.5 pr-3 font-mono">{s.matricula}</td>
                      <td className="py-1.5 pr-3">{s.vendedor}</td>
                      <td className="py-1.5 pr-3">
                        {s.produto}
                        {outsideBalcao && (
                          <span
                            title="Produto da Biosintética vendido por colaborador fora do setor Balcão — não entra no ranking."
                            className="ml-1 font-bold text-pink-400"
                          >
                            !
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 font-mono">{s.qtd}</td>
                      <td className="py-1.5 pr-3">
                        {tableView === 'bio' ? (
                          g ? (
                            <span className="text-[10px] bg-green-500/20 text-green-400 rounded-full px-2 py-0.5">
                              [{g}] {pontos.toFixed(1)}pts
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500">—</span>
                          )
                        ) : (
                          <span className="text-[10px] bg-slate-800 text-slate-300 rounded-full px-2 py-0.5">
                            {s.grupo ? CAT_LABEL_SHORT[s.grupo] : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function BioGruposView({
  storeId,
  bioGroups,
  rows,
  onBack,
}: {
  storeId: string | undefined;
  bioGroups: BioGroupsProducts;
  rows: { id: string; grupo: string; nome: string; palavras: string[] }[];
  onBack: () => void;
}) {
  const [tab, setTab] = useState<BioGroupKey>('G1');
  const [nome, setNome] = useState('');
  const addProduct = useAddBioProduct(storeId);
  const deleteProduct = useDeleteBioProduct();

  function handleAdd() {
    if (!nome.trim()) return;
    addProduct.mutate({ grupo: tab, nome: nome.trim() });
    setNome('');
  }

  const groupRows = rows.filter((r) => r.grupo === tab);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-green-400 font-semibold">🧪 BIOSINTÉTICA — Gerenciar Grupos</h3>
          <button onClick={onBack} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
            ← Voltar ao Ranking
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3">Vincule produtos aos grupos G1–G4.</p>
        <div className="flex gap-1">
          {BIO_GROUP_KEYS.map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-lg px-3 py-1.5 text-xs ${tab === k ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
            >
              {GRUPO_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-3 text-sm">Cadastro manual</h3>
        <div className="flex gap-2">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome do produto"
            className="input flex-1"
          />
          <button onClick={handleAdd} className="rounded-md bg-amber-500 text-slate-950 px-4 py-1.5 text-sm font-medium">
            + Adicionar
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-3 text-sm">
          Produtos — {GRUPO_LABELS[tab]} ({bioGroups[tab].length})
        </h3>
        {groupRows.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">Nenhum produto cadastrado.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {groupRows.map((p) => (
              <div key={p.id} className="rounded-lg bg-slate-950/60 border border-slate-800 p-3 flex items-center justify-between">
                <b className="text-sm">{p.nome}</b>
                <button onClick={() => deleteProduct.mutate(p.id)} className="text-slate-500 hover:text-rose-400">
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BioPontosView({
  storeId,
  bioWeights,
  onBack,
}: {
  storeId: string | undefined;
  bioWeights: BioWeights;
  onBack: () => void;
}) {
  const [weights, setWeights] = useState<BioWeights>(bioWeights);
  const updateWeights = useUpdateBioWeights(storeId);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-green-400 font-semibold">🧪 BIOSINTÉTICA — Gerenciar Pontos</h3>
        <button onClick={onBack} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
          ← Voltar ao Ranking
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-4">Pontos ganhos por item vendido em cada grupo.</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {BIO_GROUP_KEYS.map((k) => (
          <div key={k}>
            <label className="block text-xs text-slate-400 mb-1">{k}</label>
            <input
              type="number"
              step="0.1"
              value={weights[k]}
              onChange={(e) => setWeights((prev) => ({ ...prev, [k]: Number(e.target.value) }))}
              className="input"
            />
          </div>
        ))}
      </div>
      <button
        onClick={() => updateWeights.mutate(weights)}
        disabled={updateWeights.isPending}
        className="rounded-lg bg-amber-500 text-slate-950 font-medium px-4 py-2 text-sm disabled:opacity-50"
      >
        {updateWeights.isPending ? 'Salvando…' : 'Salvar pontuação'}
      </button>
    </div>
  );
}
