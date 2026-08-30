import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { RankingImageModal } from '../../components/ranking/RankingImageModal';
import { auditBioOutsideBalcao, BALCAO_SETOR, computeBioSummary } from '../../lib/business/bio';
import { classifyBio, type BioGroupKey } from '../../lib/business/classification';
import { diasRestantesNoMes } from '../../lib/business/goals';
import type { BioGroupsProducts, Collaborator, BioWeights } from '../../lib/business/types';
import { copyText, formatRankingText } from '../../lib/clipboard';
import { fmtDateBR } from '../../lib/format';
import { useAddBioProduct, useDeleteBioProduct, useUpdateBioWeights } from '../../lib/mutations';
import { generateRankingImageBlob, tryCopyImage } from '../../lib/rankingImage';
import { useBioGroups, useCollaborators, useSales, useStoreSettings } from '../../lib/queries';
import { useDateRange } from '../DateRangeContext';
import { MobileDateFilter } from './MobileDateFilter';

const BIO_GROUP_KEYS: BioGroupKey[] = ['G1', 'G2', 'G3', 'G4'];
const GROUP_LABELS: Record<BioGroupKey, string> = { G1: 'Grupo 1', G2: 'Grupo 2', G3: 'Grupo 3', G4: 'Grupo 4' };
const GROUP_COLORS: Record<BioGroupKey, string> = { G1: '#00b6da', G2: '#a82bff', G3: '#ff3df0', G4: '#f26122' };
const CAT_LABEL_SHORT: Record<string, string> = { DERM: 'Dermo', GEN: 'Gen/Sim', MP: 'Marcas Excl.', MER: 'Merc. Geral' };

function groupBioRows(rows: { grupo: string; nome: string; palavras: string[]; id: string }[] | undefined): BioGroupsProducts {
  const result: BioGroupsProducts = { G1: [], G2: [], G3: [], G4: [] };
  (rows ?? []).forEach((r) => {
    const g = r.grupo as BioGroupKey;
    if (result[g]) result[g].push({ nome: r.nome, palavras: r.palavras });
  });
  return result;
}

