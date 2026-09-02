import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { SimpleSheetImportPanel } from '../../components/admin/SimpleSheetImportPanel';
import { RankingImageModal } from '../../components/ranking/RankingImageModal';
import { auditBioOutsideBalcao, BALCAO_SETOR, computeBioSummary, groupBioRows, type BioSummaryRow } from '../../lib/business/bio';
import { classifyBio, normalizeGrupoImport, type BioGroupKey } from '../../lib/business/classification';
import { diasRestantesNoMes } from '../../lib/business/goals';
import type { BioGroupGoal, BioGroupsProducts, BioWeights, Collaborator } from '../../lib/business/types';
import { copyText, formatRankingText } from '../../lib/clipboard';
import { fmtDateBR } from '../../lib/format';
import { useAddBioProduct, useBulkInsertBioProducts, useDeleteBioProduct, useUpdateBioGroupGoal, useUpdateBioWeights } from '../../lib/mutations';
import { generateRankingImageBlob, tryCopyImage } from '../../lib/rankingImage';
import { useBioGroupGoals, useBioGroups, useCategoryTypes, useCollaborators, useSales, useStoreSettings } from '../../lib/queries';
import { useDateRange } from '../DateRangeContext';
import { MobileDateFilter } from './MobileDateFilter';
import { resolveVendorName } from './MobileSellerDetail';

const BIO_GROUP_KEYS: BioGroupKey[] = ['G1', 'G2', 'G3', 'G4'];
const GROUP_LABELS: Record<BioGroupKey, string> = { G1: 'Grupo 1', G2: 'Grupo 2', G3: 'Grupo 3', G4: 'Grupo 4' };
const GROUP_COLORS: Record<BioGroupKey, string> = { G1: '#00b6da', G2: '#a82bff', G3: '#ff3df0', G4: '#f26122' };

