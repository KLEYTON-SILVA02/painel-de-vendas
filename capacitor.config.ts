import type { CapacitorConfig } from '@capacitor/cli';

// `server.url` points the native WebView at the live production deploy
// (https://painel-de-vendas-orcin.vercel.app — the one the ADM and
// collaborators actually use day to day, confirmed by the user) instead of
// loading the `webDir: 'dist'` snapshot bundled into the APK at build time.
// This is the deliberate choice over the Capacitor default: every code
// change deployed to that URL reaches the already-installed app on its next
// launch, with no new APK to build or reinstall — matching how the PWA
// already behaves in a browser. `webDir` stays set because Capacitor still
// needs it to resolve local config/plugin assets at build time; it's not
// what gets shown once `server.url` is set. The one real trade-off is that
// the app now requires connectivity to open at all — an acceptable one
// here, since every screen already depends on a live Supabase connection
// and has no meaningful offline mode to lose.
const config: CapacitorConfig = {
  appId: 'com.gestaodevendas.app',
  appName: 'Gestão de Vendas',
  webDir: 'dist',
  server: {
    url: 'https://painel-de-vendas-orcin.vercel.app',
    cleartext: false,
  },
};

export default config;
