import { describe, expect, it } from 'vitest';
import type { Block } from 'tesseract.js';
import { detectClientesColumnValues, findClientesColumnCropRange, matchColumnLinesToRows } from './dsmImageColumns';

// Fixture mínimo no mesmo formato que o Tesseract devolve quando
// lib/ocr.ts pede `{ blocks: true }` — só os campos que
// detectClientesColumnValues de fato lê (bbox de cada palavra); o resto do
// shape de Block/Paragraph/Line/Word é preenchido com valores neutros.
function word(text: string, x0: number, x1: number, y0 = 0) {
  return { text, bbox: { x0, y0, x1, y1: y0 + 10 }, symbols: [], choices: [], confidence: 90, font_name: '' };
}
function line(words: ReturnType<typeof word>[], y0 = 0) {
  return {
    text: words.map((w) => w.text).join(' '),
    words,
    confidence: 90,
    baseline: { x0: 0, y0, x1: 0, y1: y0 },
    rowAttributes: { ascenders: 0, descenders: 0, rowHeight: 10 },
    bbox: { x0: words[0]?.bbox.x0 ?? 0, y0, x1: words.at(-1)?.bbox.x1 ?? 0, y1: y0 + 10 },
  };
}
function blocksFixture(lines: ReturnType<typeof line>[]): Block[] {
  return [
    {
      paragraphs: [{ lines, text: '', confidence: 90, bbox: { x0: 0, y0: 0, x1: 0, y1: 0 }, is_ltr: true }],
      text: '',
      confidence: 90,
      bbox: { x0: 0, y0: 0, x1: 0, y1: 0 },
      blocktype: '',
      page: undefined as never,
    },
  ] as unknown as Block[];
}

describe('detectClientesColumnValues', () => {
  it('lê a coluna "Número de Clientes" pela posição, ignorando Vendas/Valor/Clientes(%)', () => {
    // Cabeçalho: Vendas(x=100) Valor(x=200) Clientes(x=300) Clientes(%)(x=420, com "%" por perto)
    const header = line(
      [word('Vendas', 90, 110, 0), word('Valor', 190, 210, 0), word('Clientes', 290, 310, 0), word('Clientes(%)', 400, 440, 0)],
      0,
    );
    // Linha de colaborador: matrícula+nome, depois vendas=1455, valor=84079, clientes=74 (perto de x=300), %=5 (perto de x=420)
    const row1 = line(
      [
        word('70209751-ANGELICA', 0, 80, 20),
        word('1455', 90, 110, 20),
        word('84079', 190, 215, 20),
        word('74', 295, 305, 20),
        word('5', 415, 425, 20),
      ],
      20,
    );
    const row2 = line(
      [word('70208345-DEIVESON', 0, 80, 40), word('1029', 90, 110, 40), word('34595', 190, 215, 40), word('32', 295, 305, 40)],
      40,
    );
    const result = detectClientesColumnValues(blocksFixture([header, row1, row2]));
    expect(result.get('70209751')).toBe(74);
    expect(result.get('70208345')).toBe(32);
  });

  it('nunca confunde o próprio número da matrícula com a contagem de clientes', () => {
    const header = line([word('Clientes', 290, 310, 0)], 0);
    // Só a matrícula e um número perto da coluna "Clientes" — sem ruído de outras colunas.
    const row = line([word('1234-FULANO', 0, 60, 20), word('10', 295, 305, 20)], 20);
    const result = detectClientesColumnValues(blocksFixture([header, row]));
    expect(result.get('1234')).toBe(10);
  });

  it('devolve mapa vazio (nunca usa a coluna de % por engano) quando só reconhece "Clientes(%)", sem nenhum "Clientes" sozinho', () => {
    // Cabeçalho mesclado/complexo onde o OCR só recupera a palavra com "%"
    // — nunca deve tratar a posição dela como se fosse a de contagem.
    const header = line([word('Clientes(%)', 400, 440, 0)], 0);
    const row = line([word('70209751-ANGELICA', 0, 80, 20), word('74', 295, 305, 20), word('5', 415, 425, 20)], 20);
    const result = detectClientesColumnValues(blocksFixture([header, row]));
    expect(result.size).toBe(0);
  });

  it('devolve mapa vazio quando não acha cabeçalho "Clientes" nenhum', () => {
    const row = line([word('70209751-ANGELICA', 0, 80, 20), word('74', 295, 305, 20)], 20);
    const result = detectClientesColumnValues(blocksFixture([row]));
    expect(result.size).toBe(0);
  });

  it('corrige confusão de OCR entre letra e dígito no valor da coluna ("7a" → 74, mesmo bug da leitura por texto)', () => {
    const header = line([word('Clientes', 290, 310, 0)], 0);
    const row = line([word('70209751-ANGELICA', 0, 80, 20), word('7a', 295, 305, 20)], 20);
    const result = detectClientesColumnValues(blocksFixture([header, row]));
    expect(result.get('70209751')).toBe(74);
  });

  it('devolve mapa vazio para blocks null', () => {
    expect(detectClientesColumnValues(null).size).toBe(0);
  });
});

