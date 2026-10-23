import { useMemo, useState } from 'react';
import { PageLoading } from '../../components/PageLoading';
import { HelpTip } from '../../components/HelpTip';
import { MetricsFilterBar, type MfbStatCard } from '../../components/MetricsFilterBar';
import { DateRangeProvider, useDateRange } from '../DateRangeContext';
import { todayISO } from '../../lib/dateRange';
import { fmtUvc } from '../../lib/business/uvc';
import { normalizeMatricula } from '../../lib/business/parsing';
import { useClientServiceRecords, useCollaborators, useDailyItemsSoldByCollaborator } from '../../lib/queries';

const NEON_CYAN = '#00f0ff';
const NEON_GOLD = '#ffb700';

interface UvcRow {
  id: string;
  nome: string;
  itens: number;
  atendimentos: number;
  uvc: number | null;
}

/** Acompanhamento de UVC (Unidades Vendidas por Cliente) = itens vendidos
 * ÷ atendimentos, por colaborador e no total da loja, no período
 * selecionado. Itens vendidos já existe no sistema (soma de sales.qtd,
 * agregada no banco via a RPC daily_items_sold_by_collaborator — migration
 * 0103); atendimentos vem só da importação "Vendas por Clientes"
 * (ImportarPage.tsx), nunca de `sales`.
 *
 * Date-range PRÓPRIO (DateRangeProvider local), igual Classificados —
 * independente do contexto global do Dashboard, padrão em "hoje". */
export function UvcPage() {
  return (
    <DateRangeProvider initialDay={todayISO()}>
      <UvcInner />
    </DateRangeProvider>
  );
}

function UvcInner() {
  const { dashFrom, dashTo } = useDateRange();
  const [ordem, setOrdem] = useState<'uvc' | 'atendimentos' | 'alfabetica'>('uvc');
  const { data: collaborators } = useCollaborators();
  const { data: records } = useClientServiceRecords();
  const { data: itemsSold } = useDailyItemsSoldByCollaborator(dashFrom, dashTo);

  const rows = useMemo<UvcRow[] | null>(() => {
    if (!collaborators || !records || !itemsSold) return null;
    const collaboratorByMatricula = new Map(collaborators.map((c) => [normalizeMatricula(c.matricula), c]));
    const collaboratorsById = new Map(collaborators.map((c) => [c.id, c]));

    const itensByCollaborator = new Map<string, number>();
    itemsSold.forEach((r) => {
      const collab = collaboratorByMatricula.get(normalizeMatricula(r.matricula ?? ''));
      if (!collab) return;
      itensByCollaborator.set(collab.id, (itensByCollaborator.get(collab.id) ?? 0) + (Number(r.total_qtd) || 0));
    });

    const atendimentosByCollaborator = new Map<string, number>();
    records.forEach((r) => {
      if (r.dataISO < dashFrom || r.dataISO > dashTo) return;
      if (!collaboratorsById.has(r.collaboratorId)) return;
      atendimentosByCollaborator.set(r.collaboratorId, (atendimentosByCollaborator.get(r.collaboratorId) ?? 0) + r.atendimentos);
    });

    const ids = new Set<string>([...itensByCollaborator.keys(), ...atendimentosByCollaborator.keys()]);
    return Array.from(ids).map((id) => {
      const collab = collaboratorsById.get(id);
      const itens = itensByCollaborator.get(id) ?? 0;
      const atendimentos = atendimentosByCollaborator.get(id) ?? 0;
      return {
        id,
        nome: collab?.apelido || collab?.nome || '—',
        itens,
        atendimentos,
        uvc: atendimentos > 0 ? itens / atendimentos : null,
      };
    });
  }, [collaborators, records, itemsSold, dashFrom, dashTo]);

  if (!rows) return <PageLoading />;

  const sorted = rows.slice().sort((a, b) => {
    if (ordem === 'alfabetica') return a.nome.localeCompare(b.nome, 'pt-BR');
    if (ordem === 'atendimentos') return b.atendimentos - a.atendimentos;
    return (b.uvc ?? -1) - (a.uvc ?? -1);
  });

  const totalItens = rows.reduce((s, r) => s + r.itens, 0);
  const totalAtendimentos = rows.reduce((s, r) => s + r.atendimentos, 0);
  const uvcGeral = totalAtendimentos > 0 ? totalItens / totalAtendimentos : null;

  const statCards: MfbStatCard[] = [
    { label: 'Itens vendidos', value: totalItens.toLocaleString('pt-BR'), color: NEON_CYAN },
    { label: 'Atendimentos', value: totalAtendimentos.toLocaleString('pt-BR'), color: NEON_CYAN },
    { label: 'UVC geral da loja', value: fmtUvc(uvcGeral), color: NEON_GOLD },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-semibold text-sm">📈 Acompanhamento de UVC</h3>
          <HelpTip
            helpKey="uvc.intro"
            fallback="UVC (Unidades Vendidas por Cliente) = itens vendidos ÷ clientes atendidos. Itens vendidos já vem das vendas importadas; atendimentos vem só da planilha 'Vendas por Clientes' (ADM → Importar)."
          />
        </div>
        <p className="text-xs text-slate-500">
          Quanto maior o UVC, mais itens em média cada cliente levou. Colaborador sem atendimentos importados no
          período mostra “—”, não 0 nem erro.
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
            Nenhum item vendido nem atendimento importado para este período.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-800">
                  <th className="py-1.5 pr-3">Colaborador</th>
                  <th className="py-1.5 pr-3 text-right">Itens vendidos</th>
                  <th className="py-1.5 pr-3 text-right">Atendimentos</th>
                  <th className="py-1.5 pr-3 text-right">UVC</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id} className="border-b border-slate-900">
                    <td className="py-1.5 pr-3">{r.nome}</td>
                    <td className="py-1.5 pr-3 font-mono text-right">{r.itens.toLocaleString('pt-BR')}</td>
                    <td className="py-1.5 pr-3 font-mono text-right">{r.atendimentos.toLocaleString('pt-BR')}</td>
                    <td className="py-1.5 pr-3 font-mono text-right" style={{ color: r.uvc !== null ? NEON_GOLD : undefined }}>
                      {fmtUvc(r.uvc)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-700 font-semibold">
                  <td className="py-1.5 pr-3">Total da loja</td>
                  <td className="py-1.5 pr-3 font-mono text-right">{totalItens.toLocaleString('pt-BR')}</td>
                  <td className="py-1.5 pr-3 font-mono text-right">{totalAtendimentos.toLocaleString('pt-BR')}</td>
                  <td className="py-1.5 pr-3 font-mono text-right" style={{ color: NEON_GOLD }}>
                    {fmtUvc(uvcGeral)}
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
