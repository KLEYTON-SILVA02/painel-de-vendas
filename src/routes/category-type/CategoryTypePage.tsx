import { useState } from 'react';
import { PageLoading } from '../../components/PageLoading';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { SimpleSheetImportPanel } from '../../components/admin/SimpleSheetImportPanel';
import { TagIcon } from '../../components/icons/NavIcons';
import { MetricsFilterBar, type MfbStatCard } from '../../components/MetricsFilterBar';
import { SalesListLockedNotice } from '../../components/SalesListLockedNotice';
import { PodiumSplit, type PodiumSpots } from '../../components/ranking/PodiumSplit';
import { PodiumStaircase } from '../../components/ranking/PodiumStaircase';
import { RankingModeToggle } from '../../components/ranking/RankingModeToggle';
import { auditBioOutsideBalcao, computeBioSummary, groupBioRows, type BioSummaryRow } from '../../lib/business/bio';
import { classifyBio } from '../../lib/business/classification';
import { diasRestantesNoMes } from '../../lib/business/goals';
import type { BioGroupGoal, BioWeights } from '../../lib/business/types';
import { fmtDateBR } from '../../lib/format';
import { useAddBioProduct, useBulkInsertBioProducts, useDeleteBioProduct, useUpdateBioGroupGoal, useUpdateStoreSettings } from '../../lib/mutations';
import { useBioGroupGoals, useBioGroups, useCategoryTypes, useCollaborators, useSales, useStoreSettings } from '../../lib/queries';
import { useDateRange } from '../DateRangeContext';

/** Generic screen for any ADM-created partnership category (Gerenciar
 * Categorias) — the same Ranking/Grupos/Pontos mechanics BIOSINTÉTICA runs
 * on (see bio.ts / classification.ts / BioPage.tsx), but with a fully
 * dynamic group set instead of a fixed G1-G4: an ADM names each group
 * itself when they create it (see GruposView's "Criar novo grupo" form),
 * and every group keeps its own keyword-classified product list so sales
 * keep being identified/classified into the right group exactly like
 * Biosintética. Weight per group lives in bio_group_goals.peso here,
 * unlike Biosintética's store_settings.bio_weights (see migration 0028).
 */
