export function fmtMoney(v: number): string {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function fmtDateBR(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** DD/MM, no year — for the mobile "Lista de vendas" table only, where the
 * date filter above it already pins the period to a single month (so the
 * year is always implicitly the current one being viewed). Dropping it
 * frees up column width for the slightly larger row text that comes with
 * it (see .mv2-data-table). */
export function fmtDateShortBR(iso: string | null): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

const MONTH_NAMES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
export function monthName(i: number): string {
  return MONTH_NAMES[i];
}
