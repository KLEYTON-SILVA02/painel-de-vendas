export function monthFirstISO(year: number, month: number): string {
  return new Date(year, month, 1).toISOString().slice(0, 10);
}

export function monthLastISO(year: number, month: number): string {
  return new Date(year, month + 1, 0).toISOString().slice(0, 10);
}

// `new Date().toISOString()` reports the UTC calendar date, not the
// browser's local one — for a store running on Brazil's clock (UTC-3),
// that date rolls over 3 hours early, at 21:00 local instead of midnight.
// Anything gated on "did this happen today" (notably the sales-import
// notification trigger in ImportarPage.tsx, which only fires when the
// import touched today's date) silently stopped firing every evening
// because of this. Building the string from local Y/M/D getters instead
// — same trick monthFirstISO/monthLastISO above already use — keeps this
// aligned with the store's actual calendar day.
export function todayISO(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10);
}

/** Desloca uma data ISO (YYYY-MM-DD) por `days` dias de calendário — usado
 * pela seta de tendência (dia anterior) pra achar o dia de venda anterior
 * ao dia único selecionado (days = -1). O `T00:00:00` evita o mesmo
 * problema de fuso do comentário acima do todayISO: sem ele, `new
 * Date('YYYY-MM-DD')` é interpretado como meia-noite UTC, que em fusos
 * negativos (Brasil) já é o dia anterior no horário local. */
export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
