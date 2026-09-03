// Quick-access switch between the new split-podium ranking design
// (PodiumSplit) and the classic single-row one (PodiumStaircase) — sits
// right next to Copiar/Gerar imagem on every screen that offers it, writing
// straight to store_settings.ranking_moderno so every such screen stays in sync.

export function RankingModeToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title="Alternar modelo de ranking"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: on ? '#00e676' : 'transparent',
        border: `1.5px solid ${on ? '#00e676' : '#212948'}`,
        color: on ? '#04210a' : '#8b90bf',
        borderRadius: 9999,
        padding: '7px 13px',
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '.04em',
      }}
    >
      Novo ranking
      <span
        style={{
          width: 26,
          height: 15,
          borderRadius: 9999,
          background: on ? 'rgba(4,33,10,.35)' : '#212948',
          position: 'relative',
          flexShrink: 0,
          transition: 'background .15s',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: on ? 13 : 2,
            width: 11,
            height: 11,
            borderRadius: '50%',
            background: on ? '#04210a' : '#8b90bf',
            transition: 'left .15s',
          }}
        />
      </span>
      {on ? 'ON' : 'OFF'}
    </button>
  );
}
