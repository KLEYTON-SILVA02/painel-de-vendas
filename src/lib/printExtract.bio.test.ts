import { describe, expect, it } from 'vitest';
import { buildBioExtractHtml } from './printExtract';

describe('buildBioExtractHtml', () => {
  const rows = [
    { dataISO: '2026-11-10', matricula: 'M1', vendedor: 'Ana', produto: 'Suplemento Alfa', qtd: 2, grupo: 'G1', pontos: 3 },
    { dataISO: '2026-11-09', matricula: '', vendedor: '', produto: 'Suplemento <Beta>', qtd: 1, grupo: 'G2', pontos: 1 },
  ];

  it('lista cada venda e soma quantidade e pontos no subtotal', () => {
    const html = buildBioExtractHtml({ periodLabel: '01/11/2026 — 30/11/2026', storeName: 'Loja X', rows });
    expect(html).toContain('Extrato de Vendas — Biosintética — Loja X');
    expect(html).toContain('10/11/2026');
    expect(html).toContain('Subtotal');
    expect(html).toContain('4,0'); // 3 + 1 pontos
  });

  it('venda sem vendedor aparece como "Sem código" e o HTML é escapado', () => {
    const html = buildBioExtractHtml({ periodLabel: 'p', rows });
    expect(html).toContain('Sem código');
    expect(html).toContain('Suplemento &lt;Beta&gt;');
    expect(html).not.toContain('<Beta>');
  });

  it('sem vendas mostra aviso em vez de tabela', () => {
    const html = buildBioExtractHtml({ periodLabel: 'p', rows: [] });
    expect(html).toContain('Nenhuma venda no período.');
    expect(html).not.toContain('<table>');
  });
});
