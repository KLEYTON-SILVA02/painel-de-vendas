process.env.TZ = 'UTC';
import { describe, expect, it } from 'vitest';
import {
  computeMetaDiariaRedistribuida,
  diasRestantesNoMes,
  effectiveMetaGeral,
  effectiveMetaGeralFromTotals,
  getGoal,
  getSuperMeta,
  goalProration,
} from './goals';
import type { CategoryTotalRow } from './summary';
import type { Collaborator, Goal, Sale } from './types';

const collaborators: Collaborator[] = [
  { id: '1', matricula: 'M1', nome: 'Ana', apelido: 'Ana', foto: null, setor: 'Balcão', metaIndividual: 0 },
];

const salesAugust: Sale[] = [
  { id: 's1', dataISO: '2026-08-01', matricula: 'M1', vendedor: 'Ana', produto: 'A', qtd: 1, valor: 300, grupo: 'MER' },
  { id: 's2', dataISO: '2026-08-05', matricula: 'M1', vendedor: 'Ana', produto: 'B', qtd: 1, valor: 400, grupo: 'MER' },
  { id: 's3', dataISO: '2026-08-09', matricula: 'M1', vendedor: 'Ana', produto: 'C', qtd: 1, valor: 100, grupo: 'MER' },
  { id: 's4', dataISO: '2026-08-10', matricula: 'M1', vendedor: 'Ana', produto: 'D', qtd: 1, valor: 200, grupo: 'MER' },
  { id: 's5', dataISO: '2026-08-15', matricula: 'M1', vendedor: 'Ana', produto: 'E (after today)', qtd: 1, valor: 999, grupo: 'MER' },
];

const now = new Date(2026, 7, 10, 12, 0, 0); // Aug 10 2026, noon

describe('diasRestantesNoMes', () => {
  it('counts remaining days including today, up to and including the last day of month', () => {
    expect(diasRestantesNoMes(now)).toBe(21); // Aug 10 12:00 -> Aug 31 00:00 = 20.5 days, ceil = 21
  });
});

describe('computeMetaDiariaRedistribuida', () => {
  it('divides the remaining goal (target - realized this month so far) by days remaining', () => {
    const goal: Goal = {
      categoria: 'MER', mensal: 3100, diaria: 0, metrica: 'valor',
      autoRedistribuir: true, superMeta: 0, superMetaAuto: false,
    };
    // realized through "today" (inclusive) = 300+400+100+200 = 1000; the Aug 15 sale is future and excluded
    const daily = computeMetaDiariaRedistribuida(goal, salesAugust, collaborators, 'mensal', now);
    expect(daily).toBeCloseTo((3100 - 1000) / 21);
    expect(daily).toBeCloseTo(100);
  });

  it('returns 0 when the target is not set', () => {
    const goal: Goal = {
      categoria: 'MER', mensal: 0, diaria: 0, metrica: 'valor',
      autoRedistribuir: true, superMeta: 0, superMetaAuto: false,
    };
    expect(computeMetaDiariaRedistribuida(goal, salesAugust, collaborators, 'mensal', now)).toBe(0);
  });

  it('never returns a value below 0 even if the goal was already exceeded', () => {
    const goal: Goal = {
      categoria: 'MER', mensal: 500, diaria: 0, metrica: 'valor',
      autoRedistribuir: true, superMeta: 0, superMetaAuto: false,
    };
    expect(computeMetaDiariaRedistribuida(goal, salesAugust, collaborators, 'mensal', now)).toBe(0);
  });

  it('counts every sale toward MER regardless of grupo, same as everywhere else MER means the store total', () => {
    // Regression for a bug where "já vendido este mês" only summed sales
    // literally tagged grupo === 'MER', undercounting the loja's real total
    // (which also includes DERM/GEN/MP sales) and inflating the
    // redistributed daily goal as a result.
    const mixedSales: Sale[] = [
      { id: 's1', dataISO: '2026-08-01', matricula: 'M1', vendedor: 'Ana', produto: 'A', qtd: 1, valor: 300, grupo: 'MER' },
      { id: 's2', dataISO: '2026-08-05', matricula: 'M1', vendedor: 'Ana', produto: 'B', qtd: 1, valor: 400, grupo: 'DERM' },
      { id: 's3', dataISO: '2026-08-09', matricula: 'M1', vendedor: 'Ana', produto: 'C', qtd: 1, valor: 100, grupo: 'GEN' },
      { id: 's4', dataISO: '2026-08-10', matricula: 'M1', vendedor: 'Ana', produto: 'D', qtd: 1, valor: 200, grupo: 'MP' },
    ];
    const goal: Goal = {
      categoria: 'MER', mensal: 3100, diaria: 0, metrica: 'valor',
      autoRedistribuir: true, superMeta: 0, superMetaAuto: false,
    };
    // realized through "today" (inclusive), all grupos = 300+400+100+200 = 1000
    const daily = computeMetaDiariaRedistribuida(goal, mixedSales, collaborators, 'mensal', now);
    expect(daily).toBeCloseTo((3100 - 1000) / 21);
    expect(daily).toBeCloseTo(100);
  });
});

