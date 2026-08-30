import { MobileCategoryScreen } from './MobileCategoryScreen';

export function MobileDermoPage() {
  return <MobileCategoryScreen catKey="DERM" title="Dermo" titleClass="mv2-dermo" accent="#b84c9c" commission={{ kind: 'flat', flatPct: 1 }} />;
}
