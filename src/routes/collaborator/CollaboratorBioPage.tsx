import { useState } from 'react';
import { MobileRankingBoard } from '../../components/collaborator/MobileRankingBoard';
import { BALCAO_SETOR, computeBioSummary } from '../../lib/business/bio';
import type { BioGroupKey } from '../../lib/business/classification';
import type { BioGroupsProducts, BioWeights } from '../../lib/business/types';
import { useBioGroups, useCollaborators, useSales, useStoreSettings } from '../../lib/queries';
import { MobileDateFilter } from '../admin-mobile/MobileDateFilter';
import { useDateRange } from '../DateRangeContext';

const BIO_GROUP_KEYS: BioGroupKey[] = ['G1', 'G2', 'G3', 'G4'];

function groupBioRows(rows: { grupo: string; nome: string; palavras: string[] }[] | undefined): BioGroupsProducts {
  const result: BioGroupsProducts = { G1: [], G2: [], G3: [], G4: [] };
  (rows ?? []).forEach((r) => {
    const g = r.grupo as BioGroupKey;
    if (result[g]) result[g].push({ nome: r.nome, palavras: r.palavras });
  });
  return result;
}

// Mobile view for Balcão collaborators — same MobileDateFilter +
// MobileRankingBoard shell as CollaboratorRankingPage, but ranked by BIO
// points instead of R$ (matches admin BioPage's ranking logic).
export function CollaboratorBioPage() {
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: storeSettings } = useStoreSettings();
  const { data: bioGroupRows } = useBioGroups();
  const { dashFrom, dashTo } = useDateRange();
  const [bioFilter, setBioFilter] = useState<BioGroupKey | 'ALL'>('ALL');

  if (!collaborators || !sales || !storeSettings || !bioGroupRows) {
    return <div style={{ padding: 24, fontSize: 12, color: 'var(--mv2-texto-2)' }}>Carregando…</div>;
  }

  const bioGroups = groupBioRows(bioGroupRows);
  const bioWeights = storeSettings.bio_weights as unknown as BioWeights;
  const balcaoCount = collaborators.filter((c) => c.setor === BALCAO_SETOR).length;
  const ranking = computeBioSummary(sales, collaborators, bioGroups, bioWeights, dashFrom, dashTo, bioFilter).filter((r) => r.itens > 0);
  const totalPontos = ranking.reduce((a, r) => a + r.pontos, 0);
  const totalItens = ranking.reduce((a, r) => a + r.itens, 0);

  return (
    <div>
      <div className="mv2-screen-title mv2-biosintetica">BIOSINTÉTICA</div>

      <div className="mv2-chip-row">
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
          🧪 BIOSINTÉTICA — Ranking Balcão
        </div>
        {balcaoCount === 0 ? (
          <div style={{ fontSize: 10, color: 'var(--mv2-texto-2)', padding: '8px 0', textAlign: 'center' }}>
            Nenhum colaborador cadastrado no setor Balcão.
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
    </div>
  );
}