export function MobileBioPage() {
  const { profile } = useAuth();
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: storeSettings } = useStoreSettings();
  const { data: bioGroupRows } = useBioGroups();
  const { dashFrom, dashTo } = useDateRange();
  const [view, setView] = useState<'ranking' | 'grupos' | 'pontos'>('ranking');
  const [groupFilter, setGroupFilter] = useState<BioGroupKey | 'ALL'>('ALL');
  const [rankView, setRankView] = useState<'lista' | 'colunas'>('lista');
  const [tableView, setTableView] = useState<'padrao' | 'bio'>('padrao');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imageModal, setImageModal] = useState<{ url: string; copied: boolean } | null>(null);

  if (!collaborators || !sales || !storeSettings || !bioGroupRows) {
    return <div style={{ padding: 24, fontSize: 12, color: 'var(--mv2-texto-2)' }}>Carregando…</div>;
  }

  const bioGroups = groupBioRows(bioGroupRows);
  const bioWeights = storeSettings.bio_weights as unknown as BioWeights;
  const balcaoCollaborators = collaborators.filter((c) => c.setor === BALCAO_SETOR);

  if (view === 'grupos') {
    return (
      <MobileBioGruposView storeId={profile?.store_id} bioGroups={bioGroups} rows={bioGroupRows} onBack={() => setView('ranking')} />
    );
  }
  if (view === 'pontos') {
    return (
      <MobileBioPontosView
        storeId={profile?.store_id}
        bioWeights={bioWeights}
        collaborators={balcaoCollaborators}
        onBack={() => setView('ranking')}
      />
    );
  }

  const ranking = computeBioSummary(sales, collaborators, bioGroups, bioWeights, dashFrom, dashTo, groupFilter);
  const rankingList = ranking.filter((r) => r.itens > 0).sort((a, b) => b.pontos - a.pontos);
  const totalItensBio = ranking.reduce((a, r) => a + r.itens, 0);
  const vendedoresAtivos = ranking.filter((r) => r.itens > 0).length;
  const dias = diasRestantesNoMes();

  // Per-group mini cards always reflect the full G1-G4 split, independent of
  // which tab is selected below (matches the spec: they let you compare
  // groups "antes mesmo de abrir o ranking").
  const allRanking = computeBioSummary(sales, collaborators, bioGroups, bioWeights, dashFrom, dashTo, 'ALL');
  const groupTotals = Object.fromEntries(BIO_GROUP_KEYS.map((g) => [g, allRanking.reduce((a, r) => a + r.qtd[g], 0)])) as Record<
    BioGroupKey,
    number
  >;

  const foraDoBalcao = auditBioOutsideBalcao(
    sales.filter((s) => !s.dataISO || (s.dataISO >= dashFrom && s.dataISO <= dashTo)),
    collaborators,
    bioGroups,
  );
  const balcaoMatriculas = new Set(balcaoCollaborators.map((c) => c.matricula));
  // "Padrão" stays Balcão-only (it's about the sector's general sales). "BIO"
  // shows every G1-G4 sale regardless of sector — a sale by someone outside
  // Balcão isn't hidden, just flagged with "!" in the row (see the "!" badge
  // below), matching auditBioOutsideBalcao's own audit criteria.
  const salesForTable = sales
    .filter((s) => {
      if (s.dataISO && s.dataISO < dashFrom) return false;
      if (s.dataISO && s.dataISO > dashTo) return false;
      if (tableView === 'bio') return !!classifyBio(s.produto, bioGroups);
      return balcaoMatriculas.has(s.matricula);
    })
    .sort((a, b) => (b.dataISO || '').localeCompare(a.dataISO || ''))
    .slice(0, 150);

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

      <div className="mv2-row" style={{ margin: '0 18px 12px', gap: 6 }}>
        <button className="mv2-btn-outline" style={{ flex: 1 }} onClick={() => setView('grupos')}>
          Gerenciar Grupos
        </button>
        <button className="mv2-btn-outline" style={{ flex: 1 }} onClick={() => setView('pontos')}>
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
            padding: 8,
          }}
        >
          ⚠ {foraDoBalcao.length} venda(s) de produtos G1-G4 fora do setor Balcão não entram neste ranking.
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

      {rankView === 'lista' ? (
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
                <span className="mv2-qty">{r.pontos.toFixed(1)} pts</span>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="mv2-ranking-track">
          {rankingList.map((r, i) => (
            <div key={r.matricula} className={`mv2-ranking-col ${i === 0 ? 'mv2-first' : i === 1 ? 'mv2-second' : i === 2 ? 'mv2-third' : ''}`}>
              {r.foto ? <img src={r.foto} alt="" className="mv2-avatar" /> : <div className="mv2-avatar" />}
              <div className="mv2-position">{i + 1}</div>
              <div className="mv2-name">{r.apelido || r.nome}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mv2-ranking-actions">
        <div className="mv2-row">
          <button className={`mv2-view-toggle ${rankView === 'lista' ? 'active' : ''}`} onClick={() => setRankView('lista')}>
            Lista
          </button>
          <button className={`mv2-view-toggle ${rankView === 'colunas' ? 'active' : ''}`} onClick={() => setRankView('colunas')}>
            Colunas
          </button>
        </div>
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
        <div className="mv2-row" style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, flex: 1 }}>Lista de vendas — Balcão</div>
          <button className={`mv2-view-toggle ${tableView === 'padrao' ? 'active' : ''}`} style={{ flex: 'none', padding: '4px 10px' }} onClick={() => setTableView('padrao')}>
            Padrão
          </button>
          <button className={`mv2-view-toggle ${tableView === 'bio' ? 'active' : ''}`} style={{ flex: 'none', padding: '4px 10px' }} onClick={() => setTableView('bio')}>
            BIO
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="mv2-data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Matrícula</th>
                <th>Nome</th>
                <th>Produto</th>
                <th>Qtd</th>
                <th>Tipo</th>
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
                  const g = classifyBio(s.produto, bioGroups);
                  const pontos = g ? s.qtd * (bioWeights[g] || 0) : 0;
                  const outsideBalcao = tableView === 'bio' && g && !balcaoMatriculas.has(s.matricula);
                  return (
                    <tr key={s.id}>
                      <td>{fmtDateBR(s.dataISO)}</td>
                      <td>{s.matricula}</td>
                      <td>{s.vendedor}</td>
                      <td>
                        {s.produto}
                        {outsideBalcao && (
                          <span
                            title="Produto da Biosintética vendido por colaborador fora do setor Balcão — não entra no ranking."
                            style={{ marginLeft: 4, color: 'var(--mv2-rosa)', fontWeight: 700 }}
                          >
                            !
                          </span>
                        )}
                      </td>
                      <td>{s.qtd}</td>
                      <td>{tableView === 'bio' ? (g ? `[${g}] ${pontos.toFixed(1)}pts` : '—') : s.grupo ? CAT_LABEL_SHORT[s.grupo] || s.grupo : '—'}</td>
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
  bioWeights,
  collaborators,
  onBack,
}: {
  storeId: string | undefined;
  bioWeights: BioWeights;
  collaborators: Collaborator[];
  onBack: () => void;
}) {
  const [weights, setWeights] = useState<BioWeights>(bioWeights);
  // The 3 meta tiers per group are described in the reference doc but have
  // no backing field in the data model (bio_weights only stores the flat
  // per-item score) — local-only mock state, not persisted. See FUNÇÕES
  // PENDENTES.
  const [metas, setMetas] = useState<Record<BioGroupKey, [number, number, number]>>({
    G1: [0, 0, 0],
    G2: [0, 0, 0],
    G3: [0, 0, 0],
    G4: [0, 0, 0],
  });
  const updateWeights = useUpdateBioWeights(storeId);

  function setMeta(g: BioGroupKey, idx: 0 | 1 | 2, value: number) {
    setMetas((prev) => {
      const next: [number, number, number] = [...prev[g]] as [number, number, number];
      next[idx] = value;
      return { ...prev, [g]: next };
    });
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
        <button
          className="mv2-btn-primary"
          style={{ width: '100%' }}
          onClick={() => updateWeights.mutate(weights)}
          disabled={updateWeights.isPending}
        >
          {updateWeights.isPending ? 'Salvando…' : 'Salvar Ajustes'}
        </button>
      </div>

      {/* Demonstrativo de metas: % de pontuação alcançado por colaborador em
          cada grupo. Sem uma fórmula de meta definida (as 3 metas acima são
          mock, não persistidas), os valores exibidos são placeholders
          ilustrativos — mesmo padrão usado no próprio documento de
          referência, que repete os mesmos 4 percentuais em toda linha da
          tabela de exemplo. Ver FUNÇÕES PENDENTES. */}
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
              {collaborators.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--mv2-texto-2)', padding: 8 }}>
                    Nenhum colaborador no setor Balcão.
                  </td>
                </tr>
              ) : (
                collaborators.map((c) => (
                  <tr key={c.id}>
                    <td>{c.apelido || c.nome}</td>
                    <td className="mv2-pct">50%</td>
                    <td className="mv2-pct">25%</td>
                    <td className="mv2-pct">15%</td>
                    <td className="mv2-pct">38%</td>
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
