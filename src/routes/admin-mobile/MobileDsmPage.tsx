import { useMemo } from 'react';
import { computeDsmSummary } from '../../lib/business/dsm';
import { diasRestantesNoMes } from '../../lib/business/goals';
import type { Goal } from '../../lib/business/types';
import { todayISO } from '../../lib/dateRange';
import { useCategoryTypes, useCollaborators, useDsmRecords, useGoals } from '../../lib/queries';
import { useDateRange } from '../DateRangeContext';
import { MobileDateFilter } from './MobileDateFilter';

const ACCENT = '#00e0c0';

// Mobile v2 twin of DsmPage.tsx (desktop) — same data source (dsm_records,
// not sales) and same "no fixed R$/tier ladder, any conversion counts"
// model as Levmel/Chip's mobile screen, but without its "Lista de vendas
// detalhada" section (DSM has no line-item sales to list) and without
// Copiar/Gerar imagem (same reasoning as the desktop screen: those
// generators hardcode R$/"un." formatting with no DSM-aware path yet).
export function MobileDsmPage() {
  const { data: collaborators } = useCollaborators();
  const { data: dsmRecords } = useDsmRecords();
  const { data: goals } = useGoals();
  const { data: categoryTypes } = useCategoryTypes();
  const { dashFrom, dashTo } = useDateRange();

  const title = categoryTypes?.find((c) => c.chave === 'dsm')?.nome ?? 'DSM';
  const today = todayISO();

  const collaboratorsData = collaborators ?? [];
  const recordsData = dsmRecords ?? [];

  const ranking = useMemo(
    () => computeDsmSummary(recordsData, collaboratorsData, dashFrom, dashTo),
    [recordsData, collaboratorsData, dashFrom, dashTo],
  );
  const todayRanking = useMemo(
    () => computeDsmSummary(recordsData, collaboratorsData, today, today),
    [recordsData, collaboratorsData, today],
  );

  if (!collaborators || !dsmRecords || !goals) {
    return <div style={{ padding: 24, fontSize: 12, color: 'var(--mv2-texto-2)' }}>Carregando…</div>;
  }

  const totalConversoes = ranking.reduce((a, r) => a + r.conversoes, 0);
  const conversoesHoje = todayRanking.reduce((a, r) => a + r.conversoes, 0);
  const colaboradoresAtivosHoje = todayRanking.filter((r) => r.conversoes > 0).length;
  const dias = diasRestantesNoMes();

  // goals.DSM isn't a GoalCategoryKey (that union stays scoped to the 6
  // fixed sales categories — see MetasPage.tsx's own note on this), so it's
  // read here the same way: a local cast, not a widened shared type.
  const dsmGoal = (goals as unknown as Partial<Record<'DSM', Goal>>).DSM;
  const metaMensal = dsmGoal?.mensal ?? 0;
  const metaDiaria = dsmGoal?.diaria ?? 0;
  const pctMensal = metaMensal > 0 ? Math.min(100, (totalConversoes / metaMensal) * 100) : 0;
  const pctDiaria = metaDiaria > 0 ? Math.min(100, (conversoesHoje / metaDiaria) * 100) : 0;

  const rankingList = ranking.filter((r) => r.conversoes > 0);

  return (
    <div>
      <div className="mv2-screen-title" style={{ ['--mv2-accent' as string]: ACCENT }}>
        {title.toUpperCase()}
      </div>

      <div className="mv2-metrics-grid">
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: ACCENT }}>
          <div className="mv2-label">Conversões Totais</div>
          <div className="mv2-value">{totalConversoes} conv.</div>
        </div>
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: '#698b46' }}>
          <div className="mv2-label">Dias Restantes</div>
          <div className="mv2-value">{dias} dia(s)</div>
        </div>
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: '#00b6da' }}>
          <div className="mv2-label">Conversões Hoje</div>
          <div className="mv2-value">{conversoesHoje} conv.</div>
        </div>
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: '#5c3795' }}>
          <div className="mv2-label">Colaboradores Ativos Hoje</div>
          <div className="mv2-value">{colaboradoresAtivosHoje}</div>
        </div>
      </div>

      <div style={{ margin: '0 18px 8px', fontSize: 9, fontWeight: 700, color: 'var(--mv2-texto-2)', textTransform: 'uppercase' }}>
        Atingimento de Metas
      </div>
      <div className="mv2-dual-progress">
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8 }}>
          <span>Meta Mensal</span>
          <span>{pctMensal.toFixed(0)}%</span>
        </div>
        <div className="mv2-track mv2-mensal">
          <span style={{ width: `${pctMensal}%` }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, marginTop: 4 }}>
          <span>Meta Diária</span>
          <span>{pctDiaria.toFixed(0)}%</span>
        </div>
        <div className="mv2-track mv2-diaria">
          <span style={{ width: `${pctDiaria}%` }} />
        </div>
      </div>

      <MobileDateFilter />

      <div className="mv2-ranking-list-card">
        {rankingList.length === 0 ? (
          <div style={{ fontSize: 10, color: 'var(--mv2-texto-2)', padding: '8px 0', textAlign: 'center' }}>Nenhuma conversão de DSM registrada neste período.</div>
        ) : (
          rankingList.map((r, i) => (
            <div key={r.matricula} className="mv2-row">
              <span className="mv2-pos" style={{ color: ACCENT }}>
                {i + 1}
              </span>
              {r.foto ? <img src={r.foto} alt="" loading="lazy" className="mv2-avatar" /> : <div className="mv2-avatar" />}
              <span className="mv2-name">{r.apelido || r.nome}</span>
              <span className="mv2-qty">{r.conversoes} conv.</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
