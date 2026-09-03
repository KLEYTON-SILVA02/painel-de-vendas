// Quick-access switch between the new split-podium ranking design
// (PodiumSplit, "Premium") and the classic single-row one (PodiumStaircase,
// "Escadinha") — sits right next to Copiar/Gerar imagem on every screen that
// offers it, writing straight to store_settings.ranking_moderno so every
// such screen stays in sync. Shows the name of whichever model is currently
// on screen (not a generic ON/OFF) — clicking it swaps to the other one.

export function RankingModeToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title="Alternar modelo de ranking"
      style={{
        background: 'transparent',
        border: `1px solid ${on ? '#00e676' : '#212948'}`,
        color: on ? '#00e676' : '#8b90bf',
        padding: '7px 13px',
        borderRadius: 10,
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {on ? '🏆 Premium' : '🪜 Escadinha'}
    </button>
  );
}
