// Ciclo de uso por loja — stopgap temporário até o Monitoramento de Lojas
// existir (ver CLAUDE.md, PLANO B, e a migration 0100_store_billing_cycles).
// "Bloqueado" é sempre calculado aqui, a partir do ciclo mais recente —
// nunca escrito por uma rotina automática em nenhuma tabela. Uma loja sem
// nenhum ciclo cadastrado nunca é tratada como bloqueada (nunca suspender
// "pelo silêncio").

export type BillingCycleType = '30' | '60' | '90' | '365';

export const BILLING_CYCLE_DAYS: Record<BillingCycleType, number> = {
  '30': 30,
  '60': 60,
  '90': 90,
  '365': 365,
};

export const BILLING_CYCLE_LABELS: Record<BillingCycleType, string> = {
  '30': '1 ciclo (30 dias)',
  '60': '2 ciclos (60 dias)',
  '90': '3 ciclos (90 dias)',
  '365': 'Ciclo anual (365 dias)',
};

// Margem de segurança antes de bloquear de verdade — um ciclo vencido há
// poucos dias ainda não bloqueia, dando folga para o ADM CONSTRUTOR
// confirmar a renovação sem depender de um cálculo no exato segundo do
// vencimento.
export const BILLING_GRACE_DAYS = 3;

// A partir de quantos dias restantes o ícone de aviso passa a aparecer na
// Tela Inicial.
export const BILLING_WARNING_DAYS = 10;

export interface BillingCycleRow {
  cycle_type: string;
  started_at: string;
  ends_at: string;
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysISO(dateISO: string, days: number): string {
  const d = parseISODate(dateISO);
  d.setDate(d.getDate() + days);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
}

/** Dias entre hoje e `endsAtISO` — positivo quando o ciclo ainda não
 * terminou, negativo quando já venceu há esses dias. */
export function daysRemaining(endsAtISO: string, todayISOStr: string): number {
  const end = parseISODate(endsAtISO);
  const today = parseISODate(todayISOStr);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

/** true só quando existe um ciclo cadastrado E ele já passou da margem de
 * segurança — nunca por falta de ciclo. */
export function isBillingBlocked(latest: BillingCycleRow | null | undefined, todayISOStr: string): boolean {
  if (!latest) return false;
  return daysRemaining(latest.ends_at, todayISOStr) < -BILLING_GRACE_DAYS;
}
