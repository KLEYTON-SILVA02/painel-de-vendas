/** Traduz erros técnicos (HTTP 400/401/403/404…, códigos do banco, falta de
 * internet, tempo esgotado) em uma frase curta que diz o que houve e o que
 * fazer. Mensagens de regra de negócio já escritas em português pelo sistema
 * (ex.: "Este colaborador já tem acesso") passam direto, sem troca. */

export type ErrorKind =
  | 'offline'
  | 'timeout'
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'too_large'
  | 'invalid_data'
  | 'rate_limited'
  | 'in_use'
  | 'email_taken'
  | 'weak_password'
  | 'same_password'
  | 'db_timeout'
  | 'server'
  | 'unavailable'
  | 'unknown_status';

/** Frase única por tipo: "causa: o que fazer". */
export const ERROR_TEXT: Record<Exclude<ErrorKind, 'unknown_status'>, string> = {
  offline: 'Sem conexão: confira o Wi-Fi ou os dados do celular e tente de novo.',
  timeout: 'A conexão demorou demais: tente de novo em um lugar com sinal melhor.',
  bad_request: 'Dados inválidos: revise o que foi preenchido e tente de novo.',
  unauthorized: 'Sua sessão expirou: saia e entre de novo.',
  forbidden: 'Sem permissão para isso: peça ao administrador da loja.',
  not_found: 'Não encontrado: pode ter sido removido. Atualize a tela e tente de novo.',
  conflict: 'Já existe um registro igual: confira a lista antes de criar outro.',
  too_large: 'Arquivo grande demais: escolha um arquivo menor.',
  invalid_data: 'Valor em formato inválido: revise os campos e tente de novo.',
  rate_limited: 'Muitas tentativas seguidas: espere um minuto e tente de novo.',
  in_use: 'Este item está em uso em outro lugar: remova a ligação antes de apagar.',
  email_taken: 'Este e-mail já está em uso por outra conta: use outro e-mail ou entre na conta existente.',
  weak_password: 'Senha fraca: escolha uma senha maior, misturando letras e números.',
  same_password: 'A nova senha é igual à atual: escolha uma senha diferente.',
  db_timeout: 'A consulta demorou demais: escolha um período menor e tente de novo.',
  server: 'Erro no servidor: tente de novo em instantes. Se repetir, avise o suporte.',
  unavailable: 'Servidor ocupado ou fora do ar: aguarde um pouco e tente de novo.',
};

export interface ErrorInfo {
  kind: ErrorKind | null;
  status: number | null;
  /** Mensagem original, quando é uma frase humana em português (regra de negócio). */
  custom: string | null;
  original: string | null;
}

const NETWORK_RE = /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|err_network/i;
const TIMEOUT_RE = /tempo limite|timeout|timed out|aborterror|the operation was aborted/i;
const PT_RE = /[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]|\b(não|já|erro|falha|senha|inválid|obrigat|permiss|acesso|colaborador|loja|venda)/i;

function asRecord(err: unknown): Record<string, unknown> | null {
  return err && typeof err === 'object' ? (err as Record<string, unknown>) : null;
}

function statusOf(err: unknown): number | null {
  const r = asRecord(err);
  if (!r) return null;
  for (const key of ['status', 'statusCode']) {
    const v = r[key];
    const n = typeof v === 'string' ? Number(v) : v;
    if (typeof n === 'number' && Number.isInteger(n) && n >= 100 && n < 600) return n;
  }
  const ctx = asRecord(r.context);
  if (ctx && typeof ctx.status === 'number') return ctx.status; // FunctionsHttpError → Response
  return null;
}

function kindFromStatus(status: number): ErrorKind | null {
  if (status === 400) return 'bad_request';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 408) return 'timeout';
  if (status === 409) return 'conflict';
  if (status === 413) return 'too_large';
  if (status === 422) return 'invalid_data';
  if (status === 429) return 'rate_limited';
  if (status === 502 || status === 503 || status === 504) return 'unavailable';
  if (status >= 500) return 'server';
  if (status >= 400) return 'unknown_status';
  return null;
}

