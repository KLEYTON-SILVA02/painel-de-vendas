import { useMemo, useState } from 'react';
import { MobileRankingBoard } from '../../components/collaborator/MobileRankingBoard';
import { computeBioSummaryAllSectors, groupBioRows } from '../../lib/business/bio';
import { classifyBio, type BioGroupKey } from '../../lib/business/classification';
import type { BioWeights, Collaborator } from '../../lib/business/types';
import { fmtDateShortBR } from '../../lib/format';
import { useBioGroups, useCategoryTypes, useCollaborators, useSales, useStoreSettings } from '../../lib/queries';
import { MobileDateFilter } from '../admin-mobile/MobileDateFilter';
import { MobileSalesListLockedNotice, resolveVendorName } from '../admin-mobile/MobileSellerDetail';
import { useDateRange } from '../DateRangeContext';

const GROUP_LABELS: Record<BioGroupKey, string> = { G1: 'Grupo 1', G2: 'Grupo 2', G3: 'Grupo 3', G4: 'Grupo 4' };

const BIO_GROUP_KEYS: BioGroupKey[] = ['G1', 'G2', 'G3', 'G4'];

// Mobile view for Balcão collaborators — same MobileDateFilter +
// MobileRankingBoard shell as CollaboratorRankingPage, but ranked by BIO
// points instead of R$ (matches admin BioPage's ranking logic).
export function CollaboratorBioPage() {
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: storeSettings } = useStoreSettings();
  const { data: categoryTypes } = useCategoryTypes();
  const bioCategoryType = categoryTypes?.find((c) => c.chave === 'biosintetica');
  const { data: bioGroupRows } = useBioGroups(bioCategoryType?.id);
  const { dashFrom, dashTo, salesListEnabled, toggleSalesListEnabled } = useDateRange();
  const [bioFilter, setBioFilter] = useState<BioGroupKey | 'ALL'>('ALL');

  // Safe stand-ins so the useMemo calls below always run in the same order
  // (Rules of Hooks) whether or not every query has resolved yet — the
  // "Carregando…" guard comes after them, not before.
  const salesData = sales ?? [];
  const collaboratorsData = collaborators ?? [];
  const bioWeightsData = (storeSettings?.bio_weights ?? {}) as unknown as BioWeights;
  // groupBioRows builds a fresh object every call — memoized so the
  // useMemo below doesn't recompute on every render just because this
  // reference changed underneath it.
  const bioGroups = useMemo(() => groupBioRows(bioGroupRows), [bioGroupRows]);
  const ranking = useMemo(
    () => computeBioSummaryAllSectors(salesData, collaboratorsData, bioGroups, bioWeightsData, dashFrom, dashTo, bioFilter),
    [salesData, collaboratorsData, bioGroups, bioWeightsData, dashFrom, dashTo, bioFilter],
  );
  const byMatricula = useMemo(() => {
    const map = new Map<string, Collaborator>();
    collaboratorsData.forEach((c) => map.set(c.matricula, c));
    return map;
  }, [collaboratorsData]);
  // Same "somente os produtos da(s) categoria(s) correspondente(s)" scope as
  // MobileBioPage's own detailed sales list — only sales classifyBio can
  // match to a G1-G4 product, regardless of who sold it or their sector.
  const salesForTable = useMemo(
    () =>
      salesListEnabled
        ? salesData
            .filter((s) => {
              if (s.dataISO && s.dataISO < dashFrom) return false;
              if (s.dataISO && s.dataISO > dashTo) return false;
              return !!classifyBio(s.produto, bioGroups);
            })
            .sort((a, b) => (b.dataISO || '').localeCompare(a.dataISO || ''))
            .slice(0, 150)
        : [],
    [salesListEnabled, salesData, bioGroups, dashFrom, dashTo],
  );

  if (!collaborators || !sales || !storeSettings || !bioCategoryType || !bioGroupRows) {
    return <div style={{ padding: 24, fontSize: 12, color: 'var(--mv2-texto-2)' }}>Carregando…</div>;
  }

  const totalPontos = ranking.reduce((a, r) => a + r.pontos, 0);
  const totalItens = ranking.reduce((a, r) => a + r.itens, 0);

  return (
    <div>
      <div className="mv2-screen-title mv2-biosintetica">BIOSINTÉTICA</div>

      <div className="mv2-chip-row mv2-chip-row-lg">
        {(['ALL', ...BIO_GROUP_KEYS] as const).map((k) => (
          <button
            key={k}
            onClick={() => setBioFilter(k)}
            className={`mv2-chip ${bioFilter === k ? 'active' : ''}`}
            style={{ ['--mv2-chip-color' as string]: '#14ff00' }}
          >
            {k === 'ALL' ? 'Todos' : k}
          </button>
        ))}
      </div>

      <div className="mv2-metrics-grid">
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: '#14ff00' }}>
          <div className="mv2-label">Total de pontos</div>
          <div className="mv2-value">{totalPontos.toFixed(1)} pts</div>
        </div>
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: '#00f0ff' }}>
          <div className="mv2-label">Itens vendidos</div>
          <div className="mv2-value">{totalItens} un.</div>
        </div>
      </div>

      <MobileDateFilter />

      <div className="mv2-card">
        <div className="mv2-card-title" style={{ color: '#14ff00' }}>
          🧪 BIOSINTÉTICA — Ranking
        </div>
        {ranking.length === 0 ? (
          <div style={{ fontSize: 10, color: 'var(--mv2-texto-2)', padding: '8px 0', textAlign: 'center' }}>
            Nenhuma venda de Biosintética no período ainda.
          </div>
        ) : (
          <MobileRankingBoard
            ranking={ranking}
            getValue={(r) => r.pontos}
            formatValue={(v) => `${v.toFixed(1)} pts`}
            getSub={(r) => `${r.itens} un.`}
          />
        )}
      </div>

      <div style={{ margin: '18px 18px 8px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 6 }}>Lista de vendas — Biosintética</div>
        {!salesListEnabled ? (
          <MobileSalesListLockedNotice onEnable={toggleSalesListEnabled} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="mv2-data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Nome do Colaborador</th>
                  <th>Produto</th>
                  <th>Quantidade</th>
                  <th>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {salesForTable.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--mv2-texto-2)', padding: 8 }}>
                      Nenhuma venda no período.
                    </td>
                  </tr>
                ) : (
                  salesForTable.map((s) => {
                    const g = classifyBio(s.produto, bioGroups)!;
                    return (
                      <tr key={s.id}>
                        <td>{fmtDateShortBR(s.dataISO)}</td>
                        <td>{resolveVendorName(s, byMatricula)}</td>
                        <td>{s.produto}</td>
                        <td>{s.qtd}</td>
                        <td>{GROUP_LABELS[g]}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
