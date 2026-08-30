import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import './styles/mobile-v2.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// The plugin's own auto-injected registerSW.js only checks for a new
// version on page load — a PWA instance left open for days (exactly how
// this app is normally used) never notices a new deploy. Re-registering
// here with an explicit poll picks up new builds while the app stays open,
// and (via workbox's skipWaiting/clientsClaim, set in vite.config.ts)
// activates them immediately, no manual reload needed.
if ('serviceWorker' in navigator) {
  const updateSW = registerSW({ immediate: true })
  setInterval(() => updateSW(), 60 * 60 * 1000)
}
