// Mobile-v2 counterpart to the plain "Carregando…" placeholder — a screen
// whose data queries settled into an error state (network blip, a transient
// session hiccup) used to keep showing that same "Carregando…" text forever,
// since these guards only ever checked "is the data still missing", never
// "did the query already give up". This is what fixes that: a reload
// re-runs every query fresh, which is enough for the transient case this is
// meant to catch.
export function MobileLoadError() {
  return (
    <div style={{ padding: 24, fontSize: 12, color: 'var(--mv2-texto-2)', textAlign: 'center' }}>
      <div style={{ marginBottom: 12 }}>Não foi possível carregar esta tela.</div>
      <button
        onClick={() => window.location.reload()}
        style={{ background: 'var(--mv2-dourado)', color: '#080a08', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600 }}
      >
        Tentar novamente
      </button>
    </div>
  );
}
