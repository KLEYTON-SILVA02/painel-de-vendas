import { useEffect, useState } from 'react';
import { PageLoading } from '../../components/PageLoading';
import { useAuth } from '../../auth/AuthContext';
import { SimpleSheetImportPanel } from '../../components/admin/SimpleSheetImportPanel';
import { MetricsFilterBar, type MfbStatCard } from '../../components/MetricsFilterBar';
import { SalesListLockedNotice } from '../../components/SalesListLockedNotice';
import { PodiumStaircase } from '../../components/ranking/PodiumStaircase';
import {
  auditBioOutsideBalcao,
  BALCAO_SETOR,
  computeBioSummary,
  groupBioRows,
  type BioSummaryRow,
} from '../../lib/business/bio';
import { classifyBio, normalizeGrupoImport, type BioGroupKey } from '../../lib/business/classification';
import { diasRestantesNoMes } from '../../lib/business/goals';
import type { BioGroupGoal, BioGroupsProducts, BioWeights } from '../../lib/business/types';
import { fmtDateBR } from '../../lib/format';
import { useAddBioProduct, useBulkInsertBioProducts, useDeleteBioProduct, useUpdateBioGroupGoal, useUpdateBioWeights } from '../../lib/mutations';
import { useBioGroupGoals, useBioGroups, useCategoryTypes, useCollaborators, useSales, useStoreSettings } from '../../lib/queries';
import { useDateRange } from '../DateRangeContext';

const BIO_GROUP_KEYS: BioGroupKey[] = ['G1', 'G2', 'G3', 'G4'];
const GRUPO_LABELS: Record<BioGroupKey, string> = { G1: 'Grupo 1', G2: 'Grupo 2', G3: 'Grupo 3', G4: 'Grupo 4' };

