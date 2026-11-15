import { describe, expect, it } from 'vitest';
import { describeError, ERROR_TEXT, friendlyMessage } from './friendlyError';

describe('friendlyMessage', () => {
  it('mapeia status HTTP comuns', () => {
    expect(friendlyMessage({ status: 400, message: 'Bad Request' })).toBe(ERROR_TEXT.bad_request);
    expect(friendlyMessage({ status: 401, message: 'x' })).toBe(ERROR_TEXT.unauthorized);
    expect(friendlyMessage({ status: 403, message: 'x' })).toBe(ERROR_TEXT.forbidden);
    expect(friendlyMessage({ status: 404, message: 'Not Found' })).toBe(ERROR_TEXT.not_found);
    expect(friendlyMessage({ status: 409, message: 'x' })).toBe(ERROR_TEXT.conflict);
    expect(friendlyMessage({ statusCode: '413', message: 'Payload too large' })).toBe(ERROR_TEXT.too_large);
    expect(friendlyMessage({ status: 429, message: 'x' })).toBe(ERROR_TEXT.rate_limited);
    expect(friendlyMessage({ status: 500, message: 'x' })).toBe(ERROR_TEXT.server);
    expect(friendlyMessage({ status: 503, message: 'x' })).toBe(ERROR_TEXT.unavailable);
  });

  it('status desconhecido mostra o código', () => {
    expect(friendlyMessage({ status: 418, message: 'teapot' })).toContain('código 418');
  });

  it('códigos do banco', () => {
    expect(friendlyMessage({ code: '42501', message: 'permission denied for table sales' })).toBe(ERROR_TEXT.forbidden);
    expect(friendlyMessage({ code: '23505', message: 'duplicate key value' })).toBe(ERROR_TEXT.conflict);
    expect(friendlyMessage({ code: '23503', message: 'violates foreign key' })).toBe(ERROR_TEXT.in_use);
    expect(friendlyMessage({ code: 'PGRST116', message: 'JSON object requested' })).toBe(ERROR_TEXT.not_found);
    expect(friendlyMessage({ code: 'PGRST202', message: 'Could not find the function' })).toBe(ERROR_TEXT.not_found);
    expect(friendlyMessage({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(ERROR_TEXT.db_timeout);
  });

  it('falta de internet e tempo esgotado', () => {
    expect(friendlyMessage(new TypeError('Failed to fetch'))).toBe(ERROR_TEXT.offline);
    expect(friendlyMessage(new TypeError('Load failed'))).toBe(ERROR_TEXT.offline);
    const t = new DOMException('Tempo limite da requisição esgotado', 'TimeoutError');
    expect(friendlyMessage(t)).toBe(ERROR_TEXT.timeout);
  });

  it('mensagem de regra de negócio em português passa direto', () => {
    expect(friendlyMessage({ code: 'P0001', message: 'Este colaborador já tem acesso' })).toBe('Este colaborador já tem acesso');
    expect(friendlyMessage(new Error('Matrícula não encontrada.'), 'Falha ao salvar')).toBe('Matrícula não encontrada.');
  });

  it('com ação, a frase começa por ela', () => {
    expect(friendlyMessage({ status: 500, message: 'x' }, 'Falha ao salvar o nome.')).toBe(`Falha ao salvar o nome. ${ERROR_TEXT.server}`);
  });

  it('sessão expirada pelo texto', () => {
    expect(friendlyMessage({ message: 'JWT expired' })).toBe(ERROR_TEXT.unauthorized);
  });

  it('erro técnico sem pista usa a ação com caminho de saída', () => {
    expect(friendlyMessage({ message: 'weird internal thing' }, 'Falha ao enviar o ícone.')).toBe(
      'Falha ao enviar o ícone. Tente de novo. Se repetir, avise o suporte.',
    );
    expect(friendlyMessage(null)).toContain('tente de novo');
  });

  it('describeError lê status do Response de Edge Function', () => {
    expect(describeError({ message: 'Edge Function returned a non-2xx status code', context: { status: 404 } }).kind).toBe('not_found');
  });
});
