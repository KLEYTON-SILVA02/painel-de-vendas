import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHelpMode } from '../routes/HelpModeContext';
import { useHelpTips } from '../lib/queries';

const BALLOON_WIDTH = 224; // w-56
const VIEWPORT_MARGIN = 8;

/** Balão de ajuda (função Tutoriais, Etapa 1) — um badge "?" pequeno ao lado
 * de um botão/campo, que ao clicar mostra uma explicação curta. `fallback`
 * é o texto usado se `helpKey` ainda não tiver uma linha em `help_tips`
 * (ex.: recém-adicionado no código, migration de conteúdo ainda não rodou) —
 * assim a tela nunca fica com um "?" mudo. Some por completo quando o "Modo
 * de Ajuda" está desligado (ver HelpModeContext).
 *
 * O balão em si é renderizado via portal direto em `document.body`, com
 * `position: fixed` calculada a partir da posição real do botão na tela —
 * isso é o que evita o corte relatado: um `position: absolute` comum fica
 * preso à área visível (overflow) do card/painel mais próximo que a
 * contenha, então balões perto da borda de uma tela rolável ou de um card
 * mais justo apareciam cortados. Renderizando fora dessa hierarquia, o
 * balão sempre fica por cima do resto do sistema, inteiro. */
export function HelpTip({ helpKey, fallback }: { helpKey: string; fallback?: string }) {
  const { helpModeEnabled } = useHelpMode();
  const { data: tips } = useHelpTips();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - BALLOON_WIDTH / 2, VIEWPORT_MARGIN),
      window.innerWidth - BALLOON_WIDTH - VIEWPORT_MARGIN,
    );
    setPos({ top: rect.bottom + 6, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onOutsideClick(e: MouseEvent) {
      const target = e.target as Node;
      if (btnRef.current && !btnRef.current.contains(target) && !(target as Element).closest?.('[data-help-tip-balloon]')) {
        setOpen(false);
      }
    }
    // Fecha ao rolar em vez de tentar acompanhar a posição — evita o balão
    // ficar "grudado" no lugar errado da tela conforme o conteúdo rola.
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener('mousedown', onOutsideClick);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onOutsideClick);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  if (!helpModeEnabled) return null;
  const texto = tips?.[helpKey] ?? fallback;
  if (!texto) return null;

  return (
    <span className="relative inline-flex align-middle">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Ajuda"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-cyan-500/60 text-[10px] font-bold leading-none text-cyan-400 hover:bg-cyan-500/10"
      >
        ?
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            data-help-tip-balloon
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: BALLOON_WIDTH, zIndex: 9999 }}
            className="rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-xs leading-snug text-slate-200 shadow-xl"
          >
            {texto}
          </div>,
          document.body,
        )}
    </span>
  );
}
