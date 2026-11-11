/** Divide um intervalo de datas (YYYY-MM-DD, inclusive nas pontas) em janelas
 * consecutivas e sem sobreposição de até `days` dias cada. Usado para baixar
 * o histórico de vendas em várias partes ao mesmo tempo. */
export function splitDateRange(fromISO: string, toISO: string, days: number): { from: string; to: string }[] {
  if (!fromISO || !toISO || fromISO > toISO || days < 1) return [];
  const DAY = 86_400_000;
  const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
  const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const start = toMs(fromISO);
  const end = toMs(toISO);
  if (Number.isNaN(start) || Number.isNaN(end)) return [];
  const out: { from: string; to: string }[] = [];
  for (let cur = start; cur <= end; cur += days * DAY) {
    out.push({ from: toIso(cur), to: toIso(Math.min(cur + (days - 1) * DAY, end)) });
  }
  return out;
}

/** Roda `worker` sobre cada item com no máximo `limit` em andamento ao mesmo
 * tempo; devolve os resultados na mesma ordem dos itens. Se um falhar, o erro
 * é propagado e nenhum item novo é iniciado. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  async function run() {
    while (!failed) {
      const i = next++;
      if (i >= items.length) return;
      try {
        // eslint-disable-next-line no-await-in-loop
        results[i] = await worker(items[i], i);
      } catch (e) {
        failed = true;
        throw e;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}