export function MobileBioPage() {
  const { profile } = useAuth();
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: storeSettings } = useStoreSettings();
  const { data: categoryTypes } = useCategoryTypes();
  const bioCategoryType = categoryTypes?.find((c) => c.chave === 'biosintetica');
  const { data: bioGroupRows } = useBioGroups(bioCategoryType?.id);
  const { data: groupGoals } = useBioGroupGoals(bioCategoryType?.id);
  const { dashFrom, dashTo, setModoGeral } = useDateRange();
  const [view, setView] = useState<'ranking' | 'grupos' | 'pontos'>('ranking');
  const [groupFilter, setGroupFilter] = useState<BioGroupKey | 'ALL'>('ALL');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imageModal, setImageModal] = useState<{ url: string; copied: boolean } | null>(null);
  const [foraDoBalcaoOpen, setForaDoBalcaoOpen] = useState(false);

  // Biosintética always opens in Modo Geral (mês inteiro), regardless of what
  // date-mode was left active on another screen — the date filter is shared
  // globally across all screens (DateRangeProvider is a single app-wide
  // instance). Users remain free to switch to a day-specific search afterward.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setModoGeral(), []);

  const byMatricula = useMemo(() => {
    const map = new Map<string, Collaborator>();
    (collaborators ?? []).forEach((c) => map.set(c.matricula, c));
    return map;
  }, [collaborators]);

  // Safe stand-ins so the useMemo calls below always run in the same order
  // (Rules of Hooks) whether or not every query has resolved yet, and
  // regardless of which of Ranking/Grupos/Pontos is showing — the
  // "Carregando…" guard and the view-specific early returns both come
  // after them, not before.
  const salesData = sales ?? [];
  const collaboratorsData = collaborators ?? [];
  const bioWeightsData = (storeSettings?.bio_weights ?? {}) as unknown as BioWeights;
  const setoresElegiveisData = bioCategoryType?.setores_elegiveis ?? [];

  // groupBioRows builds a fresh object every call — memoized so the
  // useMemo calls below (which depend on it) don't recompute on every
  // render just because this reference changed underneath them.
  const bioGroups = useMemo(() => groupBioRows(bioGroupRows), [bioGroupRows]);

  // computeBioSummary/auditBioOutsideBalcao/classifyBio-per-sale are all
  // O(sales) with keyword matching per row — noticeably heavier per item
  // than a plain field comparison, and this screen is the one Balcão
  // collaborators land on by default on mobile.
  const demonstrativo = useMemo(
    () => computeBioSummary(salesData, collaboratorsData, bioGroups, bioWeightsData, dashFrom, dashTo, 'ALL', setoresElegiveisData),
    [salesData, collaboratorsData, bioGroups, bioWeightsData, dashFrom, dashTo, setoresElegiveisData],
  );
  const ranking = useMemo(
    () => computeBioSummary(salesData, collaboratorsData, bioGroups, bioWeightsData, dashFrom, dashTo, groupFilter, setoresElegiveisData),
    [salesData, collaboratorsData, bioGroups, bioWeightsData, dashFrom, dashTo, groupFilter, setoresElegiveisData],
  );
  // Per-group mini cards always reflect the full G1-G4 split, independent of
  // which tab is selected below (matches the spec: they let you compare
  // groups "antes mesmo de abrir o ranking") — same underlying query as
  // `demonstrativo` above (groupFilter='ALL'), reused instead of a third
  // identical O(sales) pass.
  const allRanking = demonstrativo;
  const foraDoBalcao = useMemo(
    () =>
      auditBioOutsideBalcao(
        salesData.filter((s) => !s.dataISO || (s.dataISO >= dashFrom && s.dataISO <= dashTo)),
        collaboratorsData,
        bioGroups,
        setoresElegiveisData,
      ),
    [salesData, collaboratorsData, bioGroups, setoresElegiveisData, dashFrom, dashTo],
  );
  // Always scoped to G1-G4 products only, regardless of seller's sector — a
  // sale by someone outside Balcão isn't hidden, just flagged with "!" in
  // the row, matching auditBioOutsideBalcao's own audit criteria.
  const salesForTable = useMemo(
    () =>
      salesData
        .filter((s) => {
          if (s.dataISO && s.dataISO < dashFrom) return false;
          if (s.dataISO && s.dataISO > dashTo) return false;
          return !!classifyBio(s.produto, bioGroups);
        })
        .sort((a, b) => (b.dataISO || '').localeCompare(a.dataISO || ''))
        .slice(0, 150),
    [salesData, bioGroups, dashFrom, dashTo],
  );

  if (!collaborators || !sales || !storeSettings || !bioCategoryType || !bioGroupRows || !groupGoals) {
    return <div style={{ padding: 24, fontSize: 12, color: 'var(--mv2-texto-2)' }}>Carregando…</div>;
  }

  const bioWeights = bioWeightsData;
  const balcaoCollaborators = collaborators.filter((c) => c.setor === BALCAO_SETOR);
  const dias = diasRestantesNoMes();

  if (view === 'grupos') {
    return (
      <MobileBioGruposView
        storeId={profile?.store_id}
        categoryTypeId={bioCategoryType.id}
        bioGroups={bioGroups}
        rows={bioGroupRows}
        onBack={() => setView('ranking')}
      />
    );
  }
  if (view === 'pontos') {
    return (
      <MobileBioPontosView
        storeId={profile?.store_id}
        categoryTypeId={bioCategoryType.id}
        bioWeights={bioWeights}
        groupGoals={groupGoals}
        demonstrativo={demonstrativo}
        onBack={() => setView('ranking')}
      />
    );
  }

  const rankingList = ranking.filter((r) => r.itens > 0).sort((a, b) => b.pontos - a.pontos);
  const totalItensBio = ranking.reduce((a, r) => a + r.itens, 0);
  const vendedoresAtivos = ranking.filter((r) => r.itens > 0).length;
  const groupTotals = Object.fromEntries(BIO_GROUP_KEYS.map((g) => [g, allRanking.reduce((a, r) => a + (r.qtd[g] || 0), 0)])) as Record<
    BioGroupKey,
    number
  >;
  const balcaoMatriculas = new Set(balcaoCollaborators.map((c) => c.matricula));

  async function handleCopy() {
    const text = formatRankingText(rankingList.map((r) => ({ ...r, valor: r.pontos })), 'Biosintética', dashFrom, dashTo);
    const ok = await copyText(text);
    setCopied(ok);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleGenerateImage() {
    setGenerating(true);
    try {
      const rows = rankingList.map((r) => ({ nome: r.nome, apelido: r.apelido, foto: r.foto, valor: r.pontos }));
      const blob = await generateRankingImageBlob(rows, 'Biosintética', dashFrom, dashTo);
      if (!blob) return;
      const wasCopied = await tryCopyImage(blob);
      setImageModal({ url: URL.createObjectURL(blob), copied: wasCopied });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <div className="mv2-screen-title mv2-biosintetica">BIOSINTÉTICA</div>

      <div className="mv2-row" style={{ margin: '0 18px 12px' }}>
        <button className="mv2-view-toggle" onClick={() => setView('grupos')}>
          Gerenciar Grupos
        </button>
        <button className="mv2-view-toggle" onClick={() => setView('pontos')}>
          Gerenciar Pontos
        </button>
      </div>

      <div className="mv2-metrics-grid">
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: '#14ff00' }}>
          <div className="mv2-label">Dias Restantes</div>
          <div className="mv2-value">{dias} dia(s)</div>
        </div>
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: '#ff3df0' }}>
          <div className="mv2-label">Vendedores Ativos</div>
          <div className="mv2-value">{vendedoresAtivos}</div>
        </div>
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: '#a82bff', gridColumn: '1 / -1' }}>
          <div className="mv2-label">Itens Vendidos G1-G4</div>
          <div className="mv2-value">{totalItensBio} un.</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, margin: '0 18px 12px' }}>
        {BIO_GROUP_KEYS.map((g) => (
          <div key={g} className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: GROUP_COLORS[g], padding: '6px 8px' }}>
            <div className="mv2-label" style={{ fontSize: 7 }}>
              {g}
            </div>
            <div className="mv2-value" style={{ fontSize: 11 }}>
              {groupTotals[g]} un.
            </div>
          </div>
        ))}
      </div>

      {foraDoBalcao.length > 0 && (
        <div
          style={{
            margin: '0 18px 12px',
            fontSize: 9,
            color: 'var(--mv2-rosa)',
            border: '1px solid var(--mv2-rosa)',
            borderRadius: 'var(--mv2-radius-sm)',
            overflow: 'hidden',
          }}
        >
          <button
            onClick={() => setForaDoBalcaoOpen((v) => !v)}
            style={{ width: '100%', background: 'none', border: 'none', color: 'inherit', textAlign: 'left', padding: 8, fontSize: 9 }}
          >
            ⚠ {foraDoBalcao.length} venda(s) de produtos G1-G4 fora do setor Balcão não entram neste ranking. Toque para ver detalhes.{' '}
            {foraDoBalcaoOpen ? '▲' : '▼'}
          </button>
          {foraDoBalcaoOpen && (
            <div style={{ borderTop: '1px solid var(--mv2-rosa)', padding: '6px 8px', overflowX: 'auto' }}>
              {foraDoBalcao.map((a, i) => (
                <div key={i} style={{ padding: '4px 0', borderBottom: i < foraDoBalcao.length - 1 ? '1px solid rgba(255,255,255,.08)' : 'none' }}>
                  <div style={{ fontWeight: 700 }}>
                    {a.vendedor} · {fmtDateBR(a.dataISO)}
                  </div>
                  <div style={{ color: 'var(--mv2-texto-2)' }}>
                    {a.produto} · {a.setor || '—'} · [{a.grupo}]
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <MobileDateFilter />

      <div className="mv2-group-tabs" style={{ margin: '0 18px 8px' }}>
        {(['ALL', ...BIO_GROUP_KEYS] as const).map((k) => (
          <button key={k} className={groupFilter === k ? 'active' : ''} onClick={() => setGroupFilter(k)}>
            {k === 'ALL' ? 'Todos' : k}
          </button>
        ))}
      </div>

      <div className="mv2-ranking-list-card">
        {rankingList.length === 0 ? (
          <div style={{ fontSize: 10, color: 'var(--mv2-texto-2)', padding: '8px 0', textAlign: 'center' }}>Sem vendas no período.</div>
        ) : (
          rankingList.map((r, i) => (
            <div key={r.matricula} className="mv2-row">
              <span className="mv2-pos" style={{ color: 'var(--mv2-rosa)' }}>
                {i + 1}
              </span>
              {r.foto ? <img src={r.foto} alt="" className="mv2-avatar" /> : <div className="mv2-avatar" />}
              <span className="mv2-name">{r.apelido || r.nome}</span>
              <span className="mv2-qty">
                {r.itens} un. · {r.pontos.toFixed(1)} pts
              </span>
            </div>
          ))
        )}
      </div>

      <div className="mv2-ranking-actions">
        <div className="mv2-row" style={{ gap: 6 }}>
          <button className="mv2-btn-outline" onClick={handleCopy}>
            {copied ? '✓ Copiado' : 'Copiar'}
          </button>
          <button className="mv2-btn-generate" onClick={handleGenerateImage} disabled={generating}>
            {generating ? 'Gerando…' : 'Gerar Imagem'}
          </button>
        </div>
      </div>

      <div style={{ margin: '18px 18px 8px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 6 }}>Lista de vendas — Biosintética</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="mv2-data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Nome do Colaborador</th>
                <th>Produto</th>
                <th>Quantidade</th>
                <th>Tipo</th>
                <th>Pontos</th>
              </tr>
            </thead>
            <tbody>
              {salesForTable.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--mv2-texto-2)', padding: 8 }}>
                    Nenhuma venda no período.
                  </td>
                </tr>
              ) : (
                salesForTable.map((s) => {
                  const g = classifyBio(s.produto, bioGroups)!;
                  const pontos = s.qtd * (bioWeights[g] || 0);
                  const outsideBalcao = !balcaoMatriculas.has(s.matricula);
                  return (
                    <tr key={s.id}>
                      <td>{fmtDateBR(s.dataISO)}</td>
                      <td>
                        {resolveVendorName(s, byMatricula)}
                        {outsideBalcao && (
                          <span
                            title="Produto da Biosintética vendido por colaborador fora do setor Balcão — não entra no ranking."
                            style={{ marginLeft: 4, color: 'var(--mv2-rosa)', fontWeight: 700 }}
                          >
                            !
                          </span>
                        )}
                      </td>
                      <td>{s.produto}</td>
                      <td>{s.qtd}</td>
                      <td>{GROUP_LABELS[g]}</td>
                      <td>{pontos.toFixed(1)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {imageModal && (
        <RankingImageModal
          url={imageModal.url}
          copied={imageModal.copied}
          onClose={() => setImageModal(null)}
          title="Imagem — Biosintética"
          filename="biosintetica-ranking.png"
          alt="Ranking Biosintética"
        />
      )}
    </div>
  );
}

function MobileBioGruposView({
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
    <div>
      <div className="mv2-screen-title mv2-biosintetica" style={{ justifyContent: 'space-between' }}>
        <span>GERENCIAR GRUPOS</span>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 9, cursor: 'pointer' }}>
          ← Voltar ao Ranking
        </button>
      </div>

      <div className="mv2-group-tabs" style={{ margin: '0 18px 12px' }}>
        {BIO_GROUP_KEYS.map((k) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {GROUP_LABELS[k]}
          </button>
        ))}
      </div>

      <div className="mv2-product-form" style={{ margin: '0 18px 12px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, marginBottom: 6, color: 'var(--mv2-texto-2)', textTransform: 'uppercase' }}>
          Cadastro Manual
        </div>
        <input placeholder="Nome do produto" value={nome} onChange={(e) => setNome(e.target.value)} />
        <button className="mv2-btn-primary" style={{ width: '100%' }} onClick={handleAdd}>
          + Adicionar
        </button>
      </div>

      <div style={{ margin: '0 18px 12px' }}>
        <p style={{ fontSize: 10, color: 'var(--mv2-texto-2)', marginBottom: 6 }}>
          A coluna "Categoria (Grupo)" é opcional: se a célula não indicar um grupo (ex.: "G1", "Grupo 2"), o produto
          entra no grupo da aba selecionada acima ({GROUP_LABELS[tab]}).
        </p>
        <SimpleSheetImportPanel
          title="Importar planilha de produtos Biosintética"
          columns={['Nome do produto', 'Categoria (Grupo)', 'Tipo']}
          onConfirm={async (rows) => {
            // See BioPage.tsx (desktop) for why an unrecognized grupo cell falls
            // back to the active tab instead of silently dropping the row.
            const parsed = rows
              .map((r) => ({ nome: r[0]?.trim() || '', grupo: normalizeGrupoImport(r[1] || '') ?? tab, palavras: [r[2]?.trim() || r[0]?.trim() || ''] }))
              .filter((r) => r.nome);
            if (parsed.length === 0) return { count: 0, skipped: rows.length };
            await bulkInsertBio.mutateAsync(parsed as { grupo: BioGroupKey; nome: string; palavras: string[] }[]);
            return { count: parsed.length, skipped: rows.length - parsed.length };
          }}
        />
      </div>

      <div style={{ margin: '0 18px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 6 }}>
          Produtos — {GROUP_LABELS[tab]} ({bioGroups[tab].length})
        </div>
        {groupRows.length === 0 ? (
          <div style={{ fontSize: 10, color: 'var(--mv2-texto-2)', padding: '8px 0', textAlign: 'center' }}>Nenhum produto cadastrado.</div>
        ) : (
          groupRows.map((p) => (
            <div key={p.id} className="mv2-product-list-item">
              <span>{p.nome}</span>
              <button
                onClick={() => deleteProduct.mutate(p.id)}
                style={{ background: 'none', border: 'none', color: 'var(--mv2-texto-2)', cursor: 'pointer', fontSize: 12 }}
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function MobileBioPontosView({
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
  // separate from the general `goals` table (see item 5 of the request).
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
    <div>
      <div className="mv2-screen-title mv2-biosintetica" style={{ justifyContent: 'space-between' }}>
        <span>GERENCIAR PONTOS</span>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 9, cursor: 'pointer' }}>
          ← Voltar ao Ranking
        </button>
      </div>
      <div style={{ margin: '0 18px 12px', fontSize: 9, color: 'var(--mv2-texto-2)' }}>Pontos ganhos por item vendido em cada grupo.</div>

      <div className="mv2-points-grid">
        {BIO_GROUP_KEYS.map((g) => (
          <div key={g} className="mv2-field">
            <span style={{ fontSize: 8, fontWeight: 700, textAlign: 'center' }}>{g}</span>
            <label style={{ fontSize: 6.5, color: 'var(--mv2-texto-2)' }}>Pontuação</label>
            <input
              type="number"
              step="0.1"
              value={weights[g]}
              onChange={(e) => setWeights((prev) => ({ ...prev, [g]: Number(e.target.value) }))}
            />
            <label style={{ fontSize: 6.5, color: 'var(--mv2-texto-2)' }}>Meta 1</label>
            <input type="number" value={metas[g][0]} onChange={(e) => setMeta(g, 0, Number(e.target.value))} />
            <label style={{ fontSize: 6.5, color: 'var(--mv2-texto-2)' }}>Meta 2</label>
            <input type="number" value={metas[g][1]} onChange={(e) => setMeta(g, 1, Number(e.target.value))} />
            <label style={{ fontSize: 6.5, color: 'var(--mv2-texto-2)' }}>Meta 3</label>
            <input type="number" value={metas[g][2]} onChange={(e) => setMeta(g, 2, Number(e.target.value))} />
          </div>
        ))}
      </div>

      <div style={{ margin: '0 18px 16px' }}>
        <button className="mv2-btn-primary" style={{ width: '100%' }} onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar Ajustes'}
        </button>
      </div>

      {/* Demonstrativo de metas: % de pontuação alcançado por colaborador em
          cada grupo, relativo à Meta 1 (o patamar base) daquele grupo — meta1
          é usada como referência de 100%; meta2/meta3 são os próximos
          patamares, configurados acima mas não usados no cálculo do %
          principal. Sem Meta 1 configurada para o grupo, mostra "—". */}
      <div style={{ margin: '0 18px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 6 }}>Demonstrativo de Metas</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="mv2-data-table mv2-goals-table">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>G1</th>
                <th>G2</th>
                <th>G3</th>
                <th>G4</th>
              </tr>
            </thead>
            <tbody>
              {demonstrativo.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--mv2-texto-2)', padding: 8 }}>
                    Nenhum colaborador no setor Balcão.
                  </td>
                </tr>
              ) : (
                demonstrativo.map((r) => (
                  <tr key={r.matricula}>
                    <td>{r.apelido || r.nome}</td>
                    {BIO_GROUP_KEYS.map((g) => {
                      const pontosGrupo = (r.qtd[g] || 0) * (bioWeights[g] || 0);
                      const meta1 = groupGoals[g]?.meta1 ?? 0;
                      const pct = meta1 > 0 ? Math.min(999, (pontosGrupo / meta1) * 100) : null;
                      return (
                        <td key={g} className="mv2-pct">
                          {pct !== null ? `${pct.toFixed(0)}%` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
