import type { ConquistaCategoria, ConquistaRow } from './conquistas';

export interface CelebrationCandidate {
  key: string;
  categoria: ConquistaCategoria;
  row: ConquistaRow;
}

/** Stable identity for one achievement, scoped to the current month so a
 * repeat performance next month celebrates again instead of being silenced
 * forever by a stale "already seen" record. */
export function celebrationKey(categoria: ConquistaCategoria, row: ConquistaRow, monthKey: string): string {
  return `${row.matricula}|${categoria}|${row.tier || 'super'}|${monthKey}`;
}

/**
 * Compares this run's qualifying achievements against the previously-seen
 * key set and picks one "new" one to celebrate (first found — one popup at
 * a time, never a flood). `seenKeys` being empty is treated as first-ever
 * run: everything currently qualifying is baseline, not "new", so nothing
 * celebrates on a fresh install/localStorage-cleared browser.
 */
export function pickNewCelebration(
  candidates: CelebrationCandidate[],
  seenKeys: ReadonlySet<string>,
  isFirstRun: boolean,
): { toCelebrate: CelebrationCandidate | null; allKeys: string[] } {
  const allKeys = candidates.map((c) => c.key);
  if (isFirstRun) return { toCelebrate: null, allKeys };
  const fresh = candidates.find((c) => !seenKeys.has(c.key));
  return { toCelebrate: fresh ?? null, allKeys };
}
