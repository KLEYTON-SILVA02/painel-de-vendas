import { MobileCategoryScreen } from './MobileCategoryScreen';

export function MobileGenericosPage() {
  return <MobileCategoryScreen catKey="GEN" title="Genéricos" titleClass="mv2-genericos" accent="#f26122" commission={{ kind: 'flat', flatPct: 1 }} />;
}
