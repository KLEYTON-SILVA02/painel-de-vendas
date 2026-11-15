import { describe, expect, it } from 'vitest';
import { decryptText, encryptText, forgetLogin, recallLogin, rememberLogin, type RememberDeps } from './rememberedLogin';

function makeDeps(over: Partial<RememberDeps> = {}): RememberDeps & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  const keys = new Map<string, CryptoKey>();
  return {
    raw,
    text: {
      getItem: (k: string) => raw.get(k) ?? null,
      setItem: (k: string, v: string) => void raw.set(k, v),
      removeItem: (k: string) => void raw.delete(k),
    },
    keys: { get: async (n) => keys.get(n), set: async (n, k) => void keys.set(n, k) },
    subtle: globalThis.crypto.subtle,
    canStorePassword: true,
    ...over,
  };
}

describe('rememberedLogin', () => {
  it('no app: guarda usuário e senha cifrada e devolve os dois', async () => {
    const d = makeDeps();
    await rememberLogin('colaborador', { identifier: '00000000', password: '00000000' }, d);
    expect(await recallLogin('colaborador', d)).toEqual({ identifier: '00000000', password: '00000000' });
    // a senha nunca fica legível no armazenamento
    expect([...d.raw.values()].some((v) => v.includes('00000000') && v !== '00000000')).toBe(false);
    expect(d.raw.get('gv.remember.colaborador.pw')).not.toContain('00000000');
  });

  it('no navegador comum: guarda só o usuário, nunca a senha', async () => {
    const d = makeDeps({ canStorePassword: false });
    await rememberLogin('admin', { identifier: 'a@b.com', password: 'segredo123' }, d);
    expect(await recallLogin('admin', d)).toEqual({ identifier: 'a@b.com', password: null });
    expect([...d.raw.keys()].some((k) => k.endsWith('.pw'))).toBe(false);
  });

  it('sem criptografia disponível: guarda só o usuário', async () => {
    const d = makeDeps({ subtle: undefined });
    await rememberLogin('admin', { identifier: 'a@b.com', password: 'segredo123' }, d);
    expect(await recallLogin('admin', d)).toEqual({ identifier: 'a@b.com', password: null });
  });

  it('forgetLogin apaga tudo', async () => {
    const d = makeDeps();
    await rememberLogin('construtor', { identifier: 'x', password: 'y' }, d);
    forgetLogin('construtor', d);
    expect(await recallLogin('construtor', d)).toBeNull();
    expect(d.raw.size).toBe(0);
  });

  it('cada tipo de login guarda o seu', async () => {
    const d = makeDeps();
    await rememberLogin('admin', { identifier: 'adm', password: 'p1' }, d);
    await rememberLogin('colaborador', { identifier: 'col', password: 'p2' }, d);
    expect((await recallLogin('admin', d))?.password).toBe('p1');
    expect((await recallLogin('colaborador', d))?.password).toBe('p2');
  });

  it('texto cifrado adulterado vira "sem senha", sem estourar erro', async () => {
    const d = makeDeps();
    await rememberLogin('admin', { identifier: 'adm', password: 'p1' }, d);
    d.raw.set('gv.remember.admin.pw', 'AAAA.BBBB');
    expect(await recallLogin('admin', d)).toEqual({ identifier: 'adm', password: null });
  });

  it('decryptText sem chave guardada devolve null', async () => {
    const d = makeDeps();
    const enc = await encryptText(d, 'abc');
    const outro = makeDeps(); // outra "instalação": chave diferente
    expect(await decryptText(outro, enc!)).toBeNull();
  });

  it('sem armazenamento (null): não quebra', async () => {
    expect(await recallLogin('admin', null)).toBeNull();
    await expect(rememberLogin('admin', { identifier: 'a', password: 'b' }, null)).resolves.toBeUndefined();
  });
});
