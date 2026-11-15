import { FunctionsHttpError } from '@supabase/supabase-js';
import { friendlyMessage } from './friendlyError';

/** Mensagem curta e clara para mostrar ao usuário a partir de qualquer coisa que
 * uma chamada ao Supabase possa lançar ou devolver como `error` (um `Error` de
 * verdade ou o objeto simples `{message, code, details, hint}` do PostgREST).
 * Erros técnicos (HTTP 400/401/403/404/409/413/429/5xx, códigos do banco, falta
 * de internet, tempo esgotado) viram "causa: o que fazer" — ver friendlyError.ts.
 * Mensagens de regra de negócio já em português passam direto. `fallback` diz o
 * que se tentava fazer (ex.: "Falha ao salvar o nome.") e abre a frase. */
export function errorMessage(err: unknown, fallback: string): string {
  return friendlyMessage(err, fallback);
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
  return friendlyMessage(err, fallback);
}
