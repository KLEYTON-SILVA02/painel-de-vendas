// Ported 1:1 from legacy/index-original.html (computeDinamicaProgresso /
// computeDinamicaRanking / resolveRankFilterParams' dynamic-intersection branch).
import { firstName, normalize } from './normalize';
import { normalizeMatricula } from './parsing';
import type { Collaborator, Dynamic, DynamicProductCategory, Sale } from './types';

export interface DinamicaRankingRow {
  matricula: string;
  nome: string;
  apelido: string;
  foto: string | null;
  valor: number;
  itens: number;
  /** This row's own target — din.metasIndividuais[matricula] in
   * metaModo 'individual', or the dynamic's single shared metaValor
   * otherwise, so callers never need to branch on metaModo themselves. */
  metaIndividual: number;
}

/** The target a given participant is measured against — their own entry in
 * metasIndividuais when metaModo is 'individual' (0 if unset), or the
 * dynamic's single shared metaValor otherwise. */
export function metaFor(din: Dynamic, matricula: string): number {
  if (din.metaModo === 'individual') return Number(din.metasIndividuais[normalizeMatricula(matricula)]) || 0;
  return din.metaValor;
}

/** Whether a sale's product matches one product category — an exact
 * (normalized) hit against the category's own `produtos` list, or a
 * substring hit against its `palavraChave` (e.g. a brand name), so a
 * category can catch every SKU sharing a naming pattern without enumerating
 * each one by hand. */
export function productMatchesCategoria(produtoNome: string, categoria: DynamicProductCategory): boolean {
  const nome = normalize(produtoNome);
  if (categoria.produtos.some((p) => normalize(p) === nome)) return true;
  const palavra = normalize(categoria.palavraChave.trim());
  return palavra.length > 0 && nome.includes(palavra);
}

/** The effective product filter for a dynamic's overall progress/ranking:
 * when categoriasProdutos are in use, only products matching at least one
 * category count (the categories partition what "participates"); with no
 * categories (the "none" / legacy state) falls back to the flat `produtos`
 * list, unchanged from before this feature existed. */
function dinamicaProdutoParticipa(din: Dynamic, produtoNome: string): boolean {
  if (din.categoriasProdutos.length > 0) {
    return din.categoriasProdutos.some((cat) => productMatchesCategoria(produtoNome, cat));
  }
  if (din.produtos.length === 0) return true;
  return din.produtos.some((p) => normalize(p) === normalize(produtoNome));
}

export interface DinamicaCategoriaTotal {
  id: string;
  nome: string;
  valor: number;
  itens: number;
  /** itens * multiplicador.valor when the dynamic's multiplicador is ativo, else null. */
  pontuacao: number | null;
}

/** Per-categoria totals for the "cards abaixo dos cards de métricas" view —
 * one entry per registered categoria, each with its own valor/itens summed
 * from sales matching that categoria (within the dynamic's period and
 * setorAlvo), plus its multiplier score when the dynamic has one active. */
export function computeDinamicaCategoriaTotais(
  din: Dynamic,
  sales: Sale[],
  collaborators: Collaborator[],
): DinamicaCategoriaTotal[] {
  const collaboratorByMatricula = new Map(collaborators.map((c) => [normalizeMatricula(c.matricula), c]));
  const participantesSet = din.participantes.length ? new Set(din.participantes.map(normalizeMatricula)) : null;

  return din.categoriasProdutos.map((categoria) => {
    let valor = 0;
    let itens = 0;
    sales.forEach((s) => {
      if (!s.dataISO || s.dataISO < din.dataInicio || s.dataISO > din.dataFim) return;
      if (!productMatchesCategoria(s.produto, categoria)) return;
      const key = normalizeMatricula(s.matricula);
      if (participantesSet && !participantesSet.has(key)) return;
      const c = collaboratorByMatricula.get(key);
      if (!c || !dynamicAllowsCollaborator(din, c)) return;
      valor += Number(s.valor) || 0;
      itens += Number(s.qtd) || 0;
    });
    return {
      id: categoria.id,
      nome: categoria.nome,
      valor,
      itens,
      pontuacao: din.multiplicador.ativo ? itens * din.multiplicador.valor : null,
    };
  });
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
  const participantesSet = din.participantes.length ? new Set(din.participantes.map(normalizeMatricula)) : null;
  const collaboratorByMatricula = new Map(collaborators.map((c) => [normalizeMatricula(c.matricula), c]));
  let valor = 0;
  let itens = 0;
  sales.forEach((s) => {
    if (!s.dataISO || s.dataISO < din.dataInicio || s.dataISO > din.dataFim) return;
    if (!dinamicaProdutoParticipa(din, s.produto)) return;
    if (participantesSet && !participantesSet.has(normalizeMatricula(s.matricula))) return;
    const c = collaboratorByMatricula.get(normalizeMatricula(s.matricula));
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
  const participantesSet = din.participantes.length ? new Set(din.participantes.map(normalizeMatricula)) : null;
  // Keyed by normalized matricula — see the comment on the same pattern in
  // summary.ts's computeSummary.
  const map: Record<string, DinamicaRankingRow> = {};

  collaborators.forEach((c) => {
    const key = normalizeMatricula(c.matricula);
    if (participantesSet && !participantesSet.has(key)) return;
    if (!dynamicAllowsCollaborator(din, c)) return;
    map[key] = {
      matricula: c.matricula,
      nome: c.nome,
      apelido: c.apelido || firstName(c.nome),
      foto: c.foto,
      valor: 0,
      itens: 0,
      metaIndividual: metaFor(din, c.matricula),
    };
  });

  sales.forEach((s) => {
    if (!s.dataISO || s.dataISO < din.dataInicio || s.dataISO > din.dataFim) return;
    if (!dinamicaProdutoParticipa(din, s.produto)) return;
    const key = normalizeMatricula(s.matricula);
    if (!map[key]) {
      if (participantesSet) return;
      const c = collaborators.find((cc) => normalizeMatricula(cc.matricula) === key);
      if (c && !dynamicAllowsCollaborator(din, c)) return;
      map[key] = {
        matricula: s.matricula,
        nome: c ? c.nome : s.vendedor,
        apelido: c ? c.apelido || firstName(c.nome) : (s.vendedor && firstName(s.vendedor)) || s.matricula,
        foto: c ? c.foto : null,
        valor: 0,
        itens: 0,
        metaIndividual: metaFor(din, s.matricula),
      };
    }
    map[key].valor += Number(s.valor) || 0;
    map[key].itens += Number(s.qtd) || 0;
  });

  return Object.values(map).sort((a, b) => (din.metrica === 'unidade' ? b.itens - a.itens : b.valor - a.valor));
}

/** "Meta total" for the active-dynamic stat cards: the single shared
 * metaValor in 'geral' mode, or the sum of every eligible participant's own
 * target in 'individual' mode (participantes/setorAlvo still narrow who
 * counts, same as the ranking above). */
export function dinamicaMetaTotal(din: Dynamic, collaborators: Collaborator[]): number {
  if (din.metaModo !== 'individual') return din.metaValor;
  const participantesSet = din.participantes.length ? new Set(din.participantes.map(normalizeMatricula)) : null;
  return collaborators.reduce((sum, c) => {
    const key = normalizeMatricula(c.matricula);
    if (participantesSet && !participantesSet.has(key)) return sum;
    if (!dynamicAllowsCollaborator(din, c)) return sum;
    return sum + (Number(din.metasIndividuais[key]) || 0);
  }, 0);
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
