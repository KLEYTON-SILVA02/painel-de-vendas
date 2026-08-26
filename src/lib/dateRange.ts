export function monthFirstISO(year: number, month: number): string {
  return new Date(year, month, 1).toISOString().slice(0, 10);
}

export function monthLastISO(year: number, month: number): string {
  return new Date(year, month + 1, 0).toISOString().slice(0, 10);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
