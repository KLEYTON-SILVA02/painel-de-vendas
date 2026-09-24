// Desktop counterpart to PageLoading — a screen whose data queries settled
// into an error state (network blip, a transient RLS/session hiccup) used to
// render PageLoading forever, since these guards only ever checked "is the
// data still missing", never "did the query already give up". A reload
// re-runs every query fresh, which is enough for the transient case this is
// meant to catch (a hard backend failure surfaces the same way it always
// did — an error thrown further down once render actually proceeds).
export function PageError({ fullScreen = false }: { fullScreen?: boolean } = {}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 text-sm text-slate-400 ${fullScreen ? 'min-h-screen bg-slate-950' : ''}`}
      style={fullScreen ? undefined : { minHeight: '40vh' }}
    >
      <span>Não foi possível carregar esta tela.</span>
      <button onClick={() => window.location.reload()} className="rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm">
        Tentar novamente
      </button>
    </div>
  );
}
