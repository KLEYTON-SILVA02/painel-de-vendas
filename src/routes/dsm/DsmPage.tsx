import { useEffect, useMemo } from 'react';
import { PageLoading } from '../../components/PageLoading';
import { MetricsFilterBar, type MfbStatCard } from '../../components/MetricsFilterBar';
import { PodiumSplit, type PodiumSpots } from '../../components/ranking/PodiumSplit';
import { computeDsmSummary } from '../../lib/business/dsm';
import { diasRestantesNoMes } from '../../lib/business/goals';
import { useCollaborators, useDsmRecords, useStoreSettings } from '../../lib/queries';
import { useDateRange } from '../DateRangeContext';

/** DSM Fase 4: tela própria, no menu lateral (mesmo padrão de rota dedicada
 * de BIOSINTÉTICA, ver BioPage.tsx) — ranking de conversões do cupom DSM
 * (Desconto Só Meu) por colaborador, calculado sobre dsm_records (não
 * sales). O "ocultar" vive em ADM → Nomes das Categorias (toggle sobre
 * category_types.ativo), não aqui — ver NomesCategoriasPage.tsx. */
export function DsmPage() {
  const { data: collaborators } = useCollaborators();
  const { data: dsmRecords } = useDsmRecords();
  const { data: storeSettings } = useStoreSettings();
  const { dashFrom, dashTo, setModoGeral } = useDateRange();

  // Mesma decisão de BIOSINTÉTICA: abre sempre em Modo Geral (mês inteiro),
  // livre para o ADM trocar para um dia específico depois.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setModoGeral(), []);

  const collaboratorsData = collaborators ?? [];
  const recordsData = dsmRecords ?? [];

  const ranking = useMemo(
    () => computeDsmSummary(recordsData, collaboratorsData, dashFrom, dashTo),
    [recordsData, collaboratorsData, dashFrom, dashTo],
  );

  if (!collaborators || !dsmRecords || !storeSettings) {
    return <PageLoading />;
  }

  const totalConversoes = ranking.reduce((a, r) => a + r.conversoes, 0);
  const colaboradoresParticipantes = ranking.length;
  const dias = diasRestantesNoMes();

  const statCards: MfbStatCard[] = [
    { label: 'Dias restantes do mês', value: `${dias} dia(s)`, color: '#14ff00' },
    { label: 'Conversões DSM', value: String(totalConversoes), color: '#ffb700' },
    { label: 'Colaboradores participantes', value: String(colaboradoresParticipantes), color: '#ff3df0' },
  ];

  return (
    <div className="flex flex-col gap-1.5">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <MetricsFilterBar statCards={statCards} />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="text-xs text-slate-500 mb-3">
          Ranking de conversões do cupom DSM — cada cliente convertido por um colaborador conta um ponto. Importe novos dados em
          Importar Vendas.
        </p>
        {ranking.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">Nenhuma conversão de DSM registrada neste período.</div>
        ) : (
          <PodiumSplit
            ranking={ranking}
            getValue={(r) => r.conversoes}
            formatValue={(v) => `${v} conv.`}
            bgUrl={storeSettings.ranking_podium_bg_url}
            spots={storeSettings.ranking_podium_spots as unknown as PodiumSpots | null}
          />
        )}
      </div>
    </div>
  );
}
