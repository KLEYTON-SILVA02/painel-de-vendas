import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import './styles/mobile-v2.css'
import App from './App.tsx'
import { installClientErrorReporter } from './lib/reportClientError'

installClientErrorReporter()

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

  // No celular o app passa horas em segundo plano (e o timer acima pausa junto).
  // Ao voltar para a tela, confere se saiu versão nova — no máximo 1 vez a cada
  // 5 minutos — para o app instalado receber as melhorias logo, sem esperar a hora cheia.
  let lastCheck = Date.now()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    if (Date.now() - lastCheck < 5 * 60 * 1000) return
    lastCheck = Date.now()
    updateSW()
  })
}