function kindFromCode(code: string): ErrorKind | null {
  switch (code) {
    case '42501': // RLS / privilégio
    case 'insufficient_privilege':
      return 'forbidden';
    case '23505':
      return 'conflict';
    case 'user_already_exists':
    case 'email_exists':
      return 'email_taken';
    case 'weak_password':
      return 'weak_password';
    case 'same_password':
      return 'same_password';
    case '23503':
      return 'in_use';
    case '23514':
    case '22P02':
    case '22007':
    case '22003':
    case '22001':
      return 'invalid_data';
    case 'PGRST116':
    case 'PGRST202': // função (RPC) inexistente
    case '42883':
    case '42P01':
      return 'not_found';
    case 'PGRST301':
    case 'PGRST303':
    case 'bad_jwt':
    case 'session_not_found':
    case 'refresh_token_not_found':
      return 'unauthorized';
    case '57014': // statement timeout
      return 'db_timeout';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
    case 'too_many_requests':
      return 'rate_limited';
    default:
      return null;
  }
}

/** Lê qualquer coisa que uma chamada ao Supabase, ao `fetch` ou ao navegador
 * possa devolver e classifica. */
export function describeError(err: unknown): ErrorInfo {
  const r = asRecord(err);
  const original =
    err instanceof Error ? err.message : r && typeof r.message === 'string' ? (r.message as string) : typeof err === 'string' ? err : null;
  const status = statusOf(err);
  const code = r && typeof r.code === 'string' ? (r.code as string) : null;
  const name = err instanceof Error ? err.name : null;

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (offline && (!status || status >= 500)) return { kind: 'offline', status, custom: null, original };
  if (name === 'TimeoutError') return { kind: 'timeout', status, custom: null, original };

  // O código do banco é a pista mais precisa (ex.: 57014 = consulta lenta, que
  // também contém a palavra "timeout" no texto), por isso vem antes dos testes de texto.
  const byCode = code ? kindFromCode(code) : null;
  if (byCode) return { kind: byCode, status, custom: null, original };
  if (original && TIMEOUT_RE.test(original)) return { kind: 'timeout', status, custom: null, original };
  if (original && NETWORK_RE.test(original)) return { kind: 'offline', status, custom: null, original };
  if (original && /jwt expired|invalid jwt|refresh token/i.test(original)) return { kind: 'unauthorized', status, custom: null, original };
  if (original && /row-level security|permission denied/i.test(original)) return { kind: 'forbidden', status, custom: null, original };

  const byStatus = status ? kindFromStatus(status) : null;
  // Mensagem de negócio em português (ex.: raise exception do banco, erro de Edge Function):
  // é mais específica do que qualquer texto genérico, então prevalece.
  if (original && PT_RE.test(original) && !NETWORK_RE.test(original)) return { kind: null, status, custom: original, original };
  if (byStatus) return { kind: byStatus, status, custom: null, original };
  return { kind: null, status, custom: null, original };
}

function stripEnd(s: string): string {
  return s.trim().replace(/[.!:\s]+$/, '');
}

/** Texto pronto para mostrar. `action` (opcional) diz o que se tentava fazer,
 * ex.: "Falha ao salvar o nome." — vira o começo da frase. */
export function friendlyMessage(err: unknown, action?: string): string {
  const info = describeError(err);
  if (info.custom) return info.custom;
  const prefix = action ? `${stripEnd(action)}. ` : '';
  if (info.kind && info.kind !== 'unknown_status') return `${prefix}${ERROR_TEXT[info.kind]}`;
  if (info.kind === 'unknown_status') {
    return `${prefix}Algo deu errado (código ${info.status}): tente de novo. Se repetir, avise o suporte.`;
  }
  // Sem pista nenhuma: mostra a ação (ou algo genérico) com um caminho de saída.
  if (action) return `${stripEnd(action)}. Tente de novo. Se repetir, avise o suporte.`;
  return info.original ?? 'Algo deu errado: tente de novo. Se repetir, avise o suporte.';
}
