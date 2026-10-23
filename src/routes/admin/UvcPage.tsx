import { useMemo, useState } from 'react';
import { PageLoading } from '../../components/PageLoading';
import { HelpTip } from '../../components/HelpTip';
import { MetricsFilterBar, type MfbStatCard } from '../../components/MetricsFilterBar';
import { DateRangeProvider, useDateRange } from '../DateRangeContext';
import { fmtDateBR } from '../../lib/format';
import { todayISO } from '../../lib/dateRange';
import { computeUvcDailyRows, computeUvcSummary, fmtUvc } from '../../lib/business/uvc';
import { useClientServiceRecords, useCollaborators, useDailyItemsSoldByCollaborator } from '../../lib/queries';

const NEON_CYAN = '#00f0ff';
const NEON_GOLD = '#ffb700';
const BORDER = '#212948';

/** Chip liga/desliga pro controle de quais métricas aparecem nas tabelas
 * abaixo — mesma linguagem visual do ToggleButton de MetricsFilterBar
 * (pílula com uma bolinha indicadora), só que local a esta tela porque
 * aquele componente não é exportado. */
function MetricToggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="w-full"
      style={{
        background: on ? 'rgba(0,229,255,.12)' : 'transparent',
        border: `1.5px solid ${NEON_CYAN}`,
        color: NEON_CYAN,
        borderRadius: 20,
        padding: '6px 10px',
        fontSize: 11,
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
 * Duas camadas de controle, pedidas pelo usuário depois de investigar um
 * caso real onde o UVC saiu sempre perto de 1,0: "Por colaborador"/"Por
 * dia" troca a tabela entre o resumo por vendedor (como já existia) e um
 * quadro dia a dia da loja inteira (computeUvcDailyRows) — útil pra achar
 * exatamente em que dia um número parece errado. Os dois toggles "Itens
 * vendidos"/"Atendimentos" só escondem/mostram essas colunas (e os cards
 * correspondentes) em qualquer uma das duas visões — o UVC em si nunca
 * some; com os dois desligados, sobra só ele. */
export function UvcPage() {
  return (
    <DateRangeProvider initialDay={todayISO()}>
      <UvcInner />
    </DateRangeProvider>
  );
}

function UvcInner() {
  const { dashFrom, dashTo, modoGeral } = useDateRange();
  const [ordem, setOrdem] = useState<'uvc' | 'atendimentos' | 'alfabetica'>('uvc');
  const [visao, setVisao] = useState<'colaborador' | 'dia'>('colaborador');
  const [mostrarItens, setMostrarItens] = useState(true);
  const [mostrarAtendimentos, setMostrarAtendimentos] = useState(true);
  const { data: collaborators } = useCollaborators();
  const { data: records } = useClientServiceRecords();
  const { data: dailyItens } = useDailyItemsSoldByCollaborator(dashFrom, dashTo);

  const summary = useMemo(() => {
    if (!collaborators || !records || !dailyItens) return null;
    return computeUvcSummary(dailyItens, records, collaborators, dashFrom, dashTo, modoGeral);
  }, [collaborators, records, dailyItens, dashFrom, dashTo, modoGeral]);

  const dailyRows = useMemo(() => {
    if (!collaborators || !records || !dailyItens) return null;
    return computeUvcDailyRows(dailyItens, records, collaborators, dashFrom, dashTo);
  }, [collaborators, records, dailyItens, dashFrom, dashTo]);

  if (!summary || !dailyRows) return <PageLoading />;
  const { rows, totals } = summary;

  const sorted = rows.slice().sort((a, b) => {
    if (ordem === 'alfabetica') return a.nome.localeCompare(b.nome, 'pt-BR');
    if (ordem === 'atendimentos') return b.atendimentos - a.atendimentos;
    return b.uvc - a.uvc;
  });

  const statCards: MfbStatCard[] = [
    ...(mostrarItens ? [{ label: 'Itens vendidos', value: totals.itens.toLocaleString('pt-BR'), color: NEON_CYAN }] : []),
    ...(mostrarAtendimentos ? [{ label: 'Atendimentos', value: totals.atendimentos.toLocaleString('pt-BR'), color: NEON_CYAN }] : []),
    { label: modoGeral ? 'UVC médio do mês' : 'UVC geral da loja', value: fmtUvc(totals.uvc), color: NEON_GOLD },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-semibold text-sm">📈 Acompanhamento de UVC</h3>
          <HelpTip
            helpKey="uvc.intro"
            fallback="UVC (Unidades Vendidas por Cliente) = itens vendidos ÷ clientes atendidos. Itens vendidos já vem das vendas importadas; atendimentos vem só da planilha 'Vendas por Clientes' (ADM → Importar). No Modo Geral, o UVC é a média das razões diárias do mês — evita distorção quando a importação de atendimentos não cobre todo dia. Use 'Por dia' pra conferir, dia a dia, se os dois números batem com o esperado."
          />
        </div>
        <p className="text-xs text-slate-500">
          Quanto maior o UVC, mais itens em média cada cliente levou. Colaborador ou dia sem atendimentos importados
          mostra “—”, não 0 nem erro.
        </p>
      </div>

      <MetricsFilterBar statCards={statCards} />

      <div className="grid grid-cols-2 gap-2">
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
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricToggle on={mostrarItens} onClick={() => setMostrarItens((v) => !v)} label="Itens vendidos" />
        <MetricToggle on={mostrarAtendimentos} onClick={() => setMostrarAtendimentos((v) => !v)} label="Atendimentos" />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        {visao === 'colaborador' ? (
          <>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="text-xs text-slate-500">{sorted.length} colaborador(es) com movimento no período</div>
              <select value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)} className="input" title="Ordenar por">
                <option value="uvc">Maior UVC</option>
                <option value="atendimentos">Mais atendimentos</option>
                <option value="alfabetica">A-Z</option>
              </select>
            </div>
            {sorted.length === 0 ? (
              <div className="text-sm text-slate-500 py-4 text-center">
                Nenhum item vendido nem atendimento importado para este período.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-800">
                      <th className="py-1.5 pr-3">Colaborador</th>
                      {mostrarItens && <th className="py-1.5 pr-3 text-right">Itens vendidos</th>}
                      {mostrarAtendimentos && <th className="py-1.5 pr-3 text-right">Atendimentos</th>}
                      <th className="py-1.5 pr-3 text-right">UVC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r) => (
                      <tr key={r.matricula} className="border-b border-slate-900">
                        <td className="py-1.5 pr-3">{r.apelido || r.nome}</td>
                        {mostrarItens && <td className="py-1.5 pr-3 font-mono text-right">{r.itens.toLocaleString('pt-BR')}</td>}
                        {mostrarAtendimentos && (
                          <td className="py-1.5 pr-3 font-mono text-right">{r.atendimentos.toLocaleString('pt-BR')}</td>
                        )}
                        <td className="py-1.5 pr-3 font-mono text-right" style={{ color: NEON_GOLD }}>
                          {fmtUvc(r.uvc)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-700 font-semibold">
                      <td className="py-1.5 pr-3">Total da loja</td>
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