export function BioPage() {
  const { profile } = useAuth();
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: storeSettings } = useStoreSettings();
  const { data: categoryTypes } = useCategoryTypes();
  const bioCategoryType = categoryTypes?.find((c) => c.chave === 'biosintetica');
  const { data: bioGroupRows } = useBioGroups(bioCategoryType?.id);
  const { data: groupGoals } = useBioGroupGoals(bioCategoryType?.id);
  const { dashFrom, dashTo, setModoGeral, salesListEnabled, toggleSalesListEnabled } = useDateRange();
  const [view, setView] = useState<'ranking' | 'grupos' | 'pontos'>('ranking');
  const [bioFilter, setBioFilter] = useState<BioGroupKey | 'ALL'>('ALL');
  const [foraDoBalcaoOpen, setForaDoBalcaoOpen] = useState(false);

  // Biosintética always opens in Modo Geral (mês inteiro), regardless of what
  // date-mode was left active on another screen — the date filter is shared
  // globally across all screens (DateRangeProvider is a single app-wide
  // instance). Users remain free to switch to a day-specific search afterward.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setModoGeral(), []);

  if (!collaborators || !sales || !storeSettings || !bioCategoryType || !bioGroupRows || !groupGoals) {
    return <PageLoading />;
  }

  const bioGroups = groupBioRows(bioGroupRows);
  const bioWeights = storeSettings.bio_weights as unknown as BioWeights;
  const setoresElegiveis = bioCategoryType.setores_elegiveis;

  if (view === 'grupos') {
    return (
      <BioGruposView
        storeId={profile?.store_id}
        categoryTypeId={bioCategoryType.id}
        bioGroups={bioGroups}
        rows={bioGroupRows}
        onBack={() => setView('ranking')}
      />
    );
  }
  if (view === 'pontos') {
    // computeBioSummary already scopes its rows to the category's eligible sector(s).
    const demonstrativo = computeBioSummary(sales, collaborators, bioGroups, bioWeights, dashFrom, dashTo, 'ALL', setoresElegiveis);
    return (
      <BioPontosView
        storeId={profile?.store_id}
        categoryTypeId={bioCategoryType.id}
        bioWeights={bioWeights}
        groupGoals={groupGoals}
        demonstrativo={demonstrativo}
        onBack={() => setView('ranking')}
      />
    );
  }

  const ranking = computeBioSummary(sales, collaborators, bioGroups, bioWeights, dashFrom, dashTo, bioFilter, setoresElegiveis);
  const foraDoBalcao = auditBioOutsideBalcao(
    sales.filter((s) => (!s.dataISO || (s.dataISO >= dashFrom && s.dataISO <= dashTo))),
    collaborators,
    bioGroups,
    setoresElegiveis,
  );
  const balcaoMatriculas = new Set(collaborators.filter((c) => c.setor === BALCAO_SETOR).map((c) => c.matricula));
  // Only Biosintética products (G1-G4) matter on this screen — every sale
  // shown here is G1-G4, regardless of the seller's sector. A sale by
  // someone outside Balcão isn't hidden, just flagged with "!" in the row
  // (see the pink alert bar above the table).
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
    <div className="flex flex-col gap-1.5">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <MetricsFilterBar statCards={statCards} />
      </div>

      {foraDoBalcao.length > 0 && (
        <div className="rounded-xl border border-pink-500/40 bg-pink-500/5 text-xs text-pink-300">
          <button onClick={() => setForaDoBalcaoOpen((v) => !v)} className="w-full flex items-center gap-2 p-3 text-left">
            <span>⚠️</span>
            <span className="flex-1">
              Existem <b>{foraDoBalcao.length} venda(s)</b> de produtos G1–G4 registradas por colaboradores fora do setor
              Balcão neste período. Elas não entram neste ranking. <b>Toque para ver detalhes.</b>
            </span>
            <span>{foraDoBalcaoOpen ? '▲' : '▼'}</span>
          </button>
          {foraDoBalcaoOpen && (
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
                  {foraDoBalcao.map((a, i) => (
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
        <h3 className="text-sm font-semibold mb-1">Lista de vendas — Biosintética</h3>
        {!salesListEnabled ? (
          <SalesListLockedNotice onEnable={toggleSalesListEnabled} />
        ) : (
          <>
        <p className="text-xs text-slate-500 mb-3">Mostra as vendas de produtos dos grupos G1-G4 no período, com a pontuação calculada.</p>
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
                  const outsideBalcao = g && !balcaoMatriculas.has(s.matricula);
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
                        {g ? (
                          <span className="text-[10px] bg-green-500/20 text-green-400 rounded-full px-2 py-0.5">
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

function BioGruposView({
  storeId,
  categoryTypeId,
  bioGroups,
  rows,
  onBack,
}: {
  storeId: string | undefined;
  categoryTypeId: string;
  bioGroups: BioGroupsProducts;
  rows: { id: string; grupo: string; nome: string; palavras: string[] }[];
  onBack: () => void;
}) {
  const [tab, setTab] = useState<BioGroupKey>('G1');
  const [nome, setNome] = useState('');
  const addProduct = useAddBioProduct(storeId, categoryTypeId);
  const bulkInsertBio = useBulkInsertBioProducts(storeId, categoryTypeId);
  const deleteProduct = useDeleteBioProduct();

  function handleAdd() {
    if (!nome.trim()) return;
    addProduct.mutate({ grupo: tab, nome: nome.trim() });
    setNome('');
  }

  const groupRows = rows.filter((r) => r.grupo === tab);

  return (
    <div className="flex flex-col gap-3">
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

      <p className="text-xs text-slate-500 -mt-2">
        A coluna "Categoria (Grupo)" é opcional: se a célula não indicar um grupo (ex.: "G1", "Grupo 2"), o produto
        entra no grupo da aba selecionada acima (<b>{GRUPO_LABELS[tab]}</b>).
      </p>

      <SimpleSheetImportPanel
        title="Importar planilha de produtos Biosintética"
        columns={['Nome do produto', 'Categoria (Grupo)', 'Tipo']}
        onConfirm={async (rows) => {
          // The "Categoria (Grupo)" column is optional, not required: when a row's
          // cell doesn't resolve to G1-G4 (blank, or text the sheet's author didn't
          // realize needed a group number), the row falls back to whichever tab
          // (G1-G4) is currently open — same as "Cadastro manual" above, which has
          // no grupo field at all and always adds to the active tab. Previously an
          // unparseable cell silently dropped the whole row instead, which is what
          // made bulk imports look like they weren't saving that group's products.
          const parsed = rows
            .map((r) => ({ nome: r[0]?.trim() || '', grupo: normalizeGrupoImport(r[1] || '') ?? tab, palavras: [r[2]?.trim() || r[0]?.trim() || ''] }))
            .filter((r) => r.nome);
          if (parsed.length === 0) return { count: 0, skipped: rows.length };
          await bulkInsertBio.mutateAsync(parsed as { grupo: BioGroupKey; nome: string; palavras: string[] }[]);
          return { count: parsed.length, skipped: rows.length - parsed.length };
        }}
      />

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
  categoryTypeId,
  bioWeights,
  groupGoals,
  demonstrativo,
  onBack,
}: {
  storeId: string | undefined;
  categoryTypeId: string;
  bioWeights: BioWeights;
  groupGoals: Partial<Record<BioGroupKey, BioGroupGoal>>;
  demonstrativo: BioSummaryRow[];
  onBack: () => void;
}) {
  const [weights, setWeights] = useState<BioWeights>(bioWeights);
  // Biosintética's own meta tiers — bio_group_goals table, deliberately
  // separate from the general `goals` table.
  const [metas, setMetas] = useState<Record<BioGroupKey, [number, number, number]>>({
    G1: [groupGoals.G1?.meta1 ?? 0, groupGoals.G1?.meta2 ?? 0, groupGoals.G1?.meta3 ?? 0],
    G2: [groupGoals.G2?.meta1 ?? 0, groupGoals.G2?.meta2 ?? 0, groupGoals.G2?.meta3 ?? 0],
    G3: [groupGoals.G3?.meta1 ?? 0, groupGoals.G3?.meta2 ?? 0, groupGoals.G3?.meta3 ?? 0],
    G4: [groupGoals.G4?.meta1 ?? 0, groupGoals.G4?.meta2 ?? 0, groupGoals.G4?.meta3 ?? 0],
  });
  const updateWeights = useUpdateBioWeights(storeId);
  const updateGroupGoal = useUpdateBioGroupGoal(storeId, categoryTypeId);
  const [saving, setSaving] = useState(false);

  function setMeta(g: BioGroupKey, idx: 0 | 1 | 2, value: number) {
    setMetas((prev) => {
      const next: [number, number, number] = [...prev[g]] as [number, number, number];
      next[idx] = value;
      return { ...prev, [g]: next };
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateWeights.mutateAsync(weights);
      for (const g of BIO_GROUP_KEYS) {
        await updateGroupGoal.mutateAsync({ grupo: g, patch: { meta1: metas[g][0], meta2: metas[g][1], meta3: metas[g][2] } });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-green-400 font-semibold">🧪 BIOSINTÉTICA — Gerenciar Pontos</h3>
          <button onClick={onBack} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
            ← Voltar ao Ranking
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-4">Pontuação por item vendido e as 3 metas (patamares) de cada grupo.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {BIO_GROUP_KEYS.map((k) => (
            <div key={k} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="font-semibold text-sm mb-2">{GRUPO_LABELS[k]}</div>
              <label className="block text-xs text-slate-400 mb-1">Pontuação</label>
              <input
                type="number"
                step="0.1"
                value={weights[k]}
                onChange={(e) => setWeights((prev) => ({ ...prev, [k]: Number(e.target.value) }))}
                className="input mb-2"
              />
              <label className="block text-xs text-slate-400 mb-1">Meta 1</label>
              <input type="number" value={metas[k][0]} onChange={(e) => setMeta(k, 0, Number(e.target.value))} className="input mb-2" />
              <label className="block text-xs text-slate-400 mb-1">Meta 2</label>
              <input type="number" value={metas[k][1]} onChange={(e) => setMeta(k, 1, Number(e.target.value))} className="input mb-2" />
              <label className="block text-xs text-slate-400 mb-1">Meta 3</label>
              <input type="number" value={metas[k][2]} onChange={(e) => setMeta(k, 2, Number(e.target.value))} className="input" />
            </div>
          ))}
        </div>
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="self-start rounded-lg bg-amber-500 text-slate-950 font-medium px-4 py-2 text-sm disabled:opacity-50"
      >
        {saving ? 'Salvando…' : 'Salvar Ajustes'}
      </button>

      {/* Demonstrativo de metas: % de pontuação alcançado por colaborador em
          cada grupo, relativo à Meta 1 (patamar base) daquele grupo. */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-3 text-sm">Demonstrativo de Metas</h3>
        {demonstrativo.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">Nenhum colaborador no setor Balcão.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-800">
                  <th className="py-2 pr-3">Colaborador</th>
                  {BIO_GROUP_KEYS.map((g) => (
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
                    {BIO_GROUP_KEYS.map((g) => {
                      const pontosGrupo = (r.qtd[g] || 0) * (bioWeights[g] || 0);
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
