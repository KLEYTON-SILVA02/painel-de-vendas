// Ported 1:1 from legacy/index-original.html (computeDinamicaProgresso /
// computeDinamicaRanking / resolveRankFilterParams' dynamic-intersection branch).
import { normalize } from './normalize';
import type { Collaborator, Dynamic, Sale } from './types';

export interface DinamicaRankingRow {
  matricula: string;
  nome: string;
  apelido: string;
  foto: string | null;
  valor: number;
  itens: number;
}

/** Whether a collaborator's sector matches the dynamic's target sector —
 * 'ambos' (the default, and every dynamic created before this field
 * existed) never restricts. Determines who can participate, be counted
 * toward the dynamic's total, and appear in its ranking. */
export function dynamicAllowsCollaborator(din: Dynamic, collaborator: Pick<Collaborator, 'setor'>): boolean {
  if (din.setorAlvo === 'ambos') return true;
  const wanted = din.setorAlvo === 'balcao' ? 'Balcão' : 'Caixa';
  return collaborator.setor === wanted;
}

/** Progress of a dynamic — honors the optional product list (empty = all
 * products), participant list (empty = all collaborators), and setorAlvo
 * (a sale by a collaborator outside the target sector doesn't count),
 * using the dynamic's own metric (R$ or units). */
export function computeDinamicaProgresso(din: Dynamic, sales: Sale[], collaborators: Collaborator[]): number {
  const produtosSet = din.produtos.length ? new Set(din.produtos.map((p) => normalize(p))) : null;
  const participantesSet = din.participantes.length ? new Set(din.participantes) : null;
  const collaboratorByMatricula = new Map(collaborators.map((c) => [c.matricula, c]));
  let valor = 0;
  let itens = 0;
  sales.forEach((s) => {
    if (!s.dataISO || s.dataISO < din.dataInicio || s.dataISO > din.dataFim) return;
    if (produtosSet && !produtosSet.has(normalize(s.produto))) return;
    if (participantesSet && !participantesSet.has(s.matricula)) return;
    const c = collaboratorByMatricula.get(s.matricula);
    if (din.setorAlvo !== 'ambos' && (!c || !dynamicAllowsCollaborator(din, c))) return;
    valor += Number(s.valor) || 0;
    itens += Number(s.qtd) || 0;
  });
  return din.metrica === 'unidade' ? itens : valor;
}

/** Per-collaborator ranking within a dynamic. */
export function computeDinamicaRanking(
  din: Dynamic,
  sales: Sale[],
  collaborators: Collaborator[],
): DinamicaRankingRow[] {
  const produtosSet = din.produtos.length ? new Set(din.produtos.map((p) => normalize(p))) : null;
  const participantesSet = din.participantes.length ? new Set(din.participantes) : null;
  const map: Record<string, DinamicaRankingRow> = {};

  collaborators.forEach((c) => {
    if (participantesSet && !participantesSet.has(c.matricula)) return;
    if (!dynamicAllowsCollaborator(din, c)) return;
    map[c.matricula] = {
      matricula: c.matricula,
      nome: c.nome,
      apelido: c.apelido || c.nome,
      foto: c.foto,
      valor: 0,
      itens: 0,
    };
  });

  sales.forEach((s) => {
    if (!s.dataISO || s.dataISO < din.dataInicio || s.dataISO > din.dataFim) return;
    if (produtosSet && !produtosSet.has(normalize(s.produto))) return;
    if (!map[s.matricula]) {
      if (participantesSet) return;
      const c = collaborators.find((cc) => cc.matricula === s.matricula);
      if (c && !dynamicAllowsCollaborator(din, c)) return;
      map[s.matricula] = {
        matricula: s.matricula,
        nome: c ? c.nome : s.vendedor,
        apelido: c ? c.apelido || c.nome : s.vendedor,
        foto: c ? c.foto : null,
        valor: 0,
        itens: 0,
      };
    }
    map[s.matricula].valor += Number(s.valor) || 0;
    map[s.matricula].itens += Number(s.qtd) || 0;
  });

  return Object.values(map).sort((a, b) => (din.metrica === 'unidade' ? b.itens - a.itens : b.valor - a.valor));
}

/** A dynamic is "active" while its end date hasn't passed; ended dynamics move
 * to the gallery. Computed from dates rather than a stored flag, so it never
 * goes stale. */
export function isDynamicActive(din: Dynamic, todayISO = new Date().toISOString().slice(0, 10)): boolean {
  return din.dataFim >= todayISO;
}

export type DynamicStatus = 'ativa' | 'agendada' | 'encerrada';

/** Three-way status used by the Dinâmicas admin screen: a dynamic is
 * "ativa" while today falls within its period, "agendada" before it starts,
 * and "encerrada" once its end date has passed (moves to the gallery tab). */
export function dynamicStatus(din: Dynamic, todayISO = new Date().toISOString().slice(0, 10)): DynamicStatus {
  if (din.dataFim < todayISO) return 'encerrada';
  if (din.dataInicio > todayISO) return 'agendada';
  return 'ativa';
}

/**
 * Intersects an externally active date filter (e.g. the dashboard's date
 * range) with the dynamic's own period, clamping to the tighter bound on
 * each side — exactly as the legacy ranking-filter integration does.
 */
export function intersectDynamicPeriod(
  din: Dynamic,
  filterFrom: string,
  filterTo: string,
): { from: string; to: string } {
  const from = din.dataInicio > filterFrom ? din.dataInicio : filterFrom;
  const to = din.dataFim < filterTo ? din.dataFim : filterTo;
  return { from, to };
}
