import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { queryPersister } from '../lib/queryPersister';
import { supabase } from '../lib/supabase';
import type { Tables } from '../types/database';

export type Profile = Tables<'profiles'>;

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  // supabase-js fires onAuthStateChange with an immediate INITIAL_SESSION
  // event right after subscribing, carrying the same session getSession()
  // below already resolves with — without this guard both fired loadProfile
  // for the same user id back to back, doubling (observed: sometimes
  // tripling, a token refresh firing its own identical event soon after)
  // the `profiles` fetch on every page load for no behavioral difference.
  const loadedForUserId = useRef<string | null>(null);

  async function loadProfile(userId: string, { force = false } = {}) {
    if (!force && loadedForUserId.current === userId) return;
    loadedForUserId.current = userId;
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setProfile(data ?? null);
  }

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        await loadProfile(newSession.user.id);
      } else {
        loadedForUserId.current = null;
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      loading,
      refreshProfile: async () => {
        if (session) await loadProfile(session.user.id, { force: true });
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
    [session, profile, loading, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
