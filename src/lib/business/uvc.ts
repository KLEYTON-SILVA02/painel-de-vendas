// UVC (Unidades Vendidas por Cliente) no Dashboard — ranking próprio, igual
// DSM (dsm.ts), mas calculado como uma RAZÃO (itens vendidos ÷ atendimentos),
// não uma soma. Por isso o "total da loja" nunca pode ser derivado somando
// o UVC de cada colaborador (isso não tem significado nenhum) — é sempre
// calculado à parte (`totals` abaixo), de duas formas possíveis conforme o
// filtro de data ativo:
//
// - Fora do Modo Geral (um dia ou uma Busca período): razão dos totais do
//   período (soma de itens ÷ soma de atendimentos) — matematicamente igual
//   a agregar dia a dia, já que o período é o que o usuário escolheu.
// - Modo Geral (mês inteiro): MÉDIA das razões diárias (itens do dia ÷
//   atendimentos do dia, só nos dias em que houve atendimento importado),
//   em vez da razão dos totais do mês inteiro. Decisão explícita do
//   usuário: se a planilha de "Vendas por Clientes" não é importada TODO
//   dia do mês (comum — nem toda loja importa atendimentos diariamente),
//   itens acumula o mês inteiro mas atendimentos só os dias importados, e a
//   razão dos totais ficaria artificialmente alta — a média das razões
//   diárias mantém o número na mesma faixa de um dia típico.
//
// Itens vendidos vem de `sales_category_totals_daily` (categoria='ALL'), a
// mesma tabela-rollup diária que mobile_category_totals() já lê (migration
// 0094) — só que consultada aqui já em granularidade por dia, necessária
// pro cálculo acima. Atendimentos vem de `client_service_records` (migration
// 0103), nunca de `sales` — a planilha de vendas comum não tem como dizer
// quantos clientes um vendedor atendeu.
import { firstName } from './normalize';
import { normalizeMatricula } from './parsing';
import type { ClientServiceRecord, Collaborator } from './types';

/** Uma linha de `sales_category_totals_daily` (categoria='ALL'): itens
 * vendidos por colaborador, num único dia. */
export interface DailyItensRow {
  matricula: string;
  dataISO: string;
  itensTotal: number;
}

export interface UvcSummaryRow {
  matricula: string;
  nome: string;
  apelido: string;
  foto: string | null;
  /** Itens vendidos no período, soma simples — nunca a métrica em si. */
  itens: number;
  atendimentos: number;
  /** UVC: itens ÷ atendimentos (razão do período, ou média das razões
   * diárias no Modo Geral — ver `modoGeral` em computeUvcSummary). */
  uvc: number;
}

export interface UvcTotals {
  itens: number;
  atendimentos: number;
  /** null quando não há nenhum atendimento importado no período — nunca
   * Infinity/NaN de uma divisão por zero. */
  uvc: number | null;
}

