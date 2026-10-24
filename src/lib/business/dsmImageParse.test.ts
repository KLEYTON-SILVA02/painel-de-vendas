import { describe, expect, it } from 'vitest';
import {
  buildCleanDsmImageText,
  buildDsmReviewRowsFromImage,
  computeDsmImageMatches,
  detectDateInText,
  parseDsmImageLines,
  parseDsmImageLinesByCollaboratorName,
} from './dsmImageParse';

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

  it('picks the plain-integer "Número de Clientes" column, not a trailing "Número de Clientes(%)" column', () => {
    // O relatório às vezes mostra a % logo depois da contagem real — pegar
    // "o último número da linha" pegaria essa % por engano.
    const [row] = parseDsmImageLines('70208345-DEIVESON RAMOS PAIVA 1.540 56.955,35 126 18,50%');
    expect(row.quantidade).toBe(126);
  });

  it('still picks the correct column when the OCR drops the "%" symbol but keeps the decimal comma', () => {
    const [row] = parseDsmImageLines('70208345-DEIVESON RAMOS PAIVA 1.540 56.955,35 126 18,50');
    expect(row.quantidade).toBe(126);
  });

  it('ignora um prefixo espúrio antes da matrícula (célula "Loja" mesclada grudada na 1ª linha pelo OCR)', () => {
    const [row] = parseDsmImageLines('567152 70209751-ANGELICA CHRYSTINA DE FATIMA 1.455 84.079,41 74 5,09%');
    expect(row).toMatchObject({ matricula: '70209751', nome: 'ANGELICA CHRYSTINA DE FATIMA', quantidade: 74 });
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

describe('parseDsmImageLinesByCollaboratorName', () => {
  const colaboradores = [
    { nome: 'DEIVESON RAMOS PAIVA', matricula: '70208345' },
    { nome: 'JACOB JURANDIR DE LIMA TELES', matricula: '70003335' },
  ];

  it('finds a colaborador by nome even when the matrícula prefix is unreadable, and reads the trailing number', () => {
    // OCR garbled the leading matrícula into noise, but the nome itself
    // still reads fine — this is exactly the case the strict matrícula-dash
    // pattern silently drops.
    const text = '7O2O8_45 DEIVESON RAMOS PAIVA 1.540 56.955,35 126';
    const rows = parseDsmImageLinesByCollaboratorName(text, colaboradores, new Set());
    expect(rows).toEqual([
      expect.objectContaining({ matricula: '70208345', nome: 'DEIVESON RAMOS PAIVA', quantidade: 126, matchedBy: 'nome' }),
    ]);
  });

  it('is accent/case-insensitive when matching the registered nome against the OCR text', () => {
    const text = 'jacob jurandir de lima teles 1.213 148.533,79 145';
    const rows = parseDsmImageLinesByCollaboratorName(text, colaboradores, new Set());
    expect(rows).toEqual([expect.objectContaining({ matricula: '70003335', quantidade: 145 })]);
  });

  it('skips a colaborador already resolved by the first pass', () => {
    const text = '70208345-DEIVESON RAMOS PAIVA 1.540 56.955,35 126';
    const alreadyMatched = new Set(['70208345']);
    const rows = parseDsmImageLinesByCollaboratorName(text, colaboradores, alreadyMatched);
    expect(rows).toHaveLength(0);
  });

  it('finds multiple colaboradores missed by the first pass in the same text', () => {
    const text = ['DEIVESON RAMOS PAIVA 1.540 56.955,35 126', 'JACOB JURANDIR DE LIMA TELES 1.213 148.533,79 145'].join('\n');
    const rows = parseDsmImageLinesByCollaboratorName(text, colaboradores, new Set());
    expect(rows.map((r) => [r.matricula, r.quantidade])).toEqual([
      ['70208345', 126],
      ['70003335', 145],
    ]);
  });

  it('also skips a trailing "Número de Clientes(%)" column when matching by nome', () => {
    const text = 'DEIVESON RAMOS PAIVA 1.540 56.955,35 126 18,50%';
    const rows = parseDsmImageLinesByCollaboratorName(text, colaboradores, new Set());
    expect(rows[0].quantidade).toBe(126);
  });

  it('returns nothing when no registered nome appears in the text', () => {
    const rows = parseDsmImageLinesByCollaboratorName('TOTAL GERAL 11.820 804.664,39 1124', colaboradores, new Set());
    expect(rows).toHaveLength(0);
  });
});

describe('buildDsmReviewRowsFromImage: fonte flag', () => {
  it('propagates matchedBy as fonte only for second-pass matches', () => {
    const primary = parseDsmImageLines('70208345-DEIVESON RAMOS PAIVA 1.540 56.955,35 126');
    const secondPass = parseDsmImageLinesByCollaboratorName(
      'JACOB JURANDIR DE LIMA TELES 1.213 148.533,79 145',
      [{ nome: 'JACOB JURANDIR DE LIMA TELES', matricula: '70003335' }],
      new Set(),
    );
    const rows = buildDsmReviewRowsFromImage([...primary, ...secondPass], '2026-09-23', new Map());
    expect(rows[0].fonte).toBeUndefined();
    expect(rows[1].fonte).toBe('nome');
  });
});

describe('computeDsmImageMatches + buildCleanDsmImageText', () => {
  const colaboradores = [
    { nome: 'DEIVESON RAMOS PAIVA', matricula: '70208345' },
    { nome: 'JACOB JURANDIR DE LIMA TELES', matricula: '70003335' },
  ];

  it('mescla 1ª leitura + 2ª leitura por nome + confirmação por coluna, sem sobrescrever valor já lido', () => {
    const text = [
      '70208345-DEIVESON RAMOS PAIVA 1.540 56.955,35 126', // já tem quantidade — coluna nunca sobrescreve
      'JACOB JURANDIR DE LIMA TELES', // só o nome, sem matrícula nem número — achado pela 2ª leitura, sem quantidade
    ].join('\n');
    const columnMatches = new Map([
      ['70208345', 999], // nunca deve aparecer — já tinha 126
      ['70003335', 145], // preenche o buraco da 2ª leitura por nome
    ]);
    const matches = computeDsmImageMatches(text, colaboradores, columnMatches);
    expect(matches[0]).toMatchObject({ matricula: '70208345', quantidade: 126 });
    expect(matches[0].matchedBy).toBeUndefined();
    expect(matches[1]).toMatchObject({ matricula: '70003335', quantidade: 145, matchedBy: 'coluna' });
  });

  it('reconstrói um texto limpo, sem nenhuma das outras colunas/cabeçalhos do OCR bruto', () => {
    const rawText = [
      'Empreendimentos Pague Menos — Vendas por vendedor',
      'Loja Matrícula - Nome funcionário Data Número de Vendas Valor das Vendas (R$) Número de Clientes Número de Clientes(%)',
      '70208345-DEIVESON RAMOS PAIVA 1.540 56.955,35 126 18,50%',
      'TOTAL GERAL 11.820 804.664,39 1124',
    ].join('\n');
    const matches = computeDsmImageMatches(rawText, [], null);
    const cleanText = buildCleanDsmImageText(matches);
    expect(cleanText).toBe('70208345-DEIVESON RAMOS PAIVA  126');
    // Round-trip sem perdas (exceto lineRaw, que é literalmente o texto cru
    // de origem — naturalmente diferente antes/depois da reconstrução).
    const strip = (ms: typeof matches) => ms.map(({ lineRaw: _lineRaw, ...rest }) => rest);
    expect(strip(computeDsmImageMatches(cleanText, [], null))).toEqual(strip(matches));
  });

  it('mantém uma linha sem quantidade reconhecida sem inventar um número', () => {
    const matches = computeDsmImageMatches('70208345-DEIVESON RAMOS PAIVA', [], null);
    const cleanText = buildCleanDsmImageText(matches);
    expect(cleanText).toBe('70208345-DEIVESON RAMOS PAIVA');
    expect(computeDsmImageMatches(cleanText, [], null)[0].quantidade).toBeNull();
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
