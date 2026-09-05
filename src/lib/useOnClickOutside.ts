import { useEffect } from 'react';

/** Calls `handler` on any pointerdown outside `ref`'s element — the usual
 * way to close a dropdown/popover without a click also having to land on
 * a dedicated backdrop element. */
export function useOnClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) handler();
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [ref, handler]);
}
