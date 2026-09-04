// Quick-access switch between the new split-podium ranking design
// (PodiumSplit, "Premium") and the classic single-row one (PodiumStaircase,
// "Escadinha") — sits right next to Copiar/Gerar imagem on every screen that
// offers it, writing straight to store_settings.ranking_moderno so every
// such screen stays in sync. Shows the name of whichever model is currently
// on screen (not a generic ON/OFF) — clicking it swaps to the other one.

// `shrink` scales padding/font-size down with the viewport instead of the
// default fixed sizing — used where this button shares a non-wrapping row
// with other buttons that need to shrink together to avoid the row getting
// clipped (see DashboardPage's "Ranking Geral" header).
export function RankingModeToggle({ on, onToggle, shrink }: { on: boolean; onToggle: () => void; shrink?: boolean }) {
  return (
    <button
      onClick={onToggle}
      title="Alternar modelo de ranking"
      style={{
        background: 'transparent',
        border: `1px solid ${on ? '#00e676' : '#212948'}`,
        color: on ? '#00e676' : '#8b90bf',
        padding: shrink ? 'clamp(3px, 0.5vw, 7px) clamp(4px, 0.9vw, 13px)' : '7px 13px',
        borderRadius: 10,
        cursor: 'pointer',
        fontSize: shrink ? 'clamp(8px, 0.85vw, 12px)' : 12,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {on ? '🏆 Premium' : '🪜 Escadinha'}
    </button>
  );
}
