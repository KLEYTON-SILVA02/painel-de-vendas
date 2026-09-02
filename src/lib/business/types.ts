import type { BioGroupKey, CategoryKey, GoalCategoryKey } from './classification';

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
  /** Optional for the same reason as `fotoConquista` above — most tests
   * don't exercise it. */
  dataNascimento?: string | null;
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
  categoria: GoalCategoryKey;
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
  /** Which sector(s) may participate — 'ambos' (default) means no restriction. */
  setorAlvo: 'balcao' | 'caixa' | 'ambos';
}

export type BioGroupsProducts = Record<BioGroupKey, { nome: string; palavras: string[] }[]>;
export type BioWeights = Record<BioGroupKey, number>;

/** Biosintética's own G1-G4 meta tiers — separate from `goals` (the general
 * store metas), see bio_group_goals table. */
export interface BioGroupGoal {
  grupo: BioGroupKey;
  meta1: number;
  meta2: number;
  meta3: number;
  /** Per-group weight for categories that store it here instead of
   * store_settings.bio_weights (see bio_group_goals.peso) — 0 for
   * BIOSINTÉTICA's own rows, which keep using bio_weights. */
  peso: number;
}

/** Commission % config — Dermocosméticos/Genéricos/Marcas Exclusivas only.
 * `slot` lets a category register more than one independent commission
 * (Marcas Exclusivas uses slots 1-3; Dermo/Genéricos use slot 1 only). */
export interface CommissionRate {
  categoria: 'DERM' | 'GEN' | 'MP';
  slot: number;
  percentual: number;
  ativo: boolean;
}