describe('getGoal / getSuperMeta', () => {
  const goal: Goal = {
    categoria: 'MER', mensal: 3100, diaria: 150, metrica: 'valor',
    autoRedistribuir: true, superMeta: 4000, superMetaAuto: false,
  };

  it('uses the redistributed value for "dia" mode when autoRedistribuir is on', () => {
    expect(getGoal(goal, 'dia', salesAugust, collaborators, undefined, now)).toBeCloseTo(100);
  });
  it('uses the stored monthly value for "mes" mode regardless of autoRedistribuir', () => {
    expect(getGoal(goal, 'mes', salesAugust, collaborators, undefined, now)).toBe(3100);
  });
  it('super meta uses the stored value when superMetaAuto is off', () => {
    expect(getSuperMeta(goal, 'dia', salesAugust, collaborators, undefined, now)).toBe(4000);
  });
});

describe('goalProration', () => {
  it('returns undefined for a single day', () => {
    expect(goalProration('2026-08-10', '2026-08-10', false)).toBeUndefined();
  });
  it('returns undefined for modoGeral (the whole calendar month)', () => {
    expect(goalProration('2026-08-01', '2026-08-31', true)).toBeUndefined();
  });
  it('returns undefined when the selected range already spans the whole month', () => {
    expect(goalProration('2026-08-01', '2026-08-31', false)).toBeUndefined();
  });
  it('computes {periodDays, monthDays} for a custom multi-day range', () => {
    expect(goalProration('2026-08-01', '2026-08-05', false)).toEqual({ periodDays: 5, monthDays: 31 });
  });
});

describe('getGoal / getSuperMeta with proration', () => {
  const goal: Goal = {
    categoria: 'MER', mensal: 3100, diaria: 150, metrica: 'valor',
    autoRedistribuir: false, superMeta: 4000, superMetaAuto: false,
  };
  const proration = { periodDays: 5, monthDays: 31 };

  it('prorates the monthly goal by periodDays/monthDays in "mes" mode', () => {
    expect(getGoal(goal, 'mes', salesAugust, collaborators, proration, now)).toBeCloseTo((3100 * 5) / 31);
  });
  it('prorates the super meta the same way', () => {
    expect(getSuperMeta(goal, 'mes', salesAugust, collaborators, proration, now)).toBeCloseTo((4000 * 5) / 31);
  });
  it('does not prorate in "dia" mode', () => {
    expect(getGoal(goal, 'dia', salesAugust, collaborators, proration, now)).toBe(150);
  });
});

