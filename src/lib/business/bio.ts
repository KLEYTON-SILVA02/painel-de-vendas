// Ported 1:1 from legacy/index-original.html (computeBioSummary).
// BIOSINTÉTICA ranking is deliberately restricted to the "Balcão" sector —
// sales by G1-G4 products registered under any other sector are a data-quality
// alert (see auditBioOutsideBalcao), not part of the ranking.
import { classifyBio } from './classification';
import type { BioGroupKey } from './classification';
import type { BioGroupsProducts, BioWeights, Collaborator, Sale } from './types';

export const BALCAO_SETOR = 'Balcão';

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
): BioSummaryRow[] {
  const balcao = collaborators.filter((c) => c.setor === BALCAO_SETOR);
  const map: Record<string, BioSummaryRow> = {};
  balcao.forEach((c) => {
    map[c.matricula] = {
      matricula: c.matricula,
      nome: c.nome,
      apelido: c.apelido || c.nome,
      foto: c.foto,
      qtd: { G1: 0, G2: 0, G3: 0, G4: 0 },
      pontos: 0,
      itens: 0,
    };
  });

  sales.forEach((s) => {
    if (fromDate && s.dataISO && s.dataISO < fromDate) return;
    if (toDate && s.dataISO && s.dataISO > toDate) return;
    if (!map[s.matricula]) return; // BIO only counts Balcão-sector collaborators
    const g = classifyBio(s.produto, bioGroups);
    if (!g) return;
    if (groupFilter && groupFilter !== 'ALL' && g !== groupFilter) return;
    const qtd = Number(s.qtd) || 0;
    map[s.matricula].qtd[g] += qtd;
    map[s.matricula].pontos += qtd * (Number(bioWeights[g]) || 0);
    map[s.matricula].itens += qtd;
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

/** Flags G1-G4 sales recorded by collaborators outside the Balcão sector. */
export function auditBioOutsideBalcao(
  sales: Sale[],
  collaborators: Collaborator[],
  bioGroups: BioGroupsProducts,
): BioOutsideAlert[] {
  const byMatricula = new Map(collaborators.map((c) => [c.matricula, c]));
  const alerts: BioOutsideAlert[] = [];
  sales.forEach((s) => {
    const g = classifyBio(s.produto, bioGroups);
    if (!g) return;
    const collaborator = byMatricula.get(s.matricula);
    if (collaborator && collaborator.setor === BALCAO_SETOR) return;
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
