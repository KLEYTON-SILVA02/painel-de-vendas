export function fmtMoney(v: number): string {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function fmtDateBR(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** "19/11/2026 às 18:42" — data e hora no horário do aparelho (a loja usa o
 * fuso de Brasília). Recebe um timestamp ISO completo (ex.: `created_at` do
 * banco); vazio ou inválido devolve ''. */
export function fmtDateTimeBR(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
