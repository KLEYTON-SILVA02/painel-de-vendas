/** Tempo limite para as chamadas ao Supabase: sem isso, uma rede ruim deixa a
 * tela em "Carregando…" para sempre. Uploads (storage) ficam sem limite — um
 * arquivo grande em rede lenta pode legitimamente demorar. Edge Functions têm
 * limite maior (OCR, e-mails etc. são mais lentos). */
export const DEFAULT_TIMEOUT_MS = 30_000;
export const FUNCTIONS_TIMEOUT_MS = 120_000;

export function timeoutForUrl(url: string): number | null {
  if (url.includes('/storage/v1/')) return null;
  if (url.includes('/functions/v1/')) return FUNCTIONS_TIMEOUT_MS;
  return DEFAULT_TIMEOUT_MS;
}

export function createFetchWithTimeout(baseFetch: typeof fetch = (...a) => fetch(...a)): typeof fetch {
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const ms = timeoutForUrl(url);
    if (ms === null) return baseFetch(input, init);

    const controller = new AbortController();
    const outer = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const onOuterAbort = () => controller.abort(outer?.reason);
    if (outer) {
      if (outer.aborted) controller.abort(outer.reason);
      else outer.addEventListener('abort', onOuterAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(new DOMException('Tempo limite da requisição esgotado', 'TimeoutError')), ms);
    return baseFetch(input, { ...init, signal: controller.signal }).finally(() => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuterAbort);
    });
  };
}
