import { useMemo, useState } from 'react';
import { PageLoading } from '../../components/PageLoading';
import { HelpTip } from '../../components/HelpTip';
import { MetricsFilterBar, type MfbStatCard } from '../../components/MetricsFilterBar';
import { DateRangeProvider, useDateRange } from '../DateRangeContext';
import { todayISO } from '../../lib/dateRange';
import { computeUvcSummary, fmtUvc } from '../../lib/business/uvc';
import { useClientServiceRecords, useCollaborators, useDailySalesValorByCollaborator } from '../../lib/queries';

const NEON_CYAN = '#00f0ff';
const NEON_GOLD = '#ffb700';

/** Acompanhamento de UVC (Unidades Vendidas por Cliente) = valor vendido
 * (R$) ÷ atendimentos, por colaborador e no total da loja, no período
 * selecionado — mesma lógica de DashboardPage's isUvcMode, reaproveitada
 * via computeUvcSummary (lib/business/uvc.ts) pra nunca divergir entre as
 * duas telas. Valor vendido vem de `sales_category_totals_daily`
 * (categoria='ALL', migration 0094); atendimentos vem só da importação
 * "Vendas por Clientes" (ImportarPage.tsx), nunca de `sales`.
 *
 * Date-range PRÓPRIO (DateRangeProvider local), igual Classificados —
 * independente do contexto global do Dashboard, padrão em "hoje". O botão
 * "Modo Geral" do MetricsFilterBar abaixo também é local a essa tela: ao
 * selecioná-lo, o UVC geral e de cada colaborador passam a ser a MÉDIA das
 * razões diárias do mês (não a razão do total do mês) — ver
 * computeUvcSummary. */
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
  const { data: collaborators } = useCollaborators();
  const { data: records } = useClientServiceRecords();
  const { data: dailyValor } = useDailySalesValorByCollaborator(dashFrom, dashTo);

  const summary = useMemo(() => {
    if (!collaborators || !records || !dailyValor) return null;
    return computeUvcSummary(dailyValor, records, collaborators, dashFrom, dashTo, modoGeral);
  }, [collaborators, records, dailyValor, dashFrom, dashTo, modoGeral]);

  if (!summary) return <PageLoading />;
  const { rows, totals } = summary;

  const sorted = rows.slice().sort((a, b) => {
    if (ordem === 'alfabetica') return a.nome.localeCompare(b.nome, 'pt-BR');
    if (ordem === 'atendimentos') return b.atendimentos - a.atendimentos;
    return b.uvc - a.uvc;
  });

  const statCards: MfbStatCard[] = [
    { label: 'Valor vendido', value: fmtUvc(totals.valor), color: NEON_CYAN },
    { label: 'Atendimentos', value: totals.atendimentos.toLocaleString('pt-BR'), color: NEON_CYAN },
    { label: modoGeral ? 'UVC médio do mês' : 'UVC geral da loja', value: fmtUvc(totals.uvc), color: NEON_GOLD },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-semibold text-sm">📈 Acompanhamento de UVC</h3>
          <HelpTip
            helpKey="uvc.intro"
            fallback="UVC (Unidades Vendidas por Cliente) = valor vendido (R$) ÷ clientes atendidos. Valor vendido já vem das vendas importadas; atendimentos vem só da planilha 'Vendas por Clientes' (ADM → Importar). No Modo Geral, o UVC é a média das razões diárias do mês — evita distorção quando a importação de atendimentos não cobre todo dia."
          />
        </div>
        <p className="text-xs text-slate-500">
          Quanto maior o UVC, mais cada cliente gastou em média. Colaborador sem atendimentos importados no período
          mostra “—”, não R$ 0,00 nem erro.
        </p>
      </div>

      <MetricsFilterBar statCards={statCards} />

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
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
            Nenhuma venda nem atendimento importado para este período.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-800">
                  <th className="py-1.5 pr-3">Colaborador</th>
                  <th className="py-1.5 pr-3 text-right">Valor vendido</th>
                  <th className="py-1.5 pr-3 text-right">Atendimentos</th>
                  <th className="py-1.5 pr-3 text-right">UVC</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.matricula} className="border-b border-slate-900">
                    <td className="py-1.5 pr-3">{r.apelido || r.nome}</td>
                    <td className="py-1.5 pr-3 font-mono text-right">{fmtUvc(r.valor)}</td>
                    <td className="py-1.5 pr-3 font-mono text-right">{r.atendimentos.toLocaleString('pt-BR')}</td>
                    <td className="py-1.5 pr-3 font-mono text-right" style={{ color: NEON_GOLD }}>
                      {fmtUvc(r.uvc)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-700 font-semibold">
                  <td className="py-1.5 pr-3">Total da loja</td>
                  <td className="py-1.5 pr-3 font-mono text-right">{fmtUvc(totals.valor)}</td>
                  <td className="py-1.5 pr-3 font-mono text-right">{totals.atendimentos.toLocaleString('pt-BR')}</td>
                  <td className="py-1.5 pr-3 font-mono text-right" style={{ color: NEON_GOLD }}>
                    {fmtUvc(totals.uvc)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
