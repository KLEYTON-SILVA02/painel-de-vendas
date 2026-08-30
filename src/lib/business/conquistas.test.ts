import { describe, expect, it } from 'vitest';
import { computeConquistas, computeConquistasDayGallery } from './conquistas';
import type { Collaborator, Sale } from './types';

const collaborators: Collaborator[] = [
  { id: '1', matricula: 'M1', nome: 'Ana', apelido: 'Ana', foto: null, setor: 'Balcão', metaIndividual: 0 },
  { id: '2', matricula: 'M2', nome: 'Bruno', apelido: 'Bruno', foto: null, setor: 'Caixa', metaIndividual: 0 },
  { id: '3', matricula: 'M3', nome: 'Carla', apelido: 'Carla', foto: null, setor: 'Balcão', metaIndividual: 0 },
];

const sales: Sale[] = [
  { id: 's1', dataISO: '2026-08-01', matricula: 'M1', vendedor: 'Ana', produto: 'A', qtd: 1, valor: 1500, grupo: 'DERM' },
  { id: 's2', dataISO: '2026-08-02', matricula: 'M2', vendedor: 'Bruno', produto: 'B', qtd: 1, valor: 4000, grupo: 'DERM' },
  { id: 's3', dataISO: '2026-08-03', matricula: 'M3', vendedor: 'Carla', produto: 'C', qtd: 1, valor: 300, grupo: 'DERM' },
];

describe('computeConquistas', () => {
  it('assigns the highest fixed tier reached and excludes those below every tier and super meta', () => {
    const rows = computeConquistas(sales, collaborators, '2026-08-01', '2026-08-31', 'DERM', {});
    expect(rows.map((r) => r.matricula)).toEqual(['M2', 'M1']); // Carla's 300 hits nothing
    expect(rows.find((r) => r.matricula === 'M2')!.tier).toBe(3000); // 4000 >= 3000 tier, < 5000
    expect(rows.find((r) => r.matricula === 'M1')!.tier).toBe(1000);
  });

  it('includes someone under every fixed tier if their own Super Meta Individual was reached', () => {
    const rows = computeConquistas(sales, collaborators, '2026-08-01', '2026-08-31', 'DERM', { M3: 250 });
    const carla = rows.find((r) => r.matricula === 'M3');
    expect(carla).toBeDefined();
    expect(carla!.tier).toBe(0);
    expect(carla!.bateuSuper).toBe(true);
    expect(carla!.superMeta).toBe(250);
  });

  it('does not flag bateuSuper when the super meta is set but not reached', () => {
    const rows = computeConquistas(sales, collaborators, '2026-08-01', '2026-08-31', 'DERM', { M3: 1000 });
    expect(rows.find((r) => r.matricula === 'M3')).toBeUndefined();
  });

  it('caps at the top 10 sorted by valor desc', () => {
    const many: Collaborator[] = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      matricula: `X${i}`,
      nome: `V${i}`,
      apelido: `V${i}`,
      foto: null,
      setor: 'Balcão',
      metaIndividual: 0,
    }));
    const manySales: Sale[] = many.map((c, i) => ({
      id: `s${i}`,
      dataISO: '2026-08-01',
      matricula: c.matricula,
      vendedor: c.nome,
      produto: 'X',
      qtd: 1,
      valor: 1000 + i * 100,
      grupo: 'DERM',
    }));
    const rows = computeConquistas(manySales, many, '2026-08-01', '2026-08-31', 'DERM', {});
    expect(rows).toHaveLength(10);
    expect(rows[0].matricula).toBe('X11'); // highest valor first
  });
});

describe('computeConquistasDayGallery', () => {
  it('lists every day in range newest-first with that day\'s achiever count', () => {
    const gallery = computeConquistasDayGallery(sales, collaborators, '2026-08-01', '2026-08-03', 'DERM', {});
    expect(gallery.map((d) => d.dia)).toEqual(['2026-08-03', '2026-08-02', '2026-08-01']);
    expect(gallery.find((d) => d.dia === '2026-08-02')!.count).toBe(1); // Bruno's 4000
    expect(gallery.find((d) => d.dia === '2026-08-03')!.count).toBe(0); // Carla's 300 alone hits nothing
  });
});