describe('effectiveMetaGeral', () => {
  it('prioritizes the MER goal over the fallback', () => {
    const goals = {
      MER: { categoria: 'MER', mensal: 3100, diaria: 0, metrica: 'valor', autoRedistribuir: false, superMeta: 0, superMetaAuto: false } as Goal,
    } as Record<'DERM' | 'GEN' | 'MP' | 'MER', Goal | undefined>;
    expect(effectiveMetaGeral(goals, 'mes', salesAugust, collaborators, 43000, undefined, now)).toBe(3100);
  });

  it('falls back to metaGeralFallback in month mode when MER goal is unset', () => {
    const goals = {} as Record<'DERM' | 'GEN' | 'MP' | 'MER', Goal | undefined>;
    expect(effectiveMetaGeral(goals, 'mes', salesAugust, collaborators, 43000, undefined, now)).toBe(43000);
  });

  it('falls back to 0 (not the fallback) in day mode when MER goal is unset', () => {
    const goals = {} as Record<'DERM' | 'GEN' | 'MP' | 'MER', Goal | undefined>;
    expect(effectiveMetaGeral(goals, 'dia', salesAugust, collaborators, 43000, undefined, now)).toBe(0);
  });

  it('prorates the fallback too when in a custom period', () => {
    const goals = {} as Record<'DERM' | 'GEN' | 'MP' | 'MER', Goal | undefined>;
    const proration = { periodDays: 5, monthDays: 31 };
    expect(effectiveMetaGeral(goals, 'mes', salesAugust, collaborators, 43000, proration, now)).toBeCloseTo((43000 * 5) / 31);
  });
});

describe('effectiveMetaGeralFromTotals', () => {
  // MER maps to the 'ALL' catch-all bucket (same convention as the RPC
  // itself and computeMetaDiariaRedistribuidaFromTotals's own doc comment)
  // — a categoria: 'MER' row here would never be read by these MER-goal
  // assertions.
  const monthToDateRows: CategoryTotalRow[] = [
    { matricula: 'M1', categoria: 'ALL', valorTotal: 1000, itensTotal: 4 },
  ];

  it('prioritizes the MER goal over the fallback, same as the sales-based version', () => {
    const goals = {
      MER: { categoria: 'MER', mensal: 3100, diaria: 0, metrica: 'valor', autoRedistribuir: false, superMeta: 0, superMetaAuto: false } as Goal,
    } as Record<'DERM' | 'GEN' | 'MP' | 'MER', Goal | undefined>;
    expect(effectiveMetaGeralFromTotals(goals, 'mes', monthToDateRows, collaborators, 43000, undefined, now)).toBe(3100);
  });

  it('falls back to metaGeralFallback in month mode when MER goal is unset', () => {
    const goals = {} as Record<'DERM' | 'GEN' | 'MP' | 'MER', Goal | undefined>;
    expect(effectiveMetaGeralFromTotals(goals, 'mes', monthToDateRows, collaborators, 43000, undefined, now)).toBe(43000);
  });

  it('falls back to 0 (not the fallback) in day mode when MER goal is unset', () => {
    const goals = {} as Record<'DERM' | 'GEN' | 'MP' | 'MER', Goal | undefined>;
    expect(effectiveMetaGeralFromTotals(goals, 'dia', monthToDateRows, collaborators, 43000, undefined, now)).toBe(0);
  });

  it('redistributes the MER daily goal from month-to-date totals when autoRedistribuir is on', () => {
    const goals = {
      MER: { categoria: 'MER', mensal: 3100, diaria: 0, metrica: 'valor', autoRedistribuir: true, superMeta: 0, superMetaAuto: false } as Goal,
    } as Record<'DERM' | 'GEN' | 'MP' | 'MER', Goal | undefined>;
    // Aug 10 2026 noon -> 21 dias restantes (same as the sales-based suite above).
    expect(effectiveMetaGeralFromTotals(goals, 'dia', monthToDateRows, collaborators, 43000, undefined, now)).toBeCloseTo((3100 - 1000) / 21);
  });
});
