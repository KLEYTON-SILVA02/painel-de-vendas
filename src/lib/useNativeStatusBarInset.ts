import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';

/** Android 15+ (this app's compileSdk) renders apps edge-to-edge by
 * default — the WebView draws underneath the OS status bar (clock, wifi,
 * signal, notification icons) instead of starting below it, exactly the
 * overlap the user reported on the installed APK. `overlay: false` tells
 * Android to resize/inset the WebView so it never draws under that area,
 * with the OS supplying the exact pixel amount for each device (notch,
 * punch-hole camera, etc.) — the only reliable fix, since any single
 * hardcoded gap (screenshot-measured pixel values included) would be
 * wrong on every phone but the one it was measured on. A no-op on web/PWA,
 * where there's no status bar to begin with. */
export function useNativeStatusBarInset() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
  }, []);
}
