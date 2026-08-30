import type { ReactElement } from 'react';
import { useFunctionIcons } from '../../lib/queries';

/** Renders a custom SVG icon override (from ADM > Ícones) for a function
 * slot when one is configured, falling back to the built-in icon component
 * otherwise — so every existing call site keeps working unchanged until an
 * admin actually uploads something. See src/lib/functionIconSlots.ts for
 * the list of slots. */
export function FunctionIcon({
  slot,
  fallback: Fallback,
  size = 18,
}: {
  slot: string;
  fallback: (props: { width?: number; height?: number }) => ReactElement;
  size?: number;
}) {
  const { data: icons } = useFunctionIcons();
  const url = icons?.[slot];
  if (!url) return <Fallback width={size} height={size} />;
  return <img src={url} alt="" width={size} height={size} style={{ display: 'inline-block', objectFit: 'contain' }} />;
}
