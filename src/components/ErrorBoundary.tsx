import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportCaughtRenderError } from '../lib/reportClientError';

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
  /** True once a chunk-load error has already triggered one auto-reload
   * this mount and it happened AGAIN — i.e. the auto-recovery attempt
   * itself didn't land on a fresh build (a second deploy shipped before the
   * reload could stabilize, common during a burst of same-day releases).
   * Without this, the static "Atualizando…" placeholder below renders
   * forever with no way out, since no further auto-reload is scheduled. */
  chunkReloadExhausted: boolean;
}

/** Without this, ANY uncaught render error anywhere in the tree — a chunk
 * load failure on a lazy route, a null value a screen didn't guard
 * against, a runtime type mismatch — unmounts the entire React app: every
 * button, every nav link, everything on the page stops responding, which
 * is what reads to a user as "the whole system froze" over a single
 * broken feature. This catches it and offers a way back instead. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, chunkReloadExhausted: false };

  static getDerivedStateFromError(error: Error): Pick<State, 'error'> {
    return { error };
  }

  // Mounting here only happens once per real page load — i.e. once the
  // browser has successfully fetched and run the CURRENT (non-stale) entry
  // bundle. That proves any earlier stale-chunk incident is behind us, so
  // the one-shot auto-reload budget below is reset for whatever the *next*
  // deploy brings, instead of never firing again for the rest of this tab's
  // lifetime (sessionStorage persists across reloads until the tab closes).
  componentDidMount() {
    try {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    } catch {
      // sessionStorage unavailable (private mode) — nothing to reset.
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
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
      // Second chunk-load error without a successful mount in between (e.g.
      // another deploy shipped before the first auto-reload could land on a
      // stable build — expected during a burst of same-day releases). No
      // further auto-reload is scheduled, so the render below must offer a
      // manual way out instead of the silent "Atualizando…" placeholder,
      // which would otherwise sit there forever looking like a frozen app.
      this.setState({ chunkReloadExhausted: true });
    }
    console.error('Uncaught error rendering the app:', error);
    // A stale-chunk reload above is a known, self-healing case — not worth a
    // report. Anything else is a genuine render bug with no other trace
    // today (client_error_reports only ever sees window.onerror/
    // unhandledrejection, which React never lets reach it once this
    // boundary catches the error), so report it here instead.
    if (!isChunkLoadError(error)) reportCaughtRenderError(error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      if (isChunkLoadError(this.state.error)) {
        if (this.state.chunkReloadExhausted) {
          return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
              <div className="max-w-sm w-full rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
                <h2 className="text-base font-semibold mb-2">Nova versão disponível</h2>
                <p className="text-sm text-slate-400 mb-4">
                  O sistema foi atualizado enquanto esta tela estava aberta. Toque abaixo para carregar a versão mais
                  recente.
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm"
                >
                  Atualizar agora
                </button>
              </div>
            </div>
          );
        }
        // Auto-reload already fired in componentDidCatch — show a brief,
        // calm placeholder while it lands instead of a blank tab.
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
