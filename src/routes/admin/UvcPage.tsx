import { useMemo, useState } from 'react';
import { PageLoading } from '../../components/PageLoading';
import { MetricsFilterBar, type MfbStatCard } from '../../components/MetricsFilterBar';
import { PodiumSplit, type PodiumSpots } from '../../components/ranking/PodiumSplit';
import { DateRangeProvider, useDateRange } from '../DateRangeContext';
import { fmtDateBR } from '../../lib/format';
import { addDaysISO, todayISO } from '../../lib/dateRange';
import { computeUvcDailyRows, computeUvcSummary, fmtUvc } from '../../lib/business/uvc';
import { useClientServiceRecords, useCollaborators, useDailyItemsSoldByCollaborator, useStoreSettings } from '../../lib/queries';

const NEON_CYAN = '#00f0ff';
const NEON_GOLD = '#ffb700';
const BORDER = '#212948';

/** Chip liga/desliga pro controle de quais métricas aparecem nas tabelas
 * abaixo — mesma linguagem visual do ToggleButton de MetricsFilterBar
 * (pílula com uma bolinha indicadora), só que local a esta tela porque
 * aquele componente não é exportado. Mesma altura/borda dos botões de
 * visão ao lado (Por colaborador/Por dia) — os 4 dividem uma linha só. */
function MetricToggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="w-full"
      style={{
        background: on ? 'rgba(0,229,255,.12)' : 'transparent',
        border: `1.5px solid ${NEON_CYAN}`,
        color: NEON_CYAN,
        borderRadius: 10,
        padding: '8px 10px',
        fontSize: 11.5,
        fontWeight: 700,
        textTransform: 'uppercase',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      {label}
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: on ? NEON_CYAN : BORDER,
          boxShadow: on ? `0 0 6px ${NEON_CYAN}` : 'none',
          flexShrink: 0,
        }}
      />
    </button>
  );
}

/** Acompanhamento de UVC (Unidades Vendidas por Cliente) = itens vendidos
 * ÷ atendimentos, por colaborador e no total da loja, no período
 * selecionado — mesma lógica de DashboardPage's isUvcMode, reaproveitada
 * via computeUvcSummary (lib/business/uvc.ts) pra nunca divergir entre as
 * duas telas. Itens vendidos vem de `sales_category_totals_daily`
 * (categoria='ALL', migration 0094); atendimentos vem só da importação
 * "Vendas por Clientes" (ImportarPage.tsx), nunca de `sales`.
 *
 * Date-range PRÓPRIO (DateRangeProvider local), igual Classificados —
 * independente do contexto global do Dashboard, padrão em "hoje". O botão
 * "Modo Geral" do MetricsFilterBar abaixo também é local a essa tela: ao
 * selecioná-lo, o UVC geral e de cada colaborador passam a ser a MÉDIA das
 * razões diárias do mês (não a razão do total do mês) — ver
 * computeUvcSummary.
 *
 * "Por colaborador" usa o mesmo PodiumSplit (pódio + lista em pílulas) de
 * toda outra tela de ranking do sistema (DsmPage.tsx, CategoryPage.tsx) —
 * ranqueado por UVC, sem seletor de ordenação próprio (nenhuma outra tela
 * de ranking tem um). "Por dia" (pedido do usuário depois de investigar um
 * caso real onde o UVC saiu sempre perto de 1,0) troca pra um quadro dia a
 * dia da loja inteira (computeUvcDailyRows), em tabela — não existe um
 * padrão de pódio equivalente pra "total por dia" em nenhuma outra tela. Os
 * dois toggles "Itens vendidos"/"Atendimentos" controlam os cards da barra
 * de métricas e as colunas da visão "Por dia"; no pódio, só "Atendimentos"
 * tem efeito (o valor secundário mostrado sob o UVC), já que PodiumSplit só
 * tem um slot de valor secundário.
 *
 * Sem título/descrição própria aqui dentro — "📈 UVC" é mostrado na barra
 * superior via AppShell's PAGE_TITLES (rota /admin/uvc), igual toda outra
 * tela de ranking (Levmel, DSM, etc.) não repete o título dentro do
 * conteúdo. */
