import { Spinner } from './Spinner';

// Standard "data still loading" placeholder for desktop ADM screens —
// centered in the available content area with the same spinner used by
// ImportarPage's in-progress states, instead of a bare left-aligned
// "Carregando…" string.
export function PageLoading({ fullScreen = false }: { fullScreen?: boolean } = {}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 text-sm text-slate-500 ${fullScreen ? 'min-h-screen bg-slate-950' : ''}`}
      style={fullScreen ? undefined : { minHeight: '40vh' }}
    >
      <Spinner size={28} />
      <span>Carregando…</span>
    </div>
  );
}
