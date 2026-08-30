import type { CategoryKey, ClassificationInputs, GoalCategoryKey } from './business/classification';
import { CAT_KEYS } from './business/classification';
import type { Collaborator, Dynamic, Goal, Sale } from './business/types';
import type { SpecialListItem } from './business/summary';
import type { Tables } from '../types/database';

export function mapCollaborator(row: Tables<'collaborators'>): Collaborator {
  return {
    id: row.id,
    matricula: row.matricula,
    nome: row.nome,
    apelido: row.apelido,
    foto: row.foto_url,
    fotoConquista: row.foto_conquista_url,
    setor: row.setor,
    metaIndividual: Number(row.meta_individual) || 0,
  };
}

export function mapSale(row: Tables<'sales'>): Sale {
  return {
    id: row.id,
    dataISO: row.data_iso,
    matricula: row.matricula,
    vendedor: row.vendedor,
    produto: row.produto,
    codigo: row.codigo,
    qtd: Number(row.qtd) || 0,
    valor: Number(row.valor) || 0,
    grupo: row.grupo as CategoryKey | null,
  };
}

export function mapGoal(row: Tables<'goals'>): Goal {
  return {
    categoria: row.categoria as GoalCategoryKey,
    mensal: Number(row.mensal) || 0,
    diaria: Number(row.diaria) || 0,
    metrica: row.metrica as 'valor' | 'unidade',
    autoRedistribuir: row.auto_redistribuir,
    superMeta: Number(row.super_meta) || 0,
    superMetaAuto: row.super_meta_auto,
  };
}

export function mapDynamic(row: Tables<'dynamics'>): Dynamic {
  return {
    id: row.id,
    titulo: row.titulo,
    descricao: row.descricao,
    dataInicio: row.data_inicio,
    dataFim: row.data_fim,
    metaValor: Number(row.meta_valor) || 0,
    metrica: row.metrica as 'valor' | 'unidade',
    produtos: row.produtos,
    participantes: row.participantes,
  };
}

export function mapSpecialListItem(row: Tables<'special_lists'>): SpecialListItem {
  return { nome: row.nome, palavras: row.palavras };
}

/** Assembles the ClassificationInputs the pure classifyProduct/classifyProductTier
 * functions need, from the raw DB rows fetched for the Produtos admin screens. */
export function buildClassificationInputs(
  catalog: Tables<'catalog'>[],
  products: Tables<'products'>[],
  brandKeywords: Tables<'brand_keywords'>[],
  exclusiveBrands: Tables<'exclusive_brands'>[],
): ClassificationInputs {
  const productsByCategory = {} as ClassificationInputs['productsByCategory'];
  const brandKeywordsByCategory = {} as ClassificationInputs['brandKeywordsByCategory'];
  CAT_KEYS.forEach((k) => {
    productsByCategory[k] = products
      .filter((p) => p.categoria === k)
      .map((p) => ({ nome: p.nome, padrao: p.padrao, palavras: p.palavras }));
    brandKeywordsByCategory[k] = brandKeywords.filter((b) => b.categoria === k).map((b) => b.palavra);
  });
  return {
    catalog: catalog.map((c) => ({ nome: c.nome, codigo: c.codigo, categoria: c.categoria as CategoryKey })),
    productsByCategory,
    brandKeywordsByCategory,
    exclusiveBrands: exclusiveBrands.map((b) => b.palavra),
  };
}
