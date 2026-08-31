import { useMemo, useState } from 'react';
import type { Collaborator, Sale } from '../../lib/business/types';
import { fmtDateBR, fmtMoney, monthName } from '../../lib/format';
import { useCollaborators, useSales } from '../../lib/queries';

const TIPO_LABEL: Record<string, string> = {
  DERM: 'Dermocosméticos',
  GEN: 'Genérico',
  MP: 'Marcas Exclusivas',
  MER: 'Mercadoria Geral',
};

const PAGE_SIZE = 500;

interface DayGroup {
  dayISO: string;
  sales: Sale[];
  valor: number;
  itens: number;
}
interface MonthGroup {
  monthKey: string; // "YYYY-MM"
  label: string;
  valor: number;
  itens: number;
  count: number;
  days: DayGroup[];
}

function vendedorNome(s: Sale, byMatricula: Map<string, Collaborator>): string {
  const c = byMatricula.get(s.matricula);
  if (c) return c.apelido || c.nome;
  return s.vendedor || s.matricula;
}

function groupByMonthAndDay(sales: Sale[]): MonthGroup[] {
  const months = new Map<string, MonthGroup>();
  sales.forEach((s) => {
    if (!s.dataISO) return;
    const monthKey = s.dataISO.slice(0, 7);
    if (!months.has(monthKey)) {
      const [y, m] = monthKey.split('-');
      months.set(monthKey, { monthKey, label: `${monthName(Number(m) - 1)}/${y}`, valor: 0, itens: 0, count: 0, days: [] });
    }
    const month = months.get(monthKey)!;
    let day = month.days.find((d) => d.dayISO === s.dataISO);
    if (!day) {
      day = { dayISO: s.dataISO, sales: [], valor: 0, itens: 0 };
      month.days.push(day);
    }
    day.sales.push(s);
    day.valor += s.valor;
    day.itens += s.qtd;
    month.valor += s.valor;
    month.itens += s.qtd;
    month.count += 1;
  });
  const result = Array.from(months.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  result.forEach((month) => {
    month.days.sort((a, b) => b.dayISO.localeCompare(a.dayISO));
    month.days.forEach((d) => d.sales.sort((a, b) => (a.produto || '').localeCompare(b.produto || '')));
  });
  return result;
}

export function ListaVendasPage() {
  const { data: sales } = useSales();
  const { data: collaborators } = useCollaborators();
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());
  const [dayPage, setDayPage] = useState<Record<string, number>>({});

  const byMatricula = useMemo(() => {
    const map = new Map<string, Collaborator>();
    (collaborators ?? []).forEach((c) => map.set(c.matricula, c));
    return map;
  }, [collaborators]);

  const months = useMemo(() => groupByMonthAndDay(sales ?? []), [sales]);

  if (!sales || !collaborators) {
    return <div className="text-sm text-slate-500 p-6">Carregando…</div>;
  }

  function toggleMonth(key: string) {
    setOpenMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function toggleDay(key: string) {
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-cyan-400 font-semibold text-sm mb-1">📋 Lista de Vendas</h3>
        <p className="text-xs text-slate-500">
          Todas as vendas importadas por planilha, separadas por mês e por dia. {sales.length.toLocaleString('pt-BR')} registro(s) no total.
        </p>
      </div>

      {months.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center text-sm text-slate-500">
          Nenhuma venda importada ainda.
        </div>
      ) : (
        months.map((month) => {
          const monthOpen = openMonths.has(month.monthKey);
          return (
            <div key={month.monthKey} className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
              <button
                onClick={() => toggleMonth(month.monthKey)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-800/40"
              >
                <div className="flex items-center gap-3">
                  <span className="text-cyan-400 font-semibold text-sm">{month.label}</span>
                  <span className="text-xs text-slate-500">{month.count.toLocaleString('pt-BR')} registro(s)</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-400 font-mono">
                    {month.itens.toLocaleString('pt-BR')} un. · {fmtMoney(month.valor)}
                  </span>
                  <span className="text-slate-500">{monthOpen ? '▲' : '▼'}</span>
                </div>
              </button>

              {monthOpen && (
                <div className="border-t border-slate-800 flex flex-col">
                  {month.days.map((day) => {
                    const dayKey = day.dayISO;
                    const dayOpen = openDays.has(dayKey);
                    const page = dayPage[dayKey] ?? 0;
                    const totalPages = Math.ceil(day.sales.length / PAGE_SIZE);
                    const pageRows = day.sales.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
                    return (
                      <div key={dayKey} className="border-b border-slate-800/60 last:border-b-0">
                        <button
                          onClick={() => toggleDay(dayKey)}
                          className="w-full flex items-center justify-between px-4 py-2.5 pl-8 text-left hover:bg-slate-800/30"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium">{fmtDateBR(day.dayISO)}</span>
                            <span className="text-xs text-slate-500">{day.sales.length.toLocaleString('pt-BR')} registro(s)</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-xs text-slate-400 font-mono">
                              {day.itens.toLocaleString('pt-BR')} un. · {fmtMoney(day.valor)}
                            </span>
                            <span className="text-slate-500 text-xs">{dayOpen ? '▲' : '▼'}</span>
                          </div>
                        </button>

                        {dayOpen && (
                          <div className="px-4 pb-3 pl-8">
                            <div className="overflow-x-auto rounded-lg border border-slate-800">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left text-slate-400 border-b border-slate-800 bg-slate-950/60">
                                    <th className="py-1.5 px-2">Data</th>
                                    <th className="py-1.5 px-2">Nome do Vendedor</th>
                                    <th className="py-1.5 px-2">Qtd. Itens Vendidos</th>
                                    <th className="py-1.5 px-2">Valor do Produto</th>
                                    <th className="py-1.5 px-2">Tipo</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pageRows.map((s) => (
                                    <tr key={s.id} className="border-b border-slate-900">
                                      <td className="py-1.5 px-2 font-mono">{fmtDateBR(s.dataISO)}</td>
                                      <td className="py-1.5 px-2">{vendedorNome(s, byMatricula)}</td>
                                      <td className="py-1.5 px-2 font-mono">{s.qtd}</td>
                                      <td className="py-1.5 px-2 font-mono text-amber-400">{fmtMoney(s.valor)}</td>
                                      <td className="py-1.5 px-2">{s.grupo ? TIPO_LABEL[s.grupo] ?? s.grupo : 'Não classificado'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {totalPages > 1 && (
                              <div className="flex items-center justify-center gap-2 mt-2">
                                <button
                                  disabled={page === 0}
                                  onClick={() => setDayPage((p) => ({ ...p, [dayKey]: Math.max(0, page - 1) }))}
                                  className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 disabled:opacity-40"
                                >
                                  ← Anterior
                                </button>
                                <span className="text-xs text-slate-500">
                                  Página {page + 1} de {totalPages}
                                </span>
                                <button
                                  disabled={page >= totalPages - 1}
                                  onClick={() => setDayPage((p) => ({ ...p, [dayKey]: Math.min(totalPages - 1, page + 1) }))}
                                  className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 disabled:opacity-40"
                                >
                                  Próxima →
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
