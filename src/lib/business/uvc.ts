// UVC (Unidades Vendidas por Cliente) no Dashboard — ranking próprio, igual
// DSM (dsm.ts), mas calculado como uma RAZÃO EM R$ (valor vendido ÷
// atendimentos), não uma soma nem uma contagem de unidades. Por isso o
// "total da loja" nunca pode ser derivado somando o UVC de cada colaborador
// (isso não tem significado nenhum) — é sempre calculado à parte (`totals`
// abaixo), de duas formas possíveis conforme o filtro de data ativo:
//
// - Fora do Modo Geral (um dia ou uma Busca período): razão dos totais do
//   período (soma de valor ÷ soma de atendimentos) — matematicamente igual
//   a agregar dia a dia, já que o período é o que o usuário escolheu.
// - Modo Geral (mês inteiro): MÉDIA das razões diárias (valor do dia ÷
//   atendimentos do dia, só nos dias em que houve atendimento importado),
//   em vez da razão dos totais do mês inteiro. Decisão explícita do
//   usuário: se a planilha de "Vendas por Clientes" não é importada TODO
//   dia do mês (comum — nem toda loja importa atendimentos diariamente),
//   valor acumula o mês inteiro mas atendimentos só os dias importados, e a
//   razão dos totais ficaria artificialmente alta — a média das razões
//   diárias mantém o número na mesma faixa de um dia típico (o acompanhamento
//   manual do usuário varia de R$ 1,00 a R$ 10,00 por dia).
//
// Valor vendido vem de `sales_category_totals_daily` (categoria='ALL'), a
// mesma tabela-rollup diária que mobile_category_totals() já lê (migration
// 0094) — só que consultada aqui já em granularidade por dia, necessária
// pro cálculo acima. Atendimentos vem de `client_service_records` (migration
// 0103), nunca de `sales` — a planilha de vendas comum não tem como dizer
// quantos clientes um vendedor atendeu.
import { fmtMoney } from '../format';
import { firstName } from './normalize';
import { normalizeMatricula } from './parsing';
import type { ClientServiceRecord, Collaborator } from './types';

/** Uma linha de `sales_category_totals_daily` (categoria='ALL'): valor
 * vendido por colaborador, num único dia. */
export interface DailyValorRow {
  matricula: string;
  dataISO: string;
  valorTotal: number;
}

export interface UvcSummaryRow {
  matricula: string;
  nome: string;
  apelido: string;
  foto: string | null;
  /** Valor vendido (R$) no período, soma simples — nunca a métrica em si. */
  valor: number;
  atendimentos: number;
  /** UVC em R$: valor ÷ atendimentos (razão do período, ou média das razões
   * diárias no Modo Geral — ver `modoGeral` em computeUvcSummary). */
  uvc: number;
}

export interface UvcTotals {
  valor: number;
  atendimentos: number;
  /** null quando não há nenhum atendimento importado no período — nunca
   * Infinity/NaN de uma divisão por zero. */
  uvc: number | null;
}

interface DayAgg {
  valor: number;
  atendimentos: number;
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function computeUvcSummary(
  dailyValor: DailyValorRow[],
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
  const byMatriculaDay = new Map<string, DayAgg>();
  const byDay = new Map<string, DayAgg>();

  dailyValor.forEach((r) => {
    if (r.dataISO < fromDate || r.dataISO > toDate) return;
    const valor = Number(r.valorTotal) || 0;
    const matricula = normalizeMatricula(r.matricula);
    const mdKey = `${matricula}|${r.dataISO}`;
    const md = byMatriculaDay.get(mdKey) ?? { valor: 0, atendimentos: 0 };
    md.valor += valor;
    byMatriculaDay.set(mdKey, md);
    const d = byDay.get(r.dataISO) ?? { valor: 0, atendimentos: 0 };
    d.valor += valor;
    byDay.set(r.dataISO, d);
  });

  records.forEach((r) => {
    if (r.dataISO < fromDate || r.dataISO > toDate) return;
    const c = collaboratorsById.get(r.collaboratorId);
    if (!c) return; // colaborador removido depois da importação
    const matricula = normalizeMatricula(c.matricula);
    const mdKey = `${matricula}|${r.dataISO}`;
    const md = byMatriculaDay.get(mdKey) ?? { valor: 0, atendimentos: 0 };
    md.atendimentos += r.atendimentos;
    byMatriculaDay.set(mdKey, md);
    const d = byDay.get(r.dataISO) ?? { valor: 0, atendimentos: 0 };
    d.atendimentos += r.atendimentos;
    byDay.set(r.dataISO, d);
  });

  // Por colaborador: soma simples (valor/atendimentos do período) + lista
  // das razões diárias (só nos dias com atendimentos > 0), pra alimentar
  // qualquer um dos dois modos abaixo sem reprocessar os dados duas vezes.
  const perMatricula = new Map<string, { valor: number; atendimentos: number; dailyRatios: number[] }>();
  byMatriculaDay.forEach((agg, key) => {
    if (agg.atendimentos <= 0) return; // sem atendimentos = razão não calculável naquele dia
    const matricula = key.slice(0, key.indexOf('|'));
    const entry = perMatricula.get(matricula) ?? { valor: 0, atendimentos: 0, dailyRatios: [] };
    entry.valor += agg.valor;
    entry.atendimentos += agg.atendimentos;
    entry.dailyRatios.push(agg.valor / agg.atendimentos);
    perMatricula.set(matricula, entry);
  });

  const rows: UvcSummaryRow[] = [];
  perMatricula.forEach((entry, matricula) => {
    const c = collaboratorByMatricula.get(matricula);
    if (!c) return;
    const uvc = modoGeral ? avg(entry.dailyRatios) : entry.valor / entry.atendimentos;
    rows.push({
      matricula: c.matricula,
      nome: c.nome,
      apelido: c.apelido || firstName(c.nome),
      foto: c.foto,
      valor: entry.valor,
      atendimentos: entry.atendimentos,
      uvc,
    });
  });
  rows.sort((a, b) => b.uvc - a.uvc);

  // Totais da loja: valor/atendimentos são sempre a soma simples do período
  // (números absolutos, úteis por si só nos cards "Valor Vendido"/
  // "Atendimentos no período") — só o `uvc` muda de fórmula conforme o modo.
  let totalValor = 0;
  let totalAtendimentos = 0;
  const storeDailyRatios: number[] = [];
  byDay.forEach((agg) => {
    totalValor += agg.valor;
    totalAtendimentos += agg.atendimentos;
    if (agg.atendimentos > 0) storeDailyRatios.push(agg.valor / agg.atendimentos);
  });

  const uvcTotal = modoGeral
    ? storeDailyRatios.length > 0
      ? avg(storeDailyRatios)
      : null
    : totalAtendimentos > 0
      ? totalValor / totalAtendimentos
      : null;

  return { rows, totals: { valor: totalValor, atendimentos: totalAtendimentos, uvc: uvcTotal } };
}

/** "R$ 3,00" — moeda BRL, mesma formatação de fmtMoney (lib/format.ts). */
export function fmtUvc(v: number | null): string {
  if (v === null) return '—';
  return fmtMoney(v);
}
