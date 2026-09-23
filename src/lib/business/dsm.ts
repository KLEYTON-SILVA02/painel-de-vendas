// DSM (Desconto Só Meu) Fase 4 — ranking próprio, calculado sobre
// dsm_records (não sales, ver 0087_dsm_records.sql): soma de `quantidade`
// por colaborador no período, sem filtro de setor (qualquer colaborador
// cadastrado pode aparecer aqui — diferente de BIOSINTÉTICA/Balcão).
import type { ConquistaRow } from './conquistas';
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

function bucketDsmByDay(records: DsmRecord[], fromDate: string, toDate: string): Map<string, DsmRecord[]> {
  const byDay = new Map<string, DsmRecord[]>();
  records.forEach((r) => {
    if (r.dataISO < fromDate || r.dataISO > toDate) return;
    const bucket = byDay.get(r.dataISO);
    if (bucket) bucket.push(r);
    else byDay.set(r.dataISO, [r]);
  });
  return byDay;
}

/** Galeria de Conquistas support for DSM — same shape as conquistas.ts's
 * fixed/generic categories (a ConquistaRow per achiever), but scored over
 * dsm_records instead of sales: DSM has no R$/unit tier ladder at all
 * (same reasoning as isUnitConquista for LEVMEL/CHIP), so any day with at
 * least one conversion is itself the achievement, tier = that day's
 * conversion count, best single day wins (never summed across a "Modo
 * Geral" range). `itens`/`valor` are both set to the conversion count so
 * the row satisfies ConquistaRow's shape without a DSM-specific field. */
export function computeDsmConquistas(records: DsmRecord[], collaborators: Collaborator[], fromDate: string, toDate: string): ConquistaRow[] {
  const collaboratorsById = new Map(collaborators.map((c) => [c.id, c]));
  const recordsByDay = bucketDsmByDay(records, fromDate, toDate);
  const bestByMatricula = new Map<string, ConquistaRow>();

  for (let d = new Date(`${fromDate}T00:00:00`); d.toISOString().slice(0, 10) <= toDate; d.setDate(d.getDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    const dayRecords = recordsByDay.get(day);
    if (!dayRecords) continue;
    const dayTotals = new Map<string, number>();
    dayRecords.forEach((r) => {
      dayTotals.set(r.collaboratorId, (dayTotals.get(r.collaboratorId) ?? 0) + r.quantidade);
    });
    dayTotals.forEach((tier, collaboratorId) => {
      if (tier <= 0) return;
      const c = collaboratorsById.get(collaboratorId);
      if (!c) return;
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
  }

  return Array.from(bestByMatricula.values()).sort((a, b) => b.tier - a.tier);
}

/** Sidebar "Galeria de dias" for DSM — one entry per day in range, newest
 * first, with how many collaborators had at least one conversion that day. */
export function computeDsmConquistasDayGallery(
  records: DsmRecord[],
  collaborators: Collaborator[],
  fromDate: string,
  toDate: string,
): { dia: string; count: number }[] {
  const collaboratorsById = new Map(collaborators.map((c) => [c.id, c]));
  const recordsByDay = bucketDsmByDay(records, fromDate, toDate);

  const days: string[] = [];
  for (let d = new Date(`${fromDate}T00:00:00`); d.toISOString().slice(0, 10) <= toDate; d.setDate(d.getDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days.reverse().map((dia) => {
    const dayRecords = recordsByDay.get(dia);
    if (!dayRecords) return { dia, count: 0 };
    const achievers = new Set<string>();
    dayRecords.forEach((r) => {
      if (r.quantidade > 0 && collaboratorsById.has(r.collaboratorId)) achievers.add(r.collaboratorId);
    });
    return { dia, count: achievers.size };
  });
}
