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