interface DayAgg {
  itens: number;
  atendimentos: number;
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Agrega itens vendidos + atendimentos por (matrícula, dia) e por dia (loja
 * inteira), restrito a [fromDate, toDate] — base compartilhada por
 * computeUvcSummary (razão por colaborador/loja) e computeUvcDailyRows
 * (quadro por dia, usado na visão "Por dia" da tela própria de UVC). */
function buildDayAggregates(
  dailyItens: DailyItensRow[],
  records: ClientServiceRecord[],
  collaboratorsById: Map<string, Collaborator>,
  fromDate: string,
  toDate: string,
): { byMatriculaDay: Map<string, DayAgg>; byDay: Map<string, DayAgg> } {
  const byMatriculaDay = new Map<string, DayAgg>();
  const byDay = new Map<string, DayAgg>();

  dailyItens.forEach((r) => {
    if (r.dataISO < fromDate || r.dataISO > toDate) return;
    const itens = Number(r.itensTotal) || 0;
    const matricula = normalizeMatricula(r.matricula);
    const mdKey = `${matricula}|${r.dataISO}`;
    const md = byMatriculaDay.get(mdKey) ?? { itens: 0, atendimentos: 0 };
    md.itens += itens;
    byMatriculaDay.set(mdKey, md);
    const d = byDay.get(r.dataISO) ?? { itens: 0, atendimentos: 0 };
    d.itens += itens;
    byDay.set(r.dataISO, d);
  });

  records.forEach((r) => {
    if (r.dataISO < fromDate || r.dataISO > toDate) return;
    const c = collaboratorsById.get(r.collaboratorId);
    if (!c) return; // colaborador removido depois da importação
    const matricula = normalizeMatricula(c.matricula);
    const mdKey = `${matricula}|${r.dataISO}`;
    const md = byMatriculaDay.get(mdKey) ?? { itens: 0, atendimentos: 0 };
    md.atendimentos += r.atendimentos;
    byMatriculaDay.set(mdKey, md);
    const d = byDay.get(r.dataISO) ?? { itens: 0, atendimentos: 0 };
    d.atendimentos += r.atendimentos;
    byDay.set(r.dataISO, d);
  });

  return { byMatriculaDay, byDay };
}

export function computeUvcSummary(
  dailyItens: DailyItensRow[],
  records: ClientServiceRecord[],
  collaborators: Collaborator[],
  fromDate: string,
  toDate: string,
  modoGeral: boolean,
): { rows: UvcSummaryRow[]; totals: UvcTotals } {
  const collaboratorsById = new Map(collaborators.map((c) => [c.id, c]));
  const collaboratorByMatricula = new Map(collaborators.map((c) => [normalizeMatricula(c.matricula), c]));

  // Agregados por (matrícula, dia) — pra média diária por colaborador — e
  // por dia (loja inteira) — pra média diária do total da loja, que nunca
  // pode vir de médiar as razões por colaborador (ver comentário no topo).
  const { byMatriculaDay, byDay } = buildDayAggregates(dailyItens, records, collaboratorsById, fromDate, toDate);

  // Por colaborador: soma simples (itens/atendimentos do período) + lista
  // das razões diárias (só nos dias com atendimentos > 0), pra alimentar
  // qualquer um dos dois modos abaixo sem reprocessar os dados duas vezes.
  const perMatricula = new Map<string, { itens: number; atendimentos: number; dailyRatios: number[] }>();
  byMatriculaDay.forEach((agg, key) => {
    if (agg.atendimentos <= 0) return; // sem atendimentos = razão não calculável naquele dia
    const matricula = key.slice(0, key.indexOf('|'));
    const entry = perMatricula.get(matricula) ?? { itens: 0, atendimentos: 0, dailyRatios: [] };
    entry.itens += agg.itens;
    entry.atendimentos += agg.atendimentos;
    entry.dailyRatios.push(agg.itens / agg.atendimentos);
    perMatricula.set(matricula, entry);
  });

  const rows: UvcSummaryRow[] = [];
  perMatricula.forEach((entry, matricula) => {
    const c = collaboratorByMatricula.get(matricula);
    if (!c) return;
    const uvc = modoGeral ? avg(entry.dailyRatios) : entry.itens / entry.atendimentos;
    rows.push({
      matricula: c.matricula,
      nome: c.nome,
      apelido: c.apelido || firstName(c.nome),
      foto: c.foto,
      itens: entry.itens,
      atendimentos: entry.atendimentos,
      uvc,
    });
  });
  rows.sort((a, b) => b.uvc - a.uvc);

  // Totais da loja: itens/atendimentos são sempre a soma simples do período
  // (números absolutos, úteis por si só nos cards "Itens Vendidos"/
  // "Atendimentos no período") — só o `uvc` muda de fórmula conforme o modo.
  let totalItens = 0;
  let totalAtendimentos = 0;
  const storeDailyRatios: number[] = [];
  byDay.forEach((agg) => {
    totalItens += agg.itens;
    totalAtendimentos += agg.atendimentos;
    if (agg.atendimentos > 0) storeDailyRatios.push(agg.itens / agg.atendimentos);
  });

  const uvcTotal = modoGeral
    ? storeDailyRatios.length > 0
      ? avg(storeDailyRatios)
      : null
    : totalAtendimentos > 0
      ? totalItens / totalAtendimentos
      : null;

  return { rows, totals: { itens: totalItens, atendimentos: totalAtendimentos, uvc: uvcTotal } };
}

export interface UvcDailyRow {
  dataISO: string;
  itens: number;
  atendimentos: number;
  /** null quando aquele dia não teve nenhum atendimento importado. */
  uvc: number | null;
}

/** Quadro "Por dia" da tela própria de UVC (UvcPage.tsx) — um total da LOJA
 * INTEIRA por dia (não por colaborador), ordenado do mais recente pro mais
 * antigo. Cada dia usa sua própria razão (itens do dia ÷ atendimentos do
 * dia) — não depende de Modo Geral, que só afeta como o RESUMO do período
 * agrega esses dias (ver computeUvcSummary), nunca os dias individuais. */
export function computeUvcDailyRows(
  dailyItens: DailyItensRow[],
  records: ClientServiceRecord[],
  collaborators: Collaborator[],
  fromDate: string,
  toDate: string,
): UvcDailyRow[] {
  const collaboratorsById = new Map(collaborators.map((c) => [c.id, c]));
  const { byDay } = buildDayAggregates(dailyItens, records, collaboratorsById, fromDate, toDate);
  return Array.from(byDay.entries())
    .map(([dataISO, agg]) => ({
      dataISO,
      itens: agg.itens,
      atendimentos: agg.atendimentos,
      uvc: agg.atendimentos > 0 ? agg.itens / agg.atendimentos : null,
    }))
    .sort((a, b) => (a.dataISO < b.dataISO ? 1 : -1));
}

/** "3,0" — 1 casa decimal, vírgula (igual ao padrão já usado no sistema). */
export function fmtUvc(v: number | null): string {
  if (v === null) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
