import { useMemo, useState } from 'react';
import { fmtMoney } from '../../lib/format';
import { useSalesArchiveCategories, useSalesArchiveCollaborators } from '../../lib/queries';

const CATEGORIA_LABEL: Record<string, string> = {
  DERM: 'Dermocosméticos',
  GEN: 'Genéricos/Similares',
  MP: 'Marcas Exclusivas',
  MER: 'Mercadoria Geral',
  LEVMEL: 'Levmel',
  CHIP: 'Chip',
  G1: 'Biosintética — Grupo 1',
  G2: 'Biosintética — Grupo 2',
  G3: 'Biosintética — Grupo 3',
  G4: 'Biosintética — Grupo 4',
};

function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-');
  const date = new Date(Number(y), Number(m) - 1, 1);
  const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function VendasArquivadasPage() {
  const { data: categorias } = useSalesArchiveCategories();
  const { data: colaboradores } = useSalesArchiveCollaborators();
  const months = useMemo(() => {
    const set = new Set<string>();
    (categorias ?? []).forEach((c) => set.add(c.year_month));
    (colaboradores ?? []).forEach((c) => set.add(c.year_month));
    return Array.from(set).sort().reverse();
  }, [categorias, colaboradores]);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const month = selectedMonth && months.includes(selectedMonth) ? selectedMonth : months[0] ?? null;

  if (!categorias || !colaboradores) {
    return <div className="text-sm text-slate-500 p-6">Carregando…</div>;
  }

  if (!months.length) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-1 text-sm">Vendas Arquivadas</h3>
        <p className="text-xs text-slate-500">
          Nenhum mês foi arquivado ainda. Vendas com mais de 3 meses são resumidas automaticamente (só totais por
          categoria e por colaborador ficam guardados) e as linhas originais são removidas — as metas do período
          continuam disponíveis normalmente em Metas.
        </p>
      </div>
    );
  }

  const catRows = categorias.filter((c) => c.year_month === month).sort((a, b) => b.valor_total - a.valor_total);
  const colabRows = colaboradores.filter((c) => c.year_month === month).sort((a, b) => b.valor_total - a.valor_total);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-1 text-sm">Vendas Arquivadas</h3>
        <p className="text-xs text-slate-500 mb-3">
          Vendas com mais de 3 meses são arquivadas automaticamente: as linhas originais são removidas e só ficam
          guardados os totais por categoria e por colaborador do mês. As metas do período continuam disponíveis
          normalmente em Metas.
        </p>
        <div className="flex flex-wrap gap-2">
          {months.map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMonth(m)}
              className={`rounded-full px-3 py-1.5 text-xs border ${
                m === month ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-slate-700 text-slate-400'
              }`}
            >
              {monthLabel(m)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h4 className="text-sm font-semibold mb-3">Totais por categoria — {month ? monthLabel(month) : ''}</h4>
          {catRows.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhum total de categoria arquivado neste mês.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-800">
                    <th className="py-1.5 pr-3">Categoria</th>
                    <th className="py-1.5 pr-3 text-right">Vendas</th>
                    <th className="py-1.5 pr-3 text-right">Itens</th>
                    <th className="py-1.5 pr-3 text-right">Valor total</th>
                  </tr>
                </thead>
                <tbody>
                  {catRows.map((c) => (
                    <tr key={c.id} className="border-b border-slate-900">
                      <td className="py-1.5 pr-3">{CATEGORIA_LABEL[c.categoria] ?? c.categoria}</td>
                      <td className="py-1.5 pr-3 text-right">{c.vendas_total}</td>
                      <td className="py-1.5 pr-3 text-right">{c.itens_total}</td>
                      <td className="py-1.5 pr-3 text-right whitespace-nowrap">{fmtMoney(c.valor_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h4 className="text-sm font-semibold mb-3">Totais por colaborador — {month ? monthLabel(month) : ''}</h4>
          {colabRows.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhum total de colaborador arquivado neste mês.</p>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="text-left text-slate-400 border-b border-slate-800">
                    <th className="py-1.5 pr-3">Colaborador</th>
                    <th className="py-1.5 pr-3 text-right">Itens</th>
                    <th className="py-1.5 pr-3 text-right">Valor total</th>
                  </tr>
                </thead>
                <tbody>
                  {colabRows.map((c) => (
                    <tr key={c.id} className="border-b border-slate-900">
                      <td className="py-1.5 pr-3">{c.nome || c.matricula}</td>
                      <td className="py-1.5 pr-3 text-right">{c.itens_total}</td>
                      <td className="py-1.5 pr-3 text-right whitespace-nowrap">{fmtMoney(c.valor_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
