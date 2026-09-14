import { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

/** On a native Capacitor app, the OS freely suspends JS timers while the
 * app is backgrounded (screen off, user switches app, etc.) — including
 * supabase-js's own background timer that keeps the access token refreshed
 * ahead of expiry. Reopening the app after any real time in the background
 * can find the access token already expired; the *first* write the user
 * then makes (photo upload, saving a username, any RPC) fails outright
 * with a raw network error ("Failed to fetch") instead of a clean 401,
 * because the failed refresh attempt itself never completes before the
 * request goes out — this is the exact failure pattern reported on the
 * collaborator's mobile Configurações screen. Supabase's own guidance for
 * Capacitor/React Native is to drive `startAutoRefresh`/`stopAutoRefresh`
 * from the OS foreground/background signal instead of relying on the
 * timer surviving suspension — this hook wires that up. No-op on web/PWA,
 * where there's no such suspension to work around. */
export function useNativeAuthRefresh() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    supabase.auth.startAutoRefresh();
    const listener = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });

    return () => {
      listener.then((h) => h.remove());
    };
  }, []);
}
