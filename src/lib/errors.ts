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
