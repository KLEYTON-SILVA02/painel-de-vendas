/** Yields control back to the browser's main thread — used to break up long
 * synchronous loops (e.g. classifying every row of an imported spreadsheet)
 * into chunks, so the tab can repaint and respond to input between chunks
 * instead of appearing frozen until the whole loop finishes. Prefers the
 * modern scheduler API when available, falls back to setTimeout(0). */
export function yieldToMain(): Promise<void> {
  const w = window as unknown as { scheduler?: { yield?: () => Promise<void> } };
  if (w.scheduler?.yield) return w.scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}
