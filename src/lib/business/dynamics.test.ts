import { describe, expect, it } from 'vitest';
import {
  computeDinamicaCategoriaTotais,
  computeDinamicaColaboradorProdutos,
  computeDinamicaColaboradorVendas,
  computeDinamicaProgresso,
  computeDinamicaRanking,
  dinamicaUnidadeLabel,
  dynamicAllowsCollaborator,
  dynamicStatus,
  intersectDynamicPeriod,
  isDynamicActive,
  productMatchesCategoria,
} from './dynamics';
import type { Collaborator, Dynamic, Sale } from './types';

const collaborators: Collaborator[] = [
  { id: '1', matricula: 'M1', nome: 'Ana', apelido: 'Ana', foto: null, setor: 'Balcão', metaIndividual: 0 },
  { id: '2', matricula: 'M2', nome: 'Bruno', apelido: 'Bruno', foto: null, setor: 'Caixa', metaIndividual: 0 },
];

const sales: Sale[] = [
  { id: 's1', dataISO: '2026-08-05', matricula: 'M1', vendedor: 'Ana', produto: 'Produto X', qtd: 2, valor: 200, grupo: 'DERM' },
  { id: 's2', dataISO: '2026-08-06', matricula: 'M2', vendedor: 'Bruno', produto: 'Produto X', qtd: 1, valor: 100, grupo: 'DERM' },
  { id: 's3', dataISO: '2026-08-06', matricula: 'M2', vendedor: 'Bruno', produto: 'Produto Y (not in list)', qtd: 5, valor: 500, grupo: 'DERM' },
  { id: 's4', dataISO: '2026-07-20', matricula: 'M1', vendedor: 'Ana', produto: 'Produto X', qtd: 9, valor: 900, grupo: 'DERM' }, // outside period
];

const din: Dynamic = {
  id: 'd1', titulo: 'Semana X', descricao: '', dataInicio: '2026-08-01', dataFim: '2026-08-10',
  metaValor: 500, metrica: 'valor', produtos: ['Produto X'], participantes: [], setorAlvo: 'ambos',
  metaModo: 'geral', metasIndividuais: {}, categoriasProdutos: [], multiplicador: { ativo: false, valor: 0 },
  medidaLabel: '',
};

describe('computeDinamicaProgresso', () => {
  it('sums only sales within the period, matching the product list', () => {
    expect(computeDinamicaProgresso(din, sales, collaborators)).toBe(300); // s1 + s2 only
  });

  it('uses unit count when metrica is unidade', () => {
    expect(computeDinamicaProgresso({ ...din, metrica: 'unidade' }, sales, collaborators)).toBe(3); // qtd 2 + 1
  });

  it('counts every product when the product list is empty', () => {
    expect(computeDinamicaProgresso({ ...din, produtos: [] }, sales, collaborators)).toBe(800); // s1+s2+s3
  });

  it('excludes sales from collaborators outside the target sector', () => {
    // Bruno (M2) is Caixa — with setorAlvo=balcao, only Ana's (M1) sale counts.
    expect(computeDinamicaProgresso({ ...din, setorAlvo: 'balcao' }, sales, collaborators)).toBe(200);
  });
});

describe('dynamicAllowsCollaborator', () => {
  it('never restricts when setorAlvo is ambos', () => {
    expect(dynamicAllowsCollaborator(din, { setor: 'Balcão' })).toBe(true);
    expect(dynamicAllowsCollaborator(din, { setor: 'Caixa' })).toBe(true);
    expect(dynamicAllowsCollaborator(din, { setor: null })).toBe(true);
  });

  it('restricts to the matching sector otherwise', () => {
    expect(dynamicAllowsCollaborator({ ...din, setorAlvo: 'balcao' }, { setor: 'Balcão' })).toBe(true);
    expect(dynamicAllowsCollaborator({ ...din, setorAlvo: 'balcao' }, { setor: 'Caixa' })).toBe(false);
    expect(dynamicAllowsCollaborator({ ...din, setorAlvo: 'caixa' }, { setor: 'Caixa' })).toBe(true);
    expect(dynamicAllowsCollaborator({ ...din, setorAlvo: 'caixa' }, { setor: 'Balcão' })).toBe(false);
  });
});

