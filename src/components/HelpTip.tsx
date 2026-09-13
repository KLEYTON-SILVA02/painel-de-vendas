import { useEffect, useRef, useState } from 'react';
import { useHelpMode } from '../routes/HelpModeContext';
import { useHelpTips } from '../lib/queries';

/** Balão de ajuda (função Tutoriais, Etapa 1) — um badge "?" pequeno ao lado
 * de um botão/campo, que ao clicar mostra uma explicação curta. `fallback`
 * é o texto usado se `helpKey` ainda não tiver uma linha em `help_tips`
 * (ex.: recém-adicionado no código, migration de conteúdo ainda não rodou) —
 * assim a tela nunca fica com um "?" mudo. Some por completo quando o "Modo
 * de Ajuda" está desligado (ver HelpModeContext). */
export function HelpTip({ helpKey, fallback }: { helpKey: string; fallback?: string }) {
  const { helpModeEnabled } = useHelpMode();
  const { data: tips } = useHelpTips();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutsideClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, [open]);

  if (!helpModeEnabled) return null;
  const texto = tips?.[helpKey] ?? fallback;
  if (!texto) return null;

  return (
    <span ref={wrapRef} className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Ajuda"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-cyan-500/60 text-[10px] font-bold leading-none text-cyan-400 hover:bg-cyan-500/10"
      >
        ?
      </button>
      {open && (
        <div className="absolute left-1/2 top-full z-50 mt-1.5 w-56 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-xs leading-snug text-slate-200 shadow-xl">
          {texto}
        </div>
      )}
    </span>
  );
}
