// UVC (Unidades Vendidas por Cliente) no Dashboard — ranking próprio,
// igual DSM (dsm.ts), mas calculado como uma RAZÃO (itens ÷ atendimentos),
// não uma soma. Por isso o "total da loja" nunca pode ser derivado somando
// o UVC de cada colaborador (isso não tem significado nenhum) — é sempre a
// razão dos totais da loja inteira, calculada à parte (`totals` abaixo).
//
// Itens vendidos reaproveita `categoryTotals` (mobile_category_totals(),
// já buscado pelo Dashboard pra tudo mais na tela — Vendas por Categoria,
// o ranking padrão, a barra de evolução), somado por matrícula em TODAS as
// categorias: "independente de categoria" é literalmente isso, e evita uma
// chamada de rede nova numa tela de alto tráfego (mesmo raciocínio da
// resposta à cota de banda do Supabase estourada, migrations 0101/0102).
// Atendimentos vem de `client_service_records` (migration 0103), nunca de
// `sales` — a planilha de vendas comum não tem como dizer quantos clientes
// um vendedor atendeu.
import type { CategoryTotalRow } from './summary';
import { firstName } from './normalize';
import { normalizeMatricula } from './parsing';
import type { ClientServiceRecord, Collaborator } from './types';

export interface UvcSummaryRow {
  matricula: string;
  nome: string;
  apelido: string;
  foto: string | null;
  itens: number;
  atendimentos: number;
  uvc: number;
}

export interface UvcTotals {
  itens: number;
  atendimentos: number;
  /** null quando não há nenhum atendimento importado no período — nunca
   * Infinity/NaN de uma divisão por zero. */
  uvc: number | null;
}

export function computeUvcSummary(
  categoryTotals: CategoryTotalRow[],
  records: ClientServiceRecord[],
  collaborators: Collaborator[],
  fromDate: string,
  toDate: string,
): { rows: UvcSummaryRow[]; totals: UvcTotals } {
  const collaboratorsById = new Map(collaborators.map((c) => [c.id, c]));
  const collaboratorByMatricula = new Map(collaborators.map((c) => [normalizeMatricula(c.matricula), c]));

  const itensByMatricula = new Map<string, number>();
  let totalItens = 0;
  categoryTotals.forEach((r) => {
    const qtd = Number(r.itensTotal) || 0;
    totalItens += qtd;
    const key = normalizeMatricula(r.matricula);
    itensByMatricula.set(key, (itensByMatricula.get(key) ?? 0) + qtd);
  });

  const atendimentosByMatricula = new Map<string, number>();
  let totalAtendimentos = 0;
  records.forEach((r) => {
    if (r.dataISO < fromDate || r.dataISO > toDate) return;
    totalAtendimentos += r.atendimentos;
    const c = collaboratorsById.get(r.collaboratorId);
    if (!c) return; // colaborador removido depois da importação
    const key = normalizeMatricula(c.matricula);
    atendimentosByMatricula.set(key, (atendimentosByMatricula.get(key) ?? 0) + r.atendimentos);
  });

  const keys = new Set<string>([...itensByMatricula.keys(), ...atendimentosByMatricula.keys()]);
  const rows: UvcSummaryRow[] = [];
  keys.forEach((key) => {
    const c = collaboratorByMatricula.get(key);
    if (!c) return;
    const atendimentos = atendimentosByMatricula.get(key) ?? 0;
    if (atendimentos <= 0) return; // sem atendimentos = UVC não calculável, fora do ranking
    const itens = itensByMatricula.get(key) ?? 0;
    rows.push({ matricula: c.matricula, nome: c.nome, apelido: c.apelido || firstName(c.nome), foto: c.foto, itens, atendimentos, uvc: itens / atendimentos });
  });
  rows.sort((a, b) => b.uvc - a.uvc);

  return {
    rows,
    totals: { itens: totalItens, atendimentos: totalAtendimentos, uvc: totalAtendimentos > 0 ? totalItens / totalAtendimentos : null },
  };
}

/** "3,0" — 1 casa decimal, igual ao padrão já usado em UvcPage.tsx. */
export function fmtUvc(v: number | null): string {
  if (v === null) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
