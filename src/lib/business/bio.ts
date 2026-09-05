// Ported 1:1 from legacy/index-original.html (computeBioSummary).
// BIOSINTÉTICA ranking is deliberately restricted to the "Balcão" sector —
// sales by G1-G4 products registered under any other sector are a data-quality
// alert (see auditBioOutsideBalcao), not part of the ranking. Other category
// types define their own eligible sector(s) (category_types.setores_elegiveis)
// instead of this constant — BALCAO_SETOR is BIOSINTÉTICA's own default.
import { classifyBio } from './classification';
import type { BioGroupKey } from './classification';
import { firstName } from './normalize';
import { normalizeMatricula } from './parsing';
import type { BioGroupsProducts, BioWeights, Collaborator, Sale } from './types';

export const BALCAO_SETOR = 'Balcão';

/** Groups a flat list of group/product rows (as stored in `bio_groups`) into
 * the `{ [grupo]: KeywordItem[] }` shape classifyBio/computeBioSummary need —
 * shared by every screen that reads bio_groups (desktop, mobile v2,
 * collaborator) instead of each re-implementing it. Builds its keys from
 * whatever `grupo` values are actually present, so it works for any
 * category's own group set, not just a hardcoded G1-G4. */
export function groupBioRows(rows: { grupo: string; nome: string; palavras: string[] }[] | undefined): BioGroupsProducts {
  const result: BioGroupsProducts = {};
  (rows ?? []).forEach((r) => {
    if (!result[r.grupo]) result[r.grupo] = [];
    result[r.grupo].push({ nome: r.nome, palavras: r.palavras });
  });
  return result;
}

export interface BioSummaryRow {
  matricula: string;
  nome: string;
  apelido: string;
  foto: string | null;
  qtd: Record<BioGroupKey, number>;
  pontos: number;
  itens: number;
}

export function computeBioSummary(
  sales: Sale[],
  collaborators: Collaborator[],
  bioGroups: BioGroupsProducts,
  bioWeights: BioWeights,
  fromDate: string | null,
  toDate: string | null,
  groupFilter?: BioGroupKey | 'ALL' | null,
  /** Which sector(s) may participate in this category's ranking — defaults
   * to BIOSINTÉTICA's own Balcão-only rule for existing callers that don't
   * pass one yet. */
  setoresElegiveis: string[] = [BALCAO_SETOR],
): BioSummaryRow[] {
  const eligible = new Set(setoresElegiveis);
  const zeroQtd = Object.fromEntries(Object.keys(bioGroups).map((g) => [g, 0]));
  const elegiveis = collaborators.filter((c) => c.setor !== null && eligible.has(c.setor));
  // Keyed by normalized matricula — see the comment on the same pattern in
  // summary.ts's computeSummary.
  const map: Record<string, BioSummaryRow> = {};
  elegiveis.forEach((c) => {
    map[normalizeMatricula(c.matricula)] = {
      matricula: c.matricula,
      nome: c.nome,
      apelido: c.apelido || firstName(c.nome),
      foto: c.foto,
      qtd: { ...zeroQtd },
      pontos: 0,
      itens: 0,
    };
  });

  sales.forEach((s) => {
    if (fromDate && s.dataISO && s.dataISO < fromDate) return;
    if (toDate && s.dataISO && s.dataISO > toDate) return;
    const row = map[normalizeMatricula(s.matricula)];
    if (!row) return; // only counts collaborators in an eligible sector
    const g = classifyBio(s.produto, bioGroups);
    if (!g) return;
    if (groupFilter && groupFilter !== 'ALL' && g !== groupFilter) return;
    const qtd = Number(s.qtd) || 0;
    row.qtd[g] += qtd;
    row.pontos += qtd * (Number(bioWeights[g]) || 0);
    row.itens += qtd;
  });

  return Object.values(map).sort((a, b) => b.pontos - a.pontos);
}

export interface BioOutsideAlert {
  matricula: string;
  vendedor: string;
  setor: string | null;
  produto: string;
  grupo: BioGroupKey;
  dataISO: string | null;
}

/** Flags sales of this category's products made by collaborators outside
 * its eligible sector(s). */
export function auditBioOutsideBalcao(
  sales: Sale[],
  collaborators: Collaborator[],
  bioGroups: BioGroupsProducts,
  setoresElegiveis: string[] = [BALCAO_SETOR],
): BioOutsideAlert[] {
  const eligible = new Set(setoresElegiveis);
  const byMatricula = new Map(collaborators.map((c) => [normalizeMatricula(c.matricula), c]));
  const alerts: BioOutsideAlert[] = [];
  sales.forEach((s) => {
    const g = classifyBio(s.produto, bioGroups);
    if (!g) return;
    const collaborator = byMatricula.get(normalizeMatricula(s.matricula));
    if (collaborator && collaborator.setor !== null && eligible.has(collaborator.setor)) return;
    alerts.push({
      matricula: s.matricula,
      vendedor: collaborator?.nome || s.vendedor,
      setor: collaborator?.setor ?? null,
      produto: s.produto,
      grupo: g,
      dataISO: s.dataISO,
    });
  });
  return alerts;
}
