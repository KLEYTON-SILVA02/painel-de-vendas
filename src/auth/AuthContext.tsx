import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { queryPersister } from '../lib/queryPersister';
import { setReportingProfile } from '../lib/reportClientError';
import { supabase } from '../lib/supabase';
import type { Tables } from '../types/database';

export type Profile = Tables<'profiles'>;

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** Set when the initial session bootstrap (getSession, below) fails or
   * times out — distinct from `loading`, so the login gate (App.tsx) can
   * show a "couldn't connect" screen with a retry instead of spinning
   * forever on an unstable connection. */
  bootError: string | null;
  /** Set when a signed-in session's own `profiles` row fails to load or
   * times out — distinct from "no profile yet" (Acesso Construtor, or a
   * store pending approval), so AppShell can show a retry button instead
   * of "Preparando sua conta…" forever. */
  profileError: string | null;
  refreshProfile: () => Promise<void>;
  retryBoot: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

// Neither Supabase call below had its own timeout — on an unstable
// connection (a stalled token refresh, a request that never gets a
// response) the promise simply never settles, leaving `loading`
// (bootstrap) or the profile fetch stuck forever with nothing to react to.
// Racing each against a plain timer turns "never" into "fails after N
// seconds", which at least gives the UI an error to show and a retry to
// offer instead of an endless spinner.
const BOOT_TIMEOUT_MS = 10_000;
const PROFILE_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);
  // supabase-js fires onAuthStateChange with an immediate INITIAL_SESSION
  // event right after subscribing, carrying the same session getSession()
  // below already resolves with — both call loadProfile() for the same
  // user id in quick succession. The old guard just recorded "a fetch for
  // this id already started" and let whichever call arrived second return
  // immediately WITHOUT waiting for the first one's result, so it could
  // (and in practice did) call setLoading(false) before the real profile
  // had actually arrived. Storing the in-flight PROMISE instead — not just
  // a "done" flag — lets both callers await the exact same fetch, so
  // neither moves on until the profile (or its error) has truly landed.
  const profilePromiseRef = useRef<{ userId: string; promise: Promise<void> } | null>(null);

  function loadProfile(userId: string, { force = false } = {}): Promise<void> {
    if (!force && profilePromiseRef.current?.userId === userId) {
      return profilePromiseRef.current.promise;
    }
    const promise = (async () => {
      try {
        const { data, error } = await withTimeout(
          supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
          PROFILE_TIMEOUT_MS,
          'Tempo esgotado ao carregar o perfil.',
        );
        if (error) throw error;
        setProfile(data ?? null);
        setReportingProfile(data ? { storeId: data.store_id, profileId: data.id } : null);
        setProfileError(null);
      } catch (err) {
        // Deliberately doesn't rethrow — a failed fetch still needs to let
        // the bootstrap/auth-state callers move past `loading`, just with
        // `profileError` set instead of a resolved profile. AppShell uses
        // that to show a retry button rather than hanging on "Preparando
        // sua conta…" with no way out.
        setProfileError(err instanceof Error ? err.message : 'Falha ao carregar o perfil.');
      }
    })();
    profilePromiseRef.current = { userId, promise };
    return promise;
  }

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      setBootError(null);
      try {
        const { data } = await withTimeout(supabase.auth.getSession(), BOOT_TIMEOUT_MS, 'Tempo esgotado ao conectar.');
        if (!active) return;
        setSession(data.session);
        if (data.session) await loadProfile(data.session.user.id);
      } catch (err) {
        if (!active) return;
        setBootError(err instanceof Error ? err.message : 'Não foi possível conectar.');
      } finally {
        if (active) setLoading(false);
      }
    }

    bootstrap();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        await loadProfile(newSession.user.id);
      } else {
        profilePromiseRef.current = null;
        setProfile(null);
        setProfileError(null);
        setReportingProfile(null);
      }
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootAttempt]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      loading,
      bootError,
      profileError,
      refreshProfile: async () => {
        if (session) await loadProfile(session.user.id, { force: true });
      },
      // Re-runs the whole bootstrap effect (fresh getSession + a fresh
      // onAuthStateChange subscription) after a connection failure — the
      // simplest "really start over" a person can ask for from the error
      // screen in App.tsx.
      retryBoot: () => {
        setLoading(true);
        setBootError(null);
        setBootAttempt((n) => n + 1);
      },
      signOut: async () => {
        await supabase.auth.signOut();
        // Without this, the persisted IndexedDB cache (queryPersister)
        // survives the sign-out — on a shared device, the next person to
        // log in (a different collaborator, or the ADM after one) would
        // briefly see the previous session's cached data on screen before
        // their own queries finish loading. queryClient.clear() empties
        // the in-memory cache; removeClient() clears what's on disk too,
        // since the persister only overwrites its stored snapshot on the
        // next successful save, not immediately on clear().
        queryClient.clear();
        await queryPersister.removeClient();
      },
    }),
    [session, profile, loading, bootError, profileError, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