describe('computeDinamicaRanking', () => {
  it('ranks participants by the dynamic metric, restricted to the product list', () => {
    const ranking = computeDinamicaRanking(din, sales, collaborators);
    const bruno = ranking.find((r) => r.matricula === 'M2')!;
    const ana = ranking.find((r) => r.matricula === 'M1')!;
    expect(ana.valor).toBe(200);
    expect(bruno.valor).toBe(100); // Produto Y excluded
  });

  it('restricts to the participant list when set', () => {
    const ranking = computeDinamicaRanking({ ...din, participantes: ['M1'] }, sales, collaborators);
    expect(ranking).toHaveLength(1);
    expect(ranking[0].matricula).toBe('M1');
  });
});

describe('isDynamicActive', () => {
  it('is active while today <= end date', () => {
    expect(isDynamicActive(din, '2026-08-10')).toBe(true);
    expect(isDynamicActive(din, '2026-08-01')).toBe(true);
  });
  it('is inactive the day after it ends', () => {
    expect(isDynamicActive(din, '2026-08-11')).toBe(false);
  });
});

describe('dynamicStatus', () => {
  it('is "agendada" before it starts', () => {
    expect(dynamicStatus(din, '2026-07-31')).toBe('agendada');
  });
  it('is "ativa" within its period', () => {
    expect(dynamicStatus(din, '2026-08-01')).toBe('ativa');
    expect(dynamicStatus(din, '2026-08-10')).toBe('ativa');
  });
  it('is "encerrada" after its end date', () => {
    expect(dynamicStatus(din, '2026-08-11')).toBe('encerrada');
  });
});

describe('productMatchesCategoria', () => {
  it('matches an exact product name (normalized)', () => {
    expect(productMatchesCategoria('Produto X', { id: 'c1', nome: 'Cat 1', produtos: ['produto x'], palavraChave: '' })).toBe(true);
    expect(productMatchesCategoria('Produto Z', { id: 'c1', nome: 'Cat 1', produtos: ['produto x'], palavraChave: '' })).toBe(false);
  });

  it('matches by palavraChave substring when set', () => {
    const cat = { id: 'c1', nome: 'Marca Y', produtos: [], palavraChave: 'marca y' };
    expect(productMatchesCategoria('Sabonete Marca Y 200ml', cat)).toBe(true);
    expect(productMatchesCategoria('Sabonete Outra Coisa', cat)).toBe(false);
  });

  it('ignores an empty palavraChave rather than matching everything', () => {
    expect(productMatchesCategoria('Qualquer Produto', { id: 'c1', nome: 'Cat 1', produtos: [], palavraChave: '' })).toBe(false);
  });
});

describe('computeDinamicaCategoriaTotais', () => {
  const dinComCategorias: Dynamic = {
    ...din,
    produtos: [],
    categoriasProdutos: [
      { id: 'c1', nome: 'Categoria 1', produtos: ['Produto X'], palavraChave: '' },
      { id: 'c2', nome: 'Categoria 2', produtos: [], palavraChave: 'not in list' },
    ],
  };

  it('sums valor/itens per categoria, independently', () => {
    const totais = computeDinamicaCategoriaTotais(dinComCategorias, sales, collaborators);
    const cat1 = totais.find((c) => c.id === 'c1')!;
    const cat2 = totais.find((c) => c.id === 'c2')!;
    expect(cat1.valor).toBe(300); // s1 + s2
    expect(cat1.itens).toBe(3);
    expect(cat2.valor).toBe(500); // s3 ("Produto Y (not in list)")
    expect(cat2.itens).toBe(5);
  });

  it('leaves pontuacao null when multiplicador is not ativo', () => {
    const totais = computeDinamicaCategoriaTotais(dinComCategorias, sales, collaborators);
    expect(totais.every((c) => c.pontuacao === null)).toBe(true);
  });

  it('multiplies itens by multiplicador.valor when ativo', () => {
    const din2 = { ...dinComCategorias, multiplicador: { ativo: true, valor: 10 } };
    const totais = computeDinamicaCategoriaTotais(din2, sales, collaborators);
    const cat1 = totais.find((c) => c.id === 'c1')!;
    expect(cat1.pontuacao).toBe(30); // 3 itens * 10
  });

  it('restricts overall progress to products matching some categoria when categorias are set', () => {
    // Without categorias, produtos=[] means "count everything" (800). With
    // categorias in play, only products matching cat1 or cat2 count — here
    // that's every sale in the fixture, so the total is unchanged (800),
    // but a sale matching neither would now be excluded.
    expect(computeDinamicaProgresso(dinComCategorias, sales, collaborators)).toBe(800);
    const dinNarrow = { ...dinComCategorias, categoriasProdutos: [dinComCategorias.categoriasProdutos[0]] };
    expect(computeDinamicaProgresso(dinNarrow, sales, collaborators)).toBe(300); // only cat1's "Produto X"
  });
});

