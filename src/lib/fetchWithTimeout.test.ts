import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFetchWithTimeout, DEFAULT_TIMEOUT_MS, FUNCTIONS_TIMEOUT_MS, timeoutForUrl } from './fetchWithTimeout';

afterEach(() => vi.useRealTimers());

describe('timeoutForUrl', () => {
  it('uploads não têm limite; functions têm limite maior', () => {
    expect(timeoutForUrl('https://x.supabase.co/storage/v1/object/photos/a.png')).toBeNull();
    expect(timeoutForUrl('https://x.supabase.co/functions/v1/ocr')).toBe(FUNCTIONS_TIMEOUT_MS);
    expect(timeoutForUrl('https://x.supabase.co/rest/v1/sales')).toBe(DEFAULT_TIMEOUT_MS);
  });
});

describe('createFetchWithTimeout', () => {
  const hanging: typeof fetch = (_i, init) =>
    new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(init.signal?.reason)));

  it('aborta uma leitura que nunca responde', async () => {
    vi.useFakeTimers();
    const f = createFetchWithTimeout(hanging);
    const p = f('https://x.supabase.co/rest/v1/sales');
    const assertion = expect(p).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS + 1);
    await assertion;
  });

  it('não aborta upload no storage', async () => {
    vi.useFakeTimers();
    let aborted = false;
    const base: typeof fetch = (_i, init) => {
      init?.signal?.addEventListener('abort', () => (aborted = true));
      return new Promise((res) => setTimeout(() => res(new Response('ok')), 200_000));
    };
    const f = createFetchWithTimeout(base);
    const p = f('https://x.supabase.co/storage/v1/object/photos/a.png', { method: 'POST' });
    await vi.advanceTimersByTimeAsync(200_001);
    await expect(p).resolves.toBeInstanceOf(Response);
    expect(aborted).toBe(false);
  });

  it('respeita o signal de quem chamou', async () => {
    const ctl = new AbortController();
    const f = createFetchWithTimeout(hanging);
    const p = f('https://x.supabase.co/rest/v1/sales', { signal: ctl.signal });
    ctl.abort(new Error('cancelado'));
    await expect(p).rejects.toThrow('cancelado');
  });

  it('resposta rápida passa direto', async () => {
    const f = createFetchWithTimeout(async () => new Response('ok'));
    const r = await f('https://x.supabase.co/rest/v1/sales');
    expect(await r.text()).toBe('ok');
  });
});
