import type { CapacitorConfig } from '@capacitor/cli';

// Wraps the exact same Vite build already served as the PWA (webDir: 'dist')
// in a native Android shell — no separate app codebase to maintain. Run
// `npm run build && npx cap sync android` after any web change, then build
// the APK from android/ (see .github/workflows/android-apk.yml for the
// reproducible CI build, or README notes for a local build).
const config: CapacitorConfig = {
  appId: 'com.gestaodevendas.app',
  appName: 'Gestão de Vendas',
  webDir: 'dist',
};

export default config;
