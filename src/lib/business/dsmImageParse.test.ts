import { describe, expect, it } from 'vitest';
import { buildDsmReviewRowsFromImage, detectDateInText, parseDsmImageLines } from './dsmImageParse';

describe('parseDsmImageLines', () => {
  it('parses a typical OCR line into matrícula, nome and the trailing quantidade', () => {
    const [row] = parseDsmImageLines('70208345-DEIVESON RAMOS PAIVA 1.540 56.955,35 126');
    expect(row).toMatchObject({ matricula: '70208345', nome: 'DEIVESON RAMOS PAIVA', quantidade: 126 });
  });

  it('strips leading zeros from the matrícula, same as the planilha path', () => {
    const [row] = parseDsmImageLines('070208345-FULANO DA SILVA 10 200,00 3');
    expect(row.matricula).toBe('70208345');
  });

  it('tolerates a space around the dash', () => {
    const [row] = parseDsmImageLines('70003335 - JACOB JURANDIR DE LIMA TELES 1.213 148.533,79 145');
    expect(row).toMatchObject({ matricula: '70003335', nome: 'JACOB JURANDIR DE LIMA TELES', quantidade: 145 });
  });

  it('captures a NÃO IDENTIFICADO line with an empty matrícula', () => {
    const [row] = parseDsmImageLines('NÃO IDENTIFICADO 1.626 31.000,16 7');
    expect(row).toMatchObject({ matricula: '', nome: 'NÃO IDENTIFICADO', quantidade: 7 });
  });

  it('skips a totals line', () => {
    const rows = parseDsmImageLines('70208345-DEIVESON RAMOS PAIVA 1 2 3\nTOTAL GERAL 11.820 804.664,39 1124');
    expect(rows).toHaveLength(1);
  });

  it('skips blank lines and unrecognizable noise', () => {
    const rows = parseDsmImageLines('\n   \nEmpreendimentos Pague Menos\nVendas por vendedor\n');
    expect(rows).toHaveLength(0);
  });

  it('returns quantidade: null when a matched line has no trailing number, without dropping the row', () => {
    const [row] = parseDsmImageLines('70208345-DEIVESON RAMOS PAIVA');
    expect(row).toMatchObject({ matricula: '70208345', nome: 'DEIVESON RAMOS PAIVA', quantidade: null });
  });

  it('parses several real-shaped lines from the same report at once', () => {
    const text = [
      'Loja Matrícula - Nome funcionário Data',
      'NÃO IDENTIFICADO 1.626 31.000,16 7',
      '70208345-DEIVESON RAMOS PAIVA 1.540 56.955,35 126',
      '70209751-ANGELICA CRHYSTINA DE FATIMA... 1.531 90.111,51 166',
      '70003335-JACOB JURANDIR DE LIMA TELES 1.213 148.533,79 145',
    ].join('\n');
    const rows = parseDsmImageLines(text);
    expect(rows.map((r) => [r.matricula, r.quantidade])).toEqual([
      ['', 7],
      ['70208345', 126],
      ['70209751', 166],
      ['70003335', 145],
    ]);
  });
});

describe('detectDateInText', () => {
  it('finds a DD/MM/AAAA date anywhere in the text', () => {
    expect(detectDateInText('Relatório gerado em 23/09/2026 às 14h')).toBe('2026-09-23');
  });

  it('accepts a 2-digit year', () => {
    expect(detectDateInText('01/09/26')).toBe('2026-09-01');
  });

  it('returns null when no plausible date is present', () => {
    expect(detectDateInText('70208345-DEIVESON RAMOS PAIVA 1.540 56.955,35 126')).toBeNull();
  });

  it('rejects an out-of-range day/month', () => {
    expect(detectDateInText('99/99/2026')).toBeNull();
  });
});

describe('buildDsmReviewRowsFromImage', () => {
  it('applies the single chosen date to every row and resolves colaboradores by matrícula', () => {
    const matches = parseDsmImageLines('70208345-DEIVESON RAMOS PAIVA 1.540 56.955,35 126\nNÃO IDENTIFICADO 1.626 31.000,16 7');
    const byMatricula = new Map([['70208345', { id: 'collab-1' }]]);
    const rows = buildDsmReviewRowsFromImage(matches, '2026-09-23', byMatricula);
    expect(rows).toEqual([
      expect.objectContaining({ collaboratorId: 'collab-1', dataISO: '2026-09-23', quantidade: 126 }),
      expect.objectContaining({ collaboratorId: null, dataISO: '2026-09-23', quantidade: 7 }),
    ]);
  });

  it('defaults quantidade to 0 (not saved until the ADM fills it in) when a line had no trailing number', () => {
    const matches = parseDsmImageLines('70208345-DEIVESON RAMOS PAIVA');
    const rows = buildDsmReviewRowsFromImage(matches, '2026-09-23', new Map());
    expect(rows[0].quantidade).toBe(0);
  });
});