export function CategoryTypePage() {
  const { chave } = useParams<{ chave: string }>();
  const { profile } = useAuth();
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: categoryTypes } = useCategoryTypes();
  const { data: storeSettings } = useStoreSettings();
  const updateStoreSettings = useUpdateStoreSettings(profile?.store_id);
  const categoryType = categoryTypes?.find((c) => c.chave === chave);
  const { data: bioGroupRows } = useBioGroups(categoryType?.id);
  const { data: groupGoals } = useBioGroupGoals(categoryType?.id);
  const { dashFrom, dashTo, salesListEnabled, toggleSalesListEnabled } = useDateRange();
  const [view, setView] = useState<'ranking' | 'grupos' | 'pontos'>('ranking');
  const [groupFilter, setGroupFilter] = useState<string>('ALL');
  const [foraOpen, setForaOpen] = useState(false);

  if (categoryTypes && !categoryType) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
        <p className="text-sm text-slate-400 mb-3">Categoria não encontrada.</p>
        <Link to="/admin/categorias" className="text-cyan-400 text-sm hover:underline">
          ← Voltar para Gerenciar Categorias
        </Link>
      </div>
    );
  }

  if (!collaborators || !sales || !categoryType || !bioGroupRows || !groupGoals || !storeSettings) {
    return <PageLoading />;
  }

  const bioGroups = groupBioRows(bioGroupRows);
  const groupNames = Array.from(new Set([...Object.keys(bioGroups), ...Object.keys(groupGoals)])).sort();
  const weights: BioWeights = {};
  groupNames.forEach((g) => {
    weights[g] = groupGoals[g]?.peso ?? 0;
  });
  const setoresElegiveis = categoryType.setores_elegiveis;

  if (view === 'grupos') {
    return (
      <GruposView
        storeId={profile?.store_id}
        categoryTypeId={categoryType.id}
        categoryNome={categoryType.nome}
        bioGroups={bioGroups}
        groupNames={groupNames}
        rows={bioGroupRows}
        onBack={() => setView('ranking')}
      />
    );
  }
  if (view === 'pontos') {
    const demonstrativo = computeBioSummary(sales, collaborators, bioGroups, weights, dashFrom, dashTo, 'ALL', setoresElegiveis);
    return (
      <PontosView
        storeId={profile?.store_id}
        categoryTypeId={categoryType.id}
        categoryNome={categoryType.nome}
        groupNames={groupNames}
        groupGoals={groupGoals}
        demonstrativo={demonstrativo}
        onBack={() => setView('ranking')}
      />
    );
  }

  const ranking = computeBioSummary(sales, collaborators, bioGroups, weights, dashFrom, dashTo, groupFilter, setoresElegiveis);
  const foraDoSetor = auditBioOutsideBalcao(
    sales.filter((s) => !s.dataISO || (s.dataISO >= dashFrom && s.dataISO <= dashTo)),
    collaborators,
    bioGroups,
    setoresElegiveis,
  );
  const elegiveisMatriculas = new Set(
    collaborators.filter((c) => c.setor !== null && setoresElegiveis.includes(c.setor)).map((c) => c.matricula),
  );
  const salesForTable = salesListEnabled
    ? sales
        .filter((s) => {
          if (s.dataISO && s.dataISO < dashFrom) return false;
          if (s.dataISO && s.dataISO > dashTo) return false;
          return !!classifyBio(s.produto, bioGroups);
        })
        .sort((a, b) => (b.dataISO || '').localeCompare(a.dataISO || ''))
        .slice(0, 150)
    : [];

  const totalItens = ranking.reduce((a, r) => a + r.itens, 0);
  const vendedoresAtivos = ranking.filter((r) => r.itens > 0).length;
  const dias = diasRestantesNoMes();

  const statCards: MfbStatCard[] = [
    { label: 'Dias restantes do mês', value: `${dias} dia(s)`, color: '#14ff00' },
    { label: 'Itens vendidos', value: `${totalItens} un.`, color: '#a82bff' },
    { label: 'Vendedores ativos', value: String(vendedoresAtivos), color: '#ff3df0' },
    {
      actions: [
        { label: 'Gerenciar Grupos', color: '#00c2ff', onClick: () => setView('grupos') },
        { label: 'Gerenciar Pontos', color: '#ff8a00', onClick: () => setView('pontos') },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-cyan-400 font-semibold mb-3 flex items-center gap-2">
          {categoryType.icone_url ? (
            <img src={categoryType.icone_url} alt="" className="w-5 h-5 object-contain" />
          ) : (
            <TagIcon width={18} height={18} />
          )}
          {categoryType.nome} — Ranking
        </h3>
        <MetricsFilterBar statCards={statCards} />
      </div>

      {foraDoSetor.length > 0 && (
        <div className="rounded-xl border border-pink-500/40 bg-pink-500/5 text-xs text-pink-300">
          <button onClick={() => setForaOpen((v) => !v)} className="w-full flex items-center gap-2 p-3 text-left">
            <span>⚠️</span>
            <span className="flex-1">
              Existem <b>{foraDoSetor.length} venda(s)</b> de produtos desta categoria registradas por colaboradores
              fora do(s) setor(es) elegível(is) ({setoresElegiveis.join(', ')}) neste período. Elas não entram neste
              ranking. <b>Toque para ver detalhes.</b>
            </span>
            <span>{foraOpen ? '▲' : '▼'}</span>
          </button>
          {foraOpen && (
            <div className="border-t border-pink-500/30 px-3 py-2 overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-pink-300/70">
                    <th className="py-1 pr-3">Data</th>
                    <th className="py-1 pr-3">Colaborador</th>
                    <th className="py-1 pr-3">Setor</th>
                    <th className="py-1 pr-3">Produto</th>
                    <th className="py-1 pr-3">Grupo</th>
                  </tr>
                </thead>
                <tbody>
                  {foraDoSetor.map((a, i) => (
                    <tr key={i} className="border-t border-pink-500/10">
                      <td className="py-1 pr-3 font-mono">{fmtDateBR(a.dataISO)}</td>
                      <td className="py-1 pr-3">{a.vendedor}</td>
                      <td className="py-1 pr-3">{a.setor || '—'}</td>
                      <td className="py-1 pr-3">{a.produto}</td>
                      <td className="py-1 pr-3">{a.grupo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-1 flex-wrap">
        {(['ALL', ...groupNames] as const).map((k) => (
          <button
            key={k}
            onClick={() => setGroupFilter(k)}
            className={`rounded-lg px-3 py-1.5 text-xs ${groupFilter === k ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
          >
            {k === 'ALL' ? 'Todos' : k}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        {elegiveisMatriculas.size === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">
            Nenhum colaborador cadastrado no(s) setor(es) elegível(is) desta categoria.
          </div>
        ) : storeSettings.ranking_moderno ? (
          <PodiumSplit
            ranking={ranking.filter((r) => r.itens > 0)}
            getValue={(r) => r.pontos}
            formatValue={(v) => `${v.toFixed(1)} pts`}
            bgUrl={storeSettings.ranking_podium_bg_url}
            spots={storeSettings.ranking_podium_spots as unknown as PodiumSpots | null}
          />
        ) : (
          <PodiumStaircase
            ranking={ranking.filter((r) => r.itens > 0)}
            getValue={(r) => r.pontos}
            formatValue={(v) => `${v.toFixed(1)} pts`}
            getSub={(r) => `${r.itens} un.`}
            variant="escadinha"
          />
        )}
        {elegiveisMatriculas.size > 0 && (
          <div className="flex justify-end mt-3">
            <RankingModeToggle
              on={storeSettings.ranking_moderno}
              onToggle={() => updateStoreSettings.mutate({ ranking_moderno: !storeSettings.ranking_moderno })}
            />
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-sm font-semibold mb-1">Lista de vendas — {categoryType.nome}</h3>
        {!salesListEnabled ? (
          <SalesListLockedNotice onEnable={toggleSalesListEnabled} />
        ) : (
          <>
        <p className="text-xs text-slate-500 mb-3">Mostra as vendas de produtos desta categoria no período, com a pontuação calculada.</p>
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
                  <th className="py-1.5 pr-3">Grupo</th>
                </tr>
              </thead>
              <tbody>
                {salesForTable.map((s) => {
                  const g = classifyBio(s.produto, bioGroups);
                  const pontos = g ? s.qtd * (weights[g] || 0) : 0;
                  const fora = g && !elegiveisMatriculas.has(s.matricula);
                  return (
                    <tr key={s.id} className="border-b border-slate-900">
                      <td className="py-1.5 pr-3 font-mono">{fmtDateBR(s.dataISO)}</td>
                      <td className="py-1.5 pr-3 font-mono">{s.matricula}</td>
                      <td className="py-1.5 pr-3">{s.vendedor}</td>
                      <td className="py-1.5 pr-3">
                        {s.produto}
                        {fora && (
                          <span
                            title="Produto desta categoria vendido por colaborador fora do(s) setor(es) elegível(is) — não entra no ranking."
                            className="ml-1 font-bold text-pink-400"
                          >
                            !
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 font-mono">{s.qtd}</td>
                      <td className="py-1.5 pr-3">
                        {g ? (
                          <span className="text-[10px] bg-cyan-500/20 text-cyan-400 rounded-full px-2 py-0.5">
                            [{g}] {pontos.toFixed(1)}pts
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}

function GruposView({
  storeId,
  categoryTypeId,
  categoryNome,
  bioGroups,
  groupNames,
  rows,
  onBack,
}: {
  storeId: string | undefined;
  categoryTypeId: string;
  categoryNome: string;
  bioGroups: Record<string, { nome: string; palavras: string[] }[]>;
  groupNames: string[];
  rows: { id: string; grupo: string; nome: string; palavras: string[] }[];
  onBack: () => void;
}) {
  const [tab, setTab] = useState<string>(groupNames[0] ?? '');
  const [nome, setNome] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const addProduct = useAddBioProduct(storeId, categoryTypeId);
  const bulkInsertBio = useBulkInsertBioProducts(storeId, categoryTypeId);
  const deleteProduct = useDeleteBioProduct();
  const updateGroupGoal = useUpdateBioGroupGoal(storeId, categoryTypeId);

  const effectiveTab = tab && groupNames.includes(tab) ? tab : groupNames[0] ?? '';

  function handleAdd() {
    if (!nome.trim() || !effectiveTab) return;
    addProduct.mutate({ grupo: effectiveTab, nome: nome.trim() });
    setNome('');
  }

  async function handleCreateGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    await updateGroupGoal.mutateAsync({ grupo: name, patch: { meta1: 0, meta2: 0, meta3: 0, peso: 0 } });
    setTab(name);
    setNewGroupName('');
    setCreatingGroup(false);
  }

  const groupRows = rows.filter((r) => r.grupo === effectiveTab);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-cyan-400 font-semibold">{categoryNome} — Gerenciar Grupos</h3>
          <button onClick={onBack} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
            ← Voltar ao Ranking
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Cada grupo tem sua própria lista de produtos, usada para identificar e classificar automaticamente as vendas
          dessa categoria por palavra-chave.
        </p>
        <div className="flex gap-1 flex-wrap items-center">
          {groupNames.map((g) => (
            <button
              key={g}
              onClick={() => setTab(g)}
              className={`rounded-lg px-3 py-1.5 text-xs ${effectiveTab === g ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
            >
              {g}
            </button>
          ))}
          {!creatingGroup ? (
            <button
              onClick={() => setCreatingGroup(true)}
              className="rounded-lg border border-dashed border-slate-600 px-3 py-1.5 text-xs text-slate-400 hover:text-cyan-400 hover:border-cyan-400"
            >
              + Novo grupo
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Nome do grupo"
                className="input"
                style={{ width: 140, height: 32 }}
                autoFocus
              />
              <button
                onClick={handleCreateGroup}
                disabled={updateGroupGoal.isPending}
                className="rounded-lg bg-amber-500 text-slate-950 px-2 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                Criar
              </button>
              <button
                onClick={() => {
                  setCreatingGroup(false);
                  setNewGroupName('');
                }}
                className="rounded-lg border border-slate-700 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>

      {!effectiveTab ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-center text-sm text-slate-500">
          Nenhum grupo cadastrado ainda. Crie o primeiro grupo acima para começar a cadastrar produtos.
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="font-semibold mb-3 text-sm">Cadastro manual — {effectiveTab}</h3>
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

          <SimpleSheetImportPanel
            title={`Importar planilha de produtos — ${effectiveTab}`}
            columns={['Nome do produto', 'Palavra-chave (opcional)']}
            onConfirm={async (sheetRows) => {
              const parsed = sheetRows
                .map((r) => ({ nome: r[0]?.trim() || '', grupo: effectiveTab, palavras: [r[1]?.trim() || r[0]?.trim() || ''] }))
                .filter((r) => r.nome);
              if (parsed.length === 0) return { count: 0, skipped: sheetRows.length };
              await bulkInsertBio.mutateAsync(parsed);
              return { count: parsed.length, skipped: sheetRows.length - parsed.length };
            }}
          />

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="font-semibold mb-3 text-sm">
              Produtos — {effectiveTab} ({(bioGroups[effectiveTab] || []).length})
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
        </>
      )}
    </div>
  );
}

function PontosView({
  storeId,
  categoryTypeId,
  categoryNome,
  groupNames,
  groupGoals,
  demonstrativo,
  onBack,
}: {
  storeId: string | undefined;
  categoryTypeId: string;
  categoryNome: string;
  groupNames: string[];
  groupGoals: Partial<Record<string, BioGroupGoal>>;
  demonstrativo: BioSummaryRow[];
  onBack: () => void;
}) {
  const [pesos, setPesos] = useState<Record<string, number>>(
    Object.fromEntries(groupNames.map((g) => [g, groupGoals[g]?.peso ?? 0])),
  );
  const [metas, setMetas] = useState<Record<string, [number, number, number]>>(
    Object.fromEntries(groupNames.map((g) => [g, [groupGoals[g]?.meta1 ?? 0, groupGoals[g]?.meta2 ?? 0, groupGoals[g]?.meta3 ?? 0]])),
  );
  const updateGroupGoal = useUpdateBioGroupGoal(storeId, categoryTypeId);
  const [saving, setSaving] = useState(false);

  function setMeta(g: string, idx: 0 | 1 | 2, value: number) {
    setMetas((prev) => {
      const next: [number, number, number] = [...(prev[g] ?? [0, 0, 0])] as [number, number, number];
      next[idx] = value;
      return { ...prev, [g]: next };
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      for (const g of groupNames) {
        await updateGroupGoal.mutateAsync({
          grupo: g,
          patch: { meta1: metas[g]?.[0] ?? 0, meta2: metas[g]?.[1] ?? 0, meta3: metas[g]?.[2] ?? 0, peso: pesos[g] ?? 0 },
        });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-cyan-400 font-semibold">{categoryNome} — Gerenciar Pontos</h3>
          <button onClick={onBack} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
            ← Voltar ao Ranking
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-4">Pontuação por item vendido e as 3 metas (patamares) de cada grupo.</p>
        {groupNames.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">Nenhum grupo cadastrado ainda — crie grupos em Gerenciar Grupos.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {groupNames.map((g) => (
              <div key={g} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                <div className="font-semibold text-sm mb-2">{g}</div>
                <label className="block text-xs text-slate-400 mb-1">Pontuação</label>
                <input
                  type="number"
                  step="0.1"
                  value={pesos[g] ?? 0}
                  onChange={(e) => setPesos((prev) => ({ ...prev, [g]: Number(e.target.value) }))}
                  className="input mb-2"
                />
                <label className="block text-xs text-slate-400 mb-1">Meta 1</label>
                <input type="number" value={metas[g]?.[0] ?? 0} onChange={(e) => setMeta(g, 0, Number(e.target.value))} className="input mb-2" />
                <label className="block text-xs text-slate-400 mb-1">Meta 2</label>
                <input type="number" value={metas[g]?.[1] ?? 0} onChange={(e) => setMeta(g, 1, Number(e.target.value))} className="input mb-2" />
                <label className="block text-xs text-slate-400 mb-1">Meta 3</label>
                <input type="number" value={metas[g]?.[2] ?? 0} onChange={(e) => setMeta(g, 2, Number(e.target.value))} className="input" />
              </div>
            ))}
          </div>
        )}
      </div>
      {groupNames.length > 0 && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="self-start rounded-lg bg-amber-500 text-slate-950 font-medium px-4 py-2 text-sm disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Salvar Ajustes'}
        </button>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-3 text-sm">Demonstrativo de Metas</h3>
        {demonstrativo.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">Nenhum colaborador no(s) setor(es) elegível(is).</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-800">
                  <th className="py-2 pr-3">Colaborador</th>
                  {groupNames.map((g) => (
                    <th key={g} className="py-2 pr-3">
                      {g}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {demonstrativo.map((r) => (
                  <tr key={r.matricula} className="border-b border-slate-900">
                    <td className="py-2 pr-3">{r.apelido || r.nome}</td>
                    {groupNames.map((g) => {
                      const pontosGrupo = (r.qtd[g] || 0) * (groupGoals[g]?.peso ?? 0);
                      const meta1 = groupGoals[g]?.meta1 ?? 0;
                      const pct = meta1 > 0 ? Math.min(999, (pontosGrupo / meta1) * 100) : null;
                      return (
                        <td key={g} className="py-2 pr-3 font-mono font-semibold">
                          {pct !== null ? `${pct.toFixed(0)}%` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