export function UvcPage() {
  return (
    <DateRangeProvider initialDay={todayISO()}>
      <UvcInner />
    </DateRangeProvider>
  );
}

function UvcInner() {
  const { dashFrom, dashTo, modoGeral } = useDateRange();
  const [visao, setVisao] = useState<'colaborador' | 'dia'>('colaborador');
  const [mostrarItens, setMostrarItens] = useState(true);
  const [mostrarAtendimentos, setMostrarAtendimentos] = useState(true);
  const { data: collaborators } = useCollaborators();
  const { data: records } = useClientServiceRecords();
  const { data: dailyItens } = useDailyItemsSoldByCollaborator(dashFrom, dashTo);
  const { data: storeSettings } = useStoreSettings();
  // Seta de tendência (dia anterior) — só com um único dia selecionado;
  // `records` (client_service_records) já vem completo (sem filtro de
  // data), mas `dailyItens` é por período, então precisa de uma busca
  // própria e dedicada pro dia anterior (mesmo raciocínio de
  // DashboardPage.tsx's prevDayItensUvc).
  const previousDayISO = dashFrom === dashTo ? addDaysISO(dashFrom, -1) : null;
  const { data: prevDayItens } = useDailyItemsSoldByCollaborator(previousDayISO ?? dashFrom, previousDayISO ?? dashFrom, !!previousDayISO);

  const summary = useMemo(() => {
    if (!collaborators || !records || !dailyItens) return null;
    return computeUvcSummary(dailyItens, records, collaborators, dashFrom, dashTo, modoGeral);
  }, [collaborators, records, dailyItens, dashFrom, dashTo, modoGeral]);

  const dailyRows = useMemo(() => {
    if (!collaborators || !records || !dailyItens) return null;
    return computeUvcDailyRows(dailyItens, records, collaborators, dashFrom, dashTo);
  }, [collaborators, records, dailyItens, dashFrom, dashTo]);

  // Seta de tendência: UVC de cada colaborador no dia de venda anterior.
  const previousValueMap = useMemo(() => {
    if (!previousDayISO || !collaborators || !records) return null;
    const map = new Map<string, number>();
    computeUvcSummary(prevDayItens ?? [], records, collaborators, previousDayISO, previousDayISO, false).rows.forEach((r) => map.set(r.matricula, r.uvc));
    return map;
  }, [previousDayISO, prevDayItens, records, collaborators]);

  if (!summary || !dailyRows || !storeSettings) return <PageLoading />;
  // computeUvcSummary já devolve rows ordenadas por UVC — mesmo critério de
  // ranking que o pódio abaixo usa, igual a toda outra tela de ranking do
  // sistema (DSM, categorias) não ter seletor de ordenação próprio.
  const { rows: sorted, totals } = summary;

  const statCards: MfbStatCard[] = [
    ...(mostrarItens ? [{ label: 'Itens vendidos', value: totals.itens.toLocaleString('pt-BR'), color: NEON_CYAN }] : []),
    ...(mostrarAtendimentos ? [{ label: 'Atendimentos', value: totals.atendimentos.toLocaleString('pt-BR'), color: NEON_CYAN }] : []),
    { label: modoGeral ? 'UVC médio do mês' : 'UVC geral da loja', value: fmtUvc(totals.uvc), color: NEON_GOLD },
  ];

  return (
    <div className="flex flex-col gap-3">
      <MetricsFilterBar statCards={statCards} />

      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={() => setVisao('colaborador')}
          className="w-full"
          style={{
            background: visao === 'colaborador' ? NEON_CYAN : 'transparent',
            color: visao === 'colaborador' ? '#02181c' : NEON_CYAN,
            border: `1.5px solid ${NEON_CYAN}`,
            borderRadius: 10,
            padding: '8px 10px',
            fontSize: 11.5,
            fontWeight: 700,
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Por colaborador
        </button>
        <button
          onClick={() => setVisao('dia')}
          className="w-full"
          style={{
            background: visao === 'dia' ? NEON_CYAN : 'transparent',
            color: visao === 'dia' ? '#02181c' : NEON_CYAN,
            border: `1.5px solid ${NEON_CYAN}`,
            borderRadius: 10,
            padding: '8px 10px',
            fontSize: 11.5,
            fontWeight: 700,
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Por dia
        </button>
        <MetricToggle on={mostrarItens} onClick={() => setMostrarItens((v) => !v)} label="Itens vendidos" />
        <MetricToggle on={mostrarAtendimentos} onClick={() => setMostrarAtendimentos((v) => !v)} label="Atendimentos" />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        {visao === 'colaborador' ? (
          <>
            <p className="text-xs text-slate-500 mb-3">
              Ranking de UVC por colaborador no período — mesmo pódio das demais categorias.
            </p>
            {sorted.length === 0 ? (
              <div className="text-sm text-slate-500 py-4 text-center">
                Nenhum item vendido nem atendimento importado para este período.
              </div>
            ) : (
              // PodiumSplit só tem UM slot de valor secundário (ver sua própria
              // doc) — por isso o toggle "Atendimentos" controla esse slot no
              // pódio, mas "Itens vendidos" não tem onde entrar aqui; os dois
              // continuam valendo nos cards acima e na visão "Por dia" abaixo.
              <PodiumSplit
                ranking={sorted}
                getValue={(r) => r.uvc}
                formatValue={fmtUvc}
                bgUrl={storeSettings.ranking_podium_bg_url}
                spots={storeSettings.ranking_podium_spots as unknown as PodiumSpots | null}
                getSecondaryValue={mostrarAtendimentos ? (r) => r.atendimentos : undefined}
                formatSecondaryValue={mostrarAtendimentos ? (v) => `${v.toLocaleString('pt-BR')} atend.` : undefined}
                getPreviousValue={previousValueMap ? (r) => previousValueMap.get(r.matricula) ?? 0 : undefined}
              />
            )}
          </>
        ) : (
          <>
            <div className="text-xs text-slate-500 mb-3">
              {dailyRows.length} dia(s) com movimento no período — total da loja inteira, não por colaborador
            </div>
            {dailyRows.length === 0 ? (
              <div className="text-sm text-slate-500 py-4 text-center">
                Nenhum item vendido nem atendimento importado para este período.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-800">
                      <th className="py-1.5 pr-3">Dia</th>
                      {mostrarItens && <th className="py-1.5 pr-3 text-right">Itens vendidos</th>}
                      {mostrarAtendimentos && <th className="py-1.5 pr-3 text-right">Atendimentos</th>}
                      <th className="py-1.5 pr-3 text-right">UVC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyRows.map((d) => (
                      <tr key={d.dataISO} className="border-b border-slate-900">
                        <td className="py-1.5 pr-3 font-mono">{fmtDateBR(d.dataISO)}</td>
                        {mostrarItens && <td className="py-1.5 pr-3 font-mono text-right">{d.itens.toLocaleString('pt-BR')}</td>}
                        {mostrarAtendimentos && (
                          <td className="py-1.5 pr-3 font-mono text-right">{d.atendimentos.toLocaleString('pt-BR')}</td>
                        )}
                        <td className="py-1.5 pr-3 font-mono text-right" style={{ color: NEON_GOLD }}>
                          {fmtUvc(d.uvc)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-700 font-semibold">
                      <td className="py-1.5 pr-3">Total do período</td>
                      {mostrarItens && <td className="py-1.5 pr-3 font-mono text-right">{totals.itens.toLocaleString('pt-BR')}</td>}
                      {mostrarAtendimentos && (
                        <td className="py-1.5 pr-3 font-mono text-right">{totals.atendimentos.toLocaleString('pt-BR')}</td>
                      )}
                      <td className="py-1.5 pr-3 font-mono text-right" style={{ color: NEON_GOLD }}>
                        {fmtUvc(totals.uvc)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
