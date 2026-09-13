import { createContext, useContext, useState, type ReactNode } from 'react';

// "Modo de Ajuda" — liga/desliga os balões de ajuda (<HelpTip>) do sistema
// inteiro de uma vez. É uma preferência pessoal de baixo risco (não afeta
// dados, só o que aparece na tela), então fica no localStorage do navegador
// em vez de ir ao banco — ao contrário do progresso de tutoriais
// (tutorial_progress), que precisa mesmo ser por conta, esta aqui não.
const STORAGE_KEY = 'gv_modo_ajuda';

function readStored(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

interface HelpModeState {
  helpModeEnabled: boolean;
  toggleHelpMode: () => void;
}

const HelpModeContext = createContext<HelpModeState | undefined>(undefined);

export function HelpModeProvider({ children }: { children: ReactNode }) {
  const [helpModeEnabled, setHelpModeEnabled] = useState(readStored);

  function toggleHelpMode() {
    setHelpModeEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // localStorage indisponível (aba privada, etc.) — a preferência
        // simplesmente não sobrevive a um recarregamento, sem quebrar nada.
      }
      return next;
    });
  }

  return <HelpModeContext.Provider value={{ helpModeEnabled, toggleHelpMode }}>{children}</HelpModeContext.Provider>;
}

export function useHelpMode(): HelpModeState {
  const ctx = useContext(HelpModeContext);
  if (!ctx) throw new Error('useHelpMode must be used within a HelpModeProvider');
  return ctx;
}
