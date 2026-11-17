import { describe, expect, it } from 'vitest';
import { buildBioExtractHtml } from './printExtract';

describe('buildBioExtractHtml', () => {
  const rows = [
    { dataISO: '2026-11-10', matricula: 'M1', vendedor: 'Ana', produto: 'Suplemento Alfa', qtd: 2, pontos: 3 },
    { dataISO: '2026-11-09', matricula: 'M1', vendedor: 'Ana', produto: 'Suplemento Beta', qtd: 1, pontos: 1 },
    { dataISO: '2026-11-09', matricula: '', vendedor: '', produto: 'Suplemento <Gama>', qtd: 4, pontos: 2 },
  ];

  it('lista data (dd/mm), vendedor, produto e quantidade — sem grupo nem pontos por linha', () => {
    const html = buildBioExtractHtml({ periodLabel: '01/11/2026 — 30/11/2026', storeName: 'Loja X', rows });
    const tabelaVendas = html.split('Resumo por vendedor')[0];
    expect(tabelaVendas).toContain('<td>10/11</td>');
    expect(tabelaVendas).not.toContain('10/11/2026');
    expect(tabelaVendas).toContain('<th>Produto</th>');
    expect(tabelaVendas).not.toContain('<th>Grupo</th>');
    expect(tabelaVendas).not.toContain('<th style="text-align:right">Pts</th>');
  });

  it('no fim lista todos os vendedores com quantidade e pontos totais, mais o total geral', () => {
    const html = buildBioExtractHtml({ periodLabel: 'p', rows });
    const resumo = html.split('Resumo por vendedor')[1];
    expect(resumo).toContain('<td>Ana</td>');
    expect(resumo).toContain('<td style="text-align:right">3</td>'); // 2 + 1 un.
    expect(resumo).toContain('4,0'); // 3 + 1 pts
    expect(resumo).toContain('Sem código');
    expect(resumo).toContain('<td style="text-align:right">7</td>'); // total geral: 3 + 4 un.
    expect(resumo).toContain('6,0'); // total geral: 4 + 2 pts
  });

  it('venda sem vendedor aparece como "Sem código" e o HTML é escapado', () => {
    const html = buildBioExtractHtml({ periodLabel: 'p', rows });
    expect(html).toContain('Sem código');
    expect(html).toContain('Suplemento &lt;Gama&gt;');
    expect(html).not.toContain('<Gama>');
  });

  it('sem vendas mostra aviso em vez de tabela e resumo', () => {
    const html = buildBioExtractHtml({ periodLabel: 'p', rows: [] });
    expect(html).toContain('Nenhuma venda no período.');
    expect(html).not.toContain('<table>');
    expect(html).not.toContain('Resumo por vendedor');
  });
});
