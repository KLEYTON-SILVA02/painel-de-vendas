import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';

// Compact "Voltar" button for secondary/drill-down screens (ADM maintenance
// pages reached only from the AdminLandingPage grid, with no sidebar link
// of their own) — uses react-router's own history stack (navigate(-1))
// instead of a hardcoded destination, so it always lands wherever the user
// actually came from and never fights the browser's own back button or
// creates a separate navigation concept.
export function BackButton({ style }: { style?: CSSProperties }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(-1)}
      title="Voltar"
      aria-label="Voltar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 30,
        height: 30,
        borderRadius: 8,
        border: '1px solid #212948',
        background: 'transparent',
        color: '#8b90bf',
        fontSize: 16,
        fontWeight: 700,
        cursor: 'pointer',
        flexShrink: 0,
        ...style,
      }}
    >
      ‹
    </button>
  );
}
