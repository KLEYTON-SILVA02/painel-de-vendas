import { useEffect, useState } from 'react';

// Matches the mobile v2 spec's own breakpoint ("versão desktop existe a
// partir de min-width:1024px"): below that, admins get the new mv2
// topbar+category-menu shell; at or above it, the existing desktop
// Sidebar shell keeps serving unchanged.
const QUERY = '(max-width: 1023px)';

export function useIsMobileV2(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
