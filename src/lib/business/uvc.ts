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
import type { ConquistaRow } from './conquistas';
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

/** Galeria de Conquistas support for UVC — mesmo formato de
 * computeDsmConquistas (dsm.ts): UVC não tem escada fixa de R$/unidades (é
 * uma razão, itens ÷ atendimentos — uma escada fixa não teria significado,
 * mesmo raciocínio de isUnitConquista pra LEVMEL/CHIP/DSM), então qualquer
 * dia com razão calculável (atendimentos > 0 naquele dia) já é a própria
 * conquista — tier = a razão daquele dia, melhor dia único vence (nunca
 * somado/mediado num período "Modo Geral"). `itens`/`valor` guardam a
 * própria razão, pra a linha satisfazer o formato de ConquistaRow sem um
 * campo dedicado (mesma convenção que DSM já usa). */
export function computeUvcConquistas(
  dailyItens: DailyItensRow[],
  records: ClientServiceRecord[],
  collaborators: Collaborator[],
  fromDate: string,
  toDate: string,
): ConquistaRow[] {
  const collaboratorsById = new Map(collaborators.map((c) => [c.id, c]));
  const collaboratorByMatricula = new Map(collaborators.map((c) => [normalizeMatricula(c.matricula), c]));
  const { byMatriculaDay } = buildDayAggregates(dailyItens, records, collaboratorsById, fromDate, toDate);
  const bestByMatricula = new Map<string, ConquistaRow>();

  byMatriculaDay.forEach((agg, key) => {
    if (agg.atendimentos <= 0) return; // sem atendimento = razão não calculável naquele dia
    const sep = key.indexOf('|');
    const c = collaboratorByMatricula.get(key.slice(0, sep));
    if (!c) return;
    const tier = agg.itens / agg.atendimentos;
    if (tier <= 0) return;
    const current = bestByMatricula.get(c.matricula);
    if (!current || tier > current.tier) {
      bestByMatricula.set(c.matricula, {
        matricula: c.matricula,
        nome: c.nome,
        apelido: c.apelido || firstName(c.nome),
        foto: c.fotoConquista || c.foto,
        metaIndividual: 0,
        qtd: { DERM: 0, GEN: 0, MP: 0, MER: 0, SEM: 0 },
        valor: tier,
        itens: tier,
        tier,
      });
    }
  });

  return Array.from(bestByMatricula.values()).sort((a, b) => b.tier - a.tier);
}

/** Sidebar "Galeria de dias" para UVC — um dia conta como tendo conquista
 * quando pelo menos um colaborador teve razão calculável (atendimentos > 0)
 * naquele dia, mesmo padrão de computeDsmConquistasDayGallery. */
export function computeUvcConquistasDayGallery(
  dailyItens: DailyItensRow[],
  records: ClientServiceRecord[],
  collaborators: Collaborator[],
  fromDate: string,
  toDate: string,
): { dia: string; count: number }[] {
  const collaboratorsById = new Map(collaborators.map((c) => [c.id, c]));
  const { byMatriculaDay } = buildDayAggregates(dailyItens, records, collaboratorsById, fromDate, toDate);
  const achieversByDay = new Map<string, Set<string>>();
  byMatriculaDay.forEach((agg, key) => {
    if (agg.atendimentos <= 0) return;
    const sep = key.indexOf('|');
    const matricula = key.slice(0, sep);
    const dataISO = key.slice(sep + 1);
    const set = achieversByDay.get(dataISO) ?? new Set<string>();
    set.add(matricula);
    achieversByDay.set(dataISO, set);
  });

  const days: string[] = [];
  for (let d = new Date(`${fromDate}T00:00:00`); d.toISOString().slice(0, 10) <= toDate; d.setDate(d.getDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days.reverse().map((dia) => ({ dia, count: achieversByDay.get(dia)?.size ?? 0 }));
}

/** Mesma razão dia a dia de computeUvcDailyRows, só que de um único
 * colaborador (em vez do total da loja) — usado no Extrato por Colaborador
 * (RankingPage.tsx): aquela tela nunca soma UVC entre dias, nem mesmo em
 * "Dias acumulados" (razão de dois dias somada não tem significado — ver
 * comentário no topo deste arquivo), então sempre precisa da razão já
 * calculada dia a dia dessa pessoa. Mesma regra de computeUvcSummary: um dia
 * sem nenhum atendimento importado não entra (razão não calculável). */
export function computeUvcDailyRowsForCollaborator(
  dailyItens: DailyItensRow[],
  records: ClientServiceRecord[],
  collaborators: Collaborator[],
  matricula: string,
  fromDate: string,
  toDate: string,
): UvcDailyRow[] {
  const collaboratorsById = new Map(collaborators.map((c) => [c.id, c]));
  const { byMatriculaDay } = buildDayAggregates(dailyItens, records, collaboratorsById, fromDate, toDate);
  const target = normalizeMatricula(matricula);
  const out: UvcDailyRow[] = [];
  byMatriculaDay.forEach((agg, key) => {
    const sep = key.indexOf('|');
    if (key.slice(0, sep) !== target || agg.atendimentos <= 0) return;
    out.push({ dataISO: key.slice(sep + 1), itens: agg.itens, atendimentos: agg.atendimentos, uvc: agg.itens / agg.atendimentos });
  });
  return out.sort((a, b) => a.dataISO.localeCompare(b.dataISO));
}

/** "R$ 2,35" — 2 casas decimais (pedido do usuário, 2026-10-24: "mais uma
 * casa decimal", de 1 pra 2), vírgula, prefixo "R$" só por formatação
 * visual — o UVC continua sendo itens ÷ atendimentos, nunca um valor
 * monetário de verdade — o "R$" aqui não representa reais, é só o estilo
 * visual escolhido pra exibição. */
export function fmtUvc(v: number | null): string {
  if (v === null) return '—';
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
