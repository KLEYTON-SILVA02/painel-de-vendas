// DSM (Desconto Só Meu) Fase 4 — ranking próprio, calculado sobre
// dsm_records (não sales, ver 0087_dsm_records.sql): soma de `quantidade`
// por colaborador no período, sem filtro de setor (qualquer colaborador
// cadastrado pode aparecer aqui — diferente de BIOSINTÉTICA/Balcão).
import { firstName } from './normalize';
import { normalizeMatricula } from './parsing';
import type { Collaborator, DsmRecord } from './types';

export interface DsmSummaryRow {
  matricula: string;
  nome: string;
  apelido: string;
  foto: string | null;
  conversoes: number;
}

export function computeDsmSummary(
  records: DsmRecord[],
  collaborators: Collaborator[],
  fromDate: string | null,
  toDate: string | null,
): DsmSummaryRow[] {
  const map: Record<string, DsmSummaryRow> = {};
  const collaboratorsById = new Map(collaborators.map((c) => [c.id, c]));

  records.forEach((r) => {
    if (fromDate && r.dataISO < fromDate) return;
    if (toDate && r.dataISO > toDate) return;
    const c = collaboratorsById.get(r.collaboratorId);
    if (!c) return; // colaborador removido depois da importação
    const key = normalizeMatricula(c.matricula);
    if (!map[key]) {
      map[key] = { matricula: c.matricula, nome: c.nome, apelido: c.apelido || firstName(c.nome), foto: c.foto, conversoes: 0 };
    }
    map[key].conversoes += r.quantidade;
  });

  return Object.values(map)
    .filter((r) => r.conversoes > 0)
    .sort((a, b) => b.conversoes - a.conversoes);
}
