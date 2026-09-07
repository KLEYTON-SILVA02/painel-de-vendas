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
  /** Optional for the same reason as `fotoConquista`/`dataNascimento` below —
   * most business-logic tests don't exercise it, and legacy collaborator
   * rows created before this field existed read back as null. */
  celular?: string | null;
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
  /** Category keys (DERM/GEN/MP/MER/LEVMEL/CHIP/'biosintetica') this
   * collaborator may view — only meaningful when `setor === VISITANTE_SETOR`.
   * Optional for the same reason as the fields above. */
  categoriasVisitante?: string[];
}

/** `collaborators.setor` value for a view-only collaborator: no sales are
 * ever expected to reference them, and once logged in they see only the
 * category screens listed in `categoriasVisitante` instead of the usual
 * Metas/Vendas/Ranking/Comissões/Dinâmicas tabs. Checked as a plain string
 * (like BALCAO_SETOR elsewhere) rather than a boolean column, since setor
 * already drives ranking-eligibility logic throughout the app. */
export const VISITANTE_SETOR = 'Visitante';

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
  /** 'geral' (default): every participant is measured against the single
   * shared metaValor. 'individual': each participant has their own target
   * in metasIndividuais instead — metaValor is unused in that mode. */
  metaModo: 'geral' | 'individual';
  /** matricula -> individual target, only meaningful when metaModo === 'individual'. */
  metasIndividuais: Record<string, number>;
  /** Splits the dynamic's participating products into named columns (e.g.
   * "Categoria 1" / "Categoria 2") shown side by side — empty = legacy flat
   * `produtos` behavior (no split). */
  categoriasProdutos: DynamicProductCategory[];
  /** When ativo, each categoria's own item count (not R$) is multiplied by
   * valor to produce a per-categoria score, shown alongside its total — the
   * score itself is always shown as currency, regardless of medidaLabel. */
  multiplicador: { ativo: boolean; valor: number };
  /** Custom unit name shown next to realized/meta values when metrica is
   * 'unidade' (e.g. "caixas", "pares") — empty falls back to generic "un.". */
  medidaLabel: string;
}

export interface DynamicProductCategory {
  id: string;
  nome: string;
  /** Exact product names (matched via normalize()), same mechanism as the
   * dynamic's own flat `produtos` list. */
  produtos: string[];
  /** Optional substring match against the normalized product name — lets a
   * category catch every product sharing a naming pattern (e.g. a brand)
   * without enumerating each one by hand. */
  palavraChave: string;
  /** Per-product multiplier overrides: when a sale's product matches one of
   * these (normalized), its sold quantity is scored at this `valor` per
   * item instead of the dynamic's shared multiplicador.valor, and excluded
   * from that shared multiplication — the two amounts are summed into the
   * categoria's final pontuacao, so nothing is counted twice. Optional
   * because dynamics saved before this feature existed have no such field. */
  produtosEspeciais?: { produto: string; valor: number }[];
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

/** Commission % config — Mercadoria Geral/Dermocosméticos/Genéricos/Marcas
 * Exclusivas. `slot` lets a category register more than one independent
 * commission (Marcas Exclusivas uses slots 1-3; the rest use slot 1 only). */
export interface CommissionRate {
  categoria: 'MER' | 'DERM' | 'GEN' | 'MP';
  slot: number;
  percentual: number;
  ativo: boolean;
}
