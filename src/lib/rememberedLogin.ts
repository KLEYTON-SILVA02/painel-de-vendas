import { Capacitor } from '@capacitor/core';
import { createStore, get as idbGet, set as idbSet } from 'idb-keyval';

/** "Lembrar-me" da tela de login.
 *
 * - Em qualquer plataforma: guarda o usuário/matrícula digitado (nunca é segredo).
 * - Só no app instalado (APK): também guarda a senha, cifrada com AES-GCM. A chave
 *   é criada no próprio aparelho como "não exportável" e fica no IndexedDB do app,
 *   separada do texto cifrado (que fica no localStorage). No navegador comum a
 *   senha NÃO é guardada por aqui — ali quem lembra é o gerenciador de senhas do
 *   próprio navegador (por isso os campos têm autocomplete correto).
 * - Desmarcar "Lembrar-me" e entrar apaga tudo que foi guardado. */

export type LoginKind = 'admin' | 'colaborador' | 'construtor';

export interface RememberedLogin {
  identifier: string;
  password: string | null;
}

export interface RememberDeps {
  text: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  keys: {
    get: (name: string) => Promise<CryptoKey | undefined>;
    set: (name: string, key: CryptoKey) => Promise<void>;
  };
  subtle: SubtleCrypto | undefined;
  /** true só no app instalado — é o que libera guardar a senha. */
  canStorePassword: boolean;
}

const PREFIX = 'gv.remember.';
const KEY_NAME = 'gv-remember-key';

function idKey(kind: LoginKind) {
  return `${PREFIX}${kind}.id`;
}
function pwKey(kind: LoginKind) {
  return `${PREFIX}${kind}.pw`;
}

function toB64(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}
function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getOrCreateKey(deps: RememberDeps, create: boolean): Promise<CryptoKey | null> {
  if (!deps.subtle) return null;
  let key = await deps.keys.get(KEY_NAME);
  if (!key && create) {
    key = await deps.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await deps.keys.set(KEY_NAME, key);
  }
  return key ?? null;
}

export async function encryptText(deps: RememberDeps, plain: string): Promise<string | null> {
  const key = await getOrCreateKey(deps, true);
  if (!key || !deps.subtle) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await deps.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
  return `${toB64(iv)}.${toB64(ct)}`;
}

export async function decryptText(deps: RememberDeps, payload: string): Promise<string | null> {
  try {
    const key = await getOrCreateKey(deps, false);
    if (!key || !deps.subtle) return null;
    const [ivB64, ctB64] = payload.split('.');
    if (!ivB64 || !ctB64) return null;
    const plain = await deps.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivB64) }, key, fromB64(ctB64));
    return new TextDecoder().decode(plain);
  } catch {
    // texto adulterado, chave trocada ou apagada: trata como "não lembrado"
    return null;
  }
}

export function browserDeps(): RememberDeps | null {
  try {
    const store = createStore('gv-remember', 'keys');
    return {
      text: window.localStorage,
      keys: {
        get: (name) => idbGet<CryptoKey>(name, store),
        set: (name, key) => idbSet(name, key, store),
      },
      subtle: globalThis.crypto?.subtle,
      canStorePassword: Capacitor.isNativePlatform(),
    };
  } catch {
    return null;
  }
}

export async function recallLogin(kind: LoginKind, deps: RememberDeps | null = browserDeps()): Promise<RememberedLogin | null> {
  if (!deps) return null;
  try {
    const identifier = deps.text.getItem(idKey(kind));
    if (!identifier) return null;
    let password: string | null = null;
    const enc = deps.canStorePassword ? deps.text.getItem(pwKey(kind)) : null;
    if (enc) password = await decryptText(deps, enc);
    return { identifier, password };
  } catch {
    return null;
  }
}

export async function rememberLogin(
  kind: LoginKind,
  login: { identifier: string; password: string },
  deps: RememberDeps | null = browserDeps(),
): Promise<void> {
  if (!deps) return;
  try {
    deps.text.setItem(idKey(kind), login.identifier);
    if (!deps.canStorePassword) {
      deps.text.removeItem(pwKey(kind));
      return;
    }
    const enc = await encryptText(deps, login.password);
    if (enc) deps.text.setItem(pwKey(kind), enc);
    else deps.text.removeItem(pwKey(kind)); // sem criptografia disponível: nunca guarda a senha aberta
  } catch {
    // armazenamento indisponível (modo privado, cheio): o login em si não é afetado
  }
}

export function forgetLogin(kind: LoginKind, deps: RememberDeps | null = browserDeps()): void {
  if (!deps) return;
  try {
    deps.text.removeItem(idKey(kind));
    deps.text.removeItem(pwKey(kind));
  } catch {
    // nada a limpar
  }
}
