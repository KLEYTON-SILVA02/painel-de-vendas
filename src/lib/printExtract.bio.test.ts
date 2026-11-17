import { describe, expect, it } from 'vitest';
import { buildBioDailyHtml, buildBioExtractHtml, buildBioTopProductsHtml } from './printExtract';

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

describe('buildBioTopProductsHtml', () => {
  const produtos = Array.from({ length: 25 }, (_, i) => ({ produto: `Produto ${i + 1}`, qtd: 100 - i })); // já do mais ao menos vendido

  it('mostra os 10 mais vendidos e os 10 menos vendidos (do menor para cima), sem repetir', () => {
    const html = buildBioTopProductsHtml({ periodLabel: 'p', products: produtos });
    const [maisParte, menosParte] = html.split('Menos vendidos');
    expect(maisParte).toContain('Mais vendidos');
    expect(maisParte).toContain('Produto 1<');
    expect(maisParte).toContain('Produto 10<');
    expect(maisParte).not.toContain('Produto 11<');
    expect(menosParte).toContain('Produto 25<'); // o menos vendido de todos
    expect(menosParte).toContain('Produto 16<');
    expect(menosParte).not.toContain('Produto 15<');
    expect(menosParte.indexOf('Produto 25<')).toBeLessThan(menosParte.indexOf('Produto 24<')); // menor primeiro
  });

  it('com poucos produtos a lista de menos vendidos avisa em vez de repetir', () => {
    const html = buildBioTopProductsHtml({ periodLabel: 'p', products: produtos.slice(0, 4) });
    expect(html.split('Menos vendidos')[1]).toContain('Poucos produtos vendidos');
    expect(html.split('Menos vendidos')[1]).not.toContain('Produto 1<');
  });

  it('sem vendas mostra aviso e escapa HTML', () => {
    expect(buildBioTopProductsHtml({ periodLabel: 'p', products: [] })).toContain('Nenhuma venda no período.');
    expect(buildBioTopProductsHtml({ periodLabel: 'p', products: [{ produto: '<b>x</b>', qtd: 1 }] })).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('buildBioDailyHtml', () => {
  const days = [
    { dataISO: '2026-11-01', vendas: 2, qtd: 5 },
    { dataISO: '2026-11-02', vendas: 0, qtd: 0 },
    { dataISO: '2026-11-03', vendas: 1, qtd: 1 },
  ];

  it('lista cada dia (dd/mm + dia da semana) com vendas e quantidade, inclusive os zerados', () => {
    const html = buildBioDailyHtml({ periodLabel: 'p', days });
    expect(html).toContain('01/11 dom');
    expect(html).toContain('02/11 seg');
    expect(html).toContain('<td style="text-align:right">0</td>');
  });

  it('soma o total do período no fim', () => {
    const html = buildBioDailyHtml({ periodLabel: 'p', days });
    const total = html.split('class="total-row"')[1];
    expect(total).toContain('<td style="text-align:right">3</td>'); // 2 + 0 + 1 vendas
    expect(total).toContain('<td style="text-align:right">6</td>'); // 5 + 0 + 1 un.
  });
});
