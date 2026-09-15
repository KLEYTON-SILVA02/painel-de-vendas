import { FunctionsHttpError } from '@supabase/supabase-js';

/** Extracts a human-readable message from anything a Supabase call can throw
 * or return as `error`. A real `Error` is the easy case — but the plain
 * `{message, details, hint, code}` object that `supabase.rpc()`/`.from()`
 * return as `error` (and that every `if (error) throw error` in this app
 * re-throws) is never `instanceof Error` unless `.throwOnError()` was
 * chained on the call, which nothing here does. Code that checked only
 * `instanceof Error` was silently swallowing the real backend message
 * (validation errors, RLS denials) behind a generic fallback string. */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

/** Same problem as errorMessage() above, different SDK: when
 * supabase.functions.invoke() gets a non-2xx response, the thrown
 * FunctionsHttpError IS an Error, but its own `.message` is always the same
 * generic string ("Edge Function returned a non-2xx status code") — the
 * real reason the function returned (e.g. "Este colaborador já tem acesso")
 * is JSON in the response body, reachable only via the error's `context`
 * (a Response), which has to be read asynchronously. Skipping this step is
 * exactly what made "Criar acesso" show a useless message instead of the
 * real one when it failed. */
export async function edgeFunctionErrorMessage(err: unknown, fallback: string): Promise<string> {
  if (err instanceof FunctionsHttpError) {
    try {
      const body = await err.context.json();
      if (body && typeof body.error === 'string' && body.error) return body.error;
    } catch {
      // response body wasn't JSON (or already consumed) — fall through
    }
  }
  return errorMessage(err, fallback);
}
