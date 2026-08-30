import type { BioGroupKey, CategoryKey } from './classification';

export interface Sale {
  id: string;
  dataISO: string | null;
  matricula: string;
  vendedor: string;
  produto: string;
  codigo?: string | null;
  qtd: number;
  valor: number;
  grupo: CategoryKey | null;
}

export interface Collaborator {
  id: string;
  matricula: string;
  nome: string;
  apelido: string | null;
  foto: string | null;
  /** Separate photo cropped specifically for Galeria de Conquistas cards —
   * falls back to `foto` when unset (see conquistaImage.ts). Optional so
   * the many business-logic tests that build plain Collaborator literals
   * don't all need updating for a field they don't exercise. */
  fotoConquista?: string | null;
  setor: string | null;
  metaIndividual: number;
}

export interface SummaryRow {
  matricula: string;
  nome: string;
  apelido: string;
  foto: string | null;
  metaIndividual: number;
  qtd: Record<CategoryKey | 'SEM', number>;
  valor: number;
  itens: number;
}

export interface Goal {
  categoria: CategoryKey;
  mensal: number;
  diaria: number;
  metrica: 'valor' | 'unidade';
  autoRedistribuir: boolean;
  superMeta: number;
  superMetaAuto: boolean;
}

export interface Dynamic {
  id: string;
  titulo: string;
  descricao: string;
  dataInicio: string;
  dataFim: string;
  metaValor: number;
  metrica: 'valor' | 'unidade';
  produtos: string[];
  participantes: string[]; // matriculas; empty = everyone
}

export type BioGroupsProducts = Record<BioGroupKey, { nome: string; palavras: string[] }[]>;
export type BioWeights = Record<BioGroupKey, number>;
