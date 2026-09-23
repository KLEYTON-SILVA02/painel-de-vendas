import { useMemo, useRef, type TouchEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCategoryTypes, useStoreSettings } from '../../lib/queries';

const FIXED_CATEGORY_ROUTES: { key: string; to: string }[] = [
  { key: 'DERM', to: '/categoria/DERM' },
  { key: 'GEN', to: '/categoria/GEN' },
  { key: 'MP', to: '/categoria/MP' },
  { key: 'MER', to: '/categoria/MER' },
  { key: 'LEVMEL', to: '/categoria/LEVMEL' },
  { key: 'CHIP', to: '/categoria/CHIP' },
];

// A drag shorter than this (px) is a tap or an imprecise scroll attempt, not
// an intentional "trocar de categoria" swipe.
const SWIPE_DISTANCE_THRESHOLD = 60;
// A drag shorter than this on BOTH axes hasn't shown its direction yet —
// below it we keep watching instead of locking horizontal vs. vertical off
// the first few (possibly diagonal) touch-move pixels.
const DIRECTION_LOCK_THRESHOLD = 8;

/** Finds the nearest scrollable-on-its-own-axis ancestor (up to `root`) —
 * a swipe that starts inside one (e.g. the "Lista de vendas" table's own
 * horizontal-scroll wrapper, see MobileSellerDetail.tsx's overflowX:'auto')
 * must scroll that element instead of triggering category navigation. */
function findHorizontalScrollAncestor(node: HTMLElement | null, root: HTMLElement): HTMLElement | null {
  let el = node;
  while (el && el !== root) {
    const style = window.getComputedStyle(el);
    if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

/** Swipe-left/right navigation between the store's sales category screens —
 * requested once the category icons moved out of the topbar and into the
 * drawer-only menu (see MobileAdminShell.tsx), so switching categories no
 * longer needs opening the drawer every time.
 *
 * The swipeable set mirrors exactly what the desktop Sidebar's own
 * "Categorias" + "Programas" category items already are: the 6 categorias
 * fixas (respecting store_settings.hidden_categories, same as the drawer),
 * then Biosintética, DSM (only when ativo — same "ocultar" rule as
 * everywhere else DSM appears) and any ADM-created categorias extras, in
 * that order. Início, Ranking, Dinâmicas, Conquistas and ADM are
 * deliberately excluded — they aren't "categorias", the user's own word for
 * this feature's scope. No preventDefault/native-scroll hijacking anywhere:
 * this only ever *reads* the touch path and navigates on touchend, so it
 * can never break a screen's existing vertical scrolling. */
export function useCategorySwipeNav() {
  const { data: categoryTypes } = useCategoryTypes();
  const { data: storeSettings } = useStoreSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const touchRef = useRef<{ x: number; y: number; locked: 'h' | 'v' | null; skip: boolean } | null>(null);

  const routes = useMemo(() => {
    const hidden = storeSettings?.hidden_categories ?? [];
    const bioCategory = (categoryTypes ?? []).find((c) => c.chave === 'biosintetica');
    const dsmCategory = (categoryTypes ?? []).find((c) => c.chave === 'dsm');
    const extraCategories = (categoryTypes ?? []).filter((c) => c.chave !== 'biosintetica' && c.chave !== 'dsm');
    return [
      ...FIXED_CATEGORY_ROUTES.filter((c) => !hidden.includes(c.key)).map((c) => c.to),
      ...(bioCategory ? ['/bio'] : []),
      ...(dsmCategory && dsmCategory.ativo ? ['/dsm'] : []),
      ...extraCategories.map((c) => `/categoria-parceria/${c.chave}`),
    ];
  }, [categoryTypes, storeSettings]);

  const currentIndex = routes.indexOf(location.pathname);

  function onTouchStart(e: TouchEvent<HTMLElement>) {
    if (currentIndex === -1 || e.touches.length > 1) {
      touchRef.current = null;
      return;
    }
    const t = e.touches[0];
    const scrollable = findHorizontalScrollAncestor(e.target as HTMLElement, e.currentTarget);
    touchRef.current = { x: t.clientX, y: t.clientY, locked: null, skip: !!scrollable };
  }

  function onTouchMove(e: TouchEvent<HTMLElement>) {
    const st = touchRef.current;
    if (!st || st.skip || st.locked || e.touches.length > 1) return;
    const t = e.touches[0];
    const dx = t.clientX - st.x;
    const dy = t.clientY - st.y;
    if (Math.abs(dx) < DIRECTION_LOCK_THRESHOLD && Math.abs(dy) < DIRECTION_LOCK_THRESHOLD) return;
    st.locked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
  }

  function onTouchEnd(e: TouchEvent<HTMLElement>) {
    const st = touchRef.current;
    touchRef.current = null;
    if (!st || st.skip || st.locked !== 'h' || currentIndex === -1) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - st.x;
    if (Math.abs(dx) < SWIPE_DISTANCE_THRESHOLD) return;
    // Swipe left (dx < 0, finger moves toward the start of the screen) goes
    // to the NEXT category, mirroring how a left/forward swipe reads on a
    // page carousel; swipe right goes back. Clamps at the edges instead of
    // wrapping around — no-op past the first/last category.
    const nextIndex = dx < 0 ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0 || nextIndex >= routes.length) return;
    navigate(routes[nextIndex]);
  }

  return { onTouchStart, onTouchMove, onTouchEnd };
}