describe('detectClientesColumnValues — cabeçalho com ruído de OCR', () => {
  it('ainda localiza a coluna quando o OCR troca uma letra do cabeçalho ("Cllentes" em vez de "Clientes")', () => {
    const header = line([word('Cllentes', 290, 330, 0)], 0);
    const row = line([word('70209751-ANGELICA', 0, 80, 20), word('74', 295, 305, 20)], 20);
    const result = detectClientesColumnValues(blocksFixture([header, row]));
    expect(result.get('70209751')).toBe(74);
  });

  it('não confunde outra palavra do cabeçalho (ex.: "Vendas") com "Clientes" mesmo com a tolerância', () => {
    const header = line([word('Vendas', 90, 130, 0)], 0);
    const row = line([word('70209751-ANGELICA', 0, 80, 20), word('74', 295, 305, 20)], 20);
    const result = detectClientesColumnValues(blocksFixture([header, row]));
    expect(result.size).toBe(0);
  });
});

describe('findClientesColumnCropRange', () => {
  it('calcula a faixa horizontal da coluna a partir do cabeçalho e dos valores já encontrados', () => {
    const header = line([word('Clientes', 290, 330, 0)], 0);
    const row1 = line([word('70209751-ANGELICA', 0, 80, 20), word('74', 280, 310, 20)], 20);
    const row2 = line([word('70208345-DEIVESON', 0, 80, 40), word('32', 300, 340, 40)], 40);
    const range = findClientesColumnCropRange(blocksFixture([header, row1, row2]));
    expect(range).not.toBeNull();
    // Envelope: min(x0 do cabeçalho, dos valores) até max(x1), com margem.
    expect(range!.x0).toBeLessThanOrEqual(280);
    expect(range!.x1).toBeGreaterThanOrEqual(340);
  });

  it('nunca deixa a faixa começar antes de x=0', () => {
    const header = line([word('Clientes', 2, 20, 0)], 0);
    const range = findClientesColumnCropRange(blocksFixture([header]));
    expect(range!.x0).toBeGreaterThanOrEqual(0);
  });

  it('devolve null quando não acha o cabeçalho "Clientes" (mesmo caso de detectClientesColumnValues)', () => {
    const row = line([word('70209751-ANGELICA', 0, 80, 20), word('74', 295, 305, 20)], 20);
    expect(findClientesColumnCropRange(blocksFixture([row]))).toBeNull();
  });
});

describe('matchColumnLinesToRows', () => {
  it('casa cada linha da releitura recortada com a linha de colaborador na mesma posição Y', () => {
    const header = line([word('Clientes', 290, 330, 0)], 0);
    const row1 = line([word('70209751-ANGELICA', 0, 80, 20), word('ruido', 280, 310, 20)], 20);
    const row2 = line([word('70208345-DEIVESON', 0, 80, 50), word('ruido', 280, 310, 50)], 50);
    const blocks = blocksFixture([header, row1, row2]);
    // Releitura dedicada só da coluna: uma linha por colaborador, na mesma
    // altura Y de cada linha original (rectangle do Tesseract não muda as
    // coordenadas devolvidas).
    const columnLines = [
      { text: '74', yCenter: 25 },
      { text: '32', yCenter: 55 },
    ];
    const result = matchColumnLinesToRows(columnLines, blocks);
    expect(result.get('70209751')).toBe(74);
    expect(result.get('70208345')).toBe(32);
  });

  it('corrige confusão de OCR na releitura recortada (mesmo bug "7a" → 74)', () => {
    const row = line([word('70209751-ANGELICA', 0, 80, 20)], 20);
    const result = matchColumnLinesToRows([{ text: '7a', yCenter: 25 }], blocksFixture([row]));
    expect(result.get('70209751')).toBe(74);
  });

  it('não casa uma linha de colaborador com uma linha de releitura distante demais em Y', () => {
    const row = line([word('70209751-ANGELICA', 0, 80, 20)], 20);
    // Só uma linha na releitura, bem longe (y=500) de qualquer colaborador —
    // não deve ser "o mais próximo mesmo assim" quando a distância é absurda.
    const result = matchColumnLinesToRows([{ text: '74', yCenter: 500 }], blocksFixture([row]));
    expect(result.size).toBe(0);
  });

  it('devolve mapa vazio quando a releitura não achou linha nenhuma', () => {
    const row = line([word('70209751-ANGELICA', 0, 80, 20)], 20);
    expect(matchColumnLinesToRows([], blocksFixture([row])).size).toBe(0);
  });
});
