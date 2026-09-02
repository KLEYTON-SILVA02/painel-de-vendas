import { Component, type ReactNode } from 'react';

const CHUNK_RELOAD_KEY = 'gv_chunk_reload_attempted';

/** A dynamic import() (every lazy-loaded route in this app) rejects with
 * one of these messages when the browser fetches a JS chunk that no
 * longer exists on the server — the classic case being a PWA session left
 * open across a deploy: the service worker/browser still has yesterday's
 * index.html, which references chunk hashes today's server doesn't serve
 * anymore. The fix is a normal reload (picks up the new index.html + chunk
 * manifest), not a dead app. */
function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(message);
}

interface State {
  error: Error | null;
}

/** Without this, ANY uncaught render error anywhere in the tree — a chunk
 * load failure on a lazy route, a null value a screen didn't guard
 * against, a runtime type mismatch — unmounts the entire React app: every
 * button, every nav link, everything on the page stops responding, which
 * is what reads to a user as "the whole system froze" over a single
 * broken feature. This catches it and offers a way back instead. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (isChunkLoadError(error)) {
      let alreadyTried = false;
      try {
        alreadyTried = sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1';
        if (!alreadyTried) sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
      } catch {
        // sessionStorage unavailable (private mode) — fall through to the
        // manual-reload fallback UI below instead of auto-reloading.
      }
      if (!alreadyTried) {
        window.location.reload();
        return;
      }
    }
    console.error('Uncaught error rendering the app:', error);
  }

  render() {
    if (this.state.error) {
      if (isChunkLoadError(this.state.error)) {
        // Auto-reload already fired in componentDidCatch (or isn't
        // possible) — show a brief, calm placeholder either way instead
        // of a blank tab while that reload lands.
        return (
          <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 text-sm p-6">
            Atualizando o aplicativo…
          </div>
        );
      }
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
          <div className="max-w-sm w-full rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
            <h2 className="text-base font-semibold mb-2">Algo deu errado</h2>
            <p className="text-sm text-slate-400 mb-4">
              Essa tela encontrou um erro inesperado. Recarregar a página normalmente resolve.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm"
            >
              Recarregar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