describe('dinamicaUnidadeLabel', () => {
  it('falls back to "un." when medidaLabel is empty', () => {
    expect(dinamicaUnidadeLabel(din)).toBe('un.');
    expect(dinamicaUnidadeLabel({ ...din, medidaLabel: '   ' })).toBe('un.');
  });

  it('uses the custom label when set', () => {
    expect(dinamicaUnidadeLabel({ ...din, medidaLabel: 'caixas' })).toBe('caixas');
  });
});

describe('computeDinamicaColaboradorProdutos', () => {
  it('sums qtd/valor per distinct product, for that matricula only, within the period', () => {
    const linhas = computeDinamicaColaboradorProdutos({ ...din, produtos: [] }, sales, 'M2');
    expect(linhas).toHaveLength(2);
    const produtoX = linhas.find((l) => l.produto === 'Produto X')!;
    const produtoY = linhas.find((l) => l.produto === 'Produto Y (not in list)')!;
    expect(produtoX).toEqual({ produto: 'Produto X', qtd: 1, valor: 100 });
    expect(produtoY).toEqual({ produto: 'Produto Y (not in list)', qtd: 5, valor: 500 });
  });

  it('respects the dynamic product filter', () => {
    const linhas = computeDinamicaColaboradorProdutos(din, sales, 'M2'); // din.produtos = ['Produto X']
    expect(linhas).toEqual([{ produto: 'Produto X', qtd: 1, valor: 100 }]);
  });

  it('returns an empty list for a matricula with no matching sales', () => {
    expect(computeDinamicaColaboradorProdutos(din, sales, 'M99')).toEqual([]);
  });
});

describe('computeDinamicaColaboradorVendas', () => {
  it('keeps each sale date as its own row, most recent day first', () => {
    const linhas = computeDinamicaColaboradorVendas({ ...din, produtos: [] }, sales, 'M2');
    expect(linhas).toEqual([
      { dataISO: '2026-08-06', produto: 'Produto X', qtd: 1, valor: 100 },
      { dataISO: '2026-08-06', produto: 'Produto Y (not in list)', qtd: 5, valor: 500 },
    ]);
  });

  it('respects the dynamic product filter and period', () => {
    const linhas = computeDinamicaColaboradorVendas(din, sales, 'M1'); // din.produtos = ['Produto X']
    // s4 (2026-07-20) is outside the period and excluded.
    expect(linhas).toEqual([{ dataISO: '2026-08-05', produto: 'Produto X', qtd: 2, valor: 200 }]);
  });

  it('returns an empty list for a matricula with no matching sales', () => {
    expect(computeDinamicaColaboradorVendas(din, sales, 'M99')).toEqual([]);
  });
});

describe('intersectDynamicPeriod', () => {
  it('clamps to the tighter bound on each side', () => {
    expect(intersectDynamicPeriod(din, '2026-08-03', '2026-08-20')).toEqual({ from: '2026-08-03', to: '2026-08-10' });
    expect(intersectDynamicPeriod(din, '2026-07-01', '2026-08-05')).toEqual({ from: '2026-08-01', to: '2026-08-05' });
  });
});
