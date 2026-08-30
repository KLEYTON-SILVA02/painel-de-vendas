import { useState } from 'react';
import { MobileDateFilterBar } from '../../components/collaborator/MobileDateFilterBar';
import { MobileRankingBoard } from '../../components/collaborator/MobileRankingBoard';
import { BALCAO_SETOR, computeBioSummary } from '../../lib/business/bio';
import type { BioGroupKey } from '../../lib/business/classification';
import type { BioGroupsProducts, BioWeights } from '../../lib/business/types';
import { useBioGroups, useCollaborators, useSales, useStoreSettings } from '../../lib/queries';
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

// Mobile view for Balcão collaborators — same MobileDateFilterBar +
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
    return <div className="text-sm text-slate-500 p-6 text-center">Carregando…</div>;
  }

  const bioGroups = groupBioRows(bioGroupRows);
  const bioWeights = storeSettings.bio_weights as unknown as BioWeights;
  const balcaoCount = collaborators.filter((c) => c.setor === BALCAO_SETOR).length;
  const ranking = computeBioSummary(sales, collaborators, bioGroups, bioWeights, dashFrom, dashTo, bioFilter).filter((r) => r.itens > 0);
  const totalPontos = ranking.reduce((a, r) => a + r.pontos, 0);
  const totalItens = ranking.reduce((a, r) => a + r.itens, 0);

  return (
    <div className="flex flex-col gap-3">
      <MobileDateFilterBar />

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {(['ALL', ...BIO_GROUP_KEYS] as const).map((k) => (
          <button
            key={k}
            onClick={() => setBioFilter(k)}
            className="flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide border"
            style={{
              borderColor: '#14ff00',
              color: bioFilter === k ? '#04101c' : '#14ff00',
              background: bioFilter === k ? '#14ff00' : 'transparent',
            }}
          >
            {k === 'ALL' ? 'Todos' : k}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Total de pontos</div>
          <div className="text-sm font-mono font-bold" style={{ color: '#14ff00' }}>
            {totalPontos.toFixed(1)} pts
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Itens vendidos</div>
          <div className="text-sm font-mono font-bold" style={{ color: '#00f0ff' }}>
            {totalItens} un.
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-green-400 font-semibold text-sm mb-3">🧪 BIOSINTÉTICA — Ranking Balcão</h3>
        {balcaoCount === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">Nenhum colaborador cadastrado no setor Balcão.</div>
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
