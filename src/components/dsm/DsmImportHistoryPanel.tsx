export interface DsmImportHistoryItem {
  id: string;
  origem: string;
  file_name: string | null;
  row_count: number;
  duplicate_count: number;
  created_at: string;
}

/** Shared history panel for both DSM import flows (planilha e imagem) —
 * both write to the same `dsm_imports` table, so one combined list (newest
 * first) covers either origem instead of showing two separate panels with
 * the same kind of rows. */
export function DsmImportHistoryPanel({ imports }: { imports: DsmImportHistoryItem[] }) {
  if (imports.length === 0) return null;
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 w-full lg:w-80 lg:shrink-0 lg:sticky lg:top-4">
      <h3 className="font-semibold mb-1 text-sm">DSM já importados</h3>
      <p className="text-xs text-slate-500 mb-3">Histórico de importações de DSM desta loja (planilha ou imagem), mais recente primeiro.</p>
      <div className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto">
        {imports.map((imp) => (
          <div key={imp.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="text-xs font-medium text-slate-200 truncate" title={imp.file_name ?? ''}>
              {imp.file_name || (imp.origem === 'imagem' ? 'Imagem colada' : 'Planilha')}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">{new Date(imp.created_at).toLocaleString('pt-BR')}</div>
            <div className="text-[11px] text-cyan-400 mt-1">
              {imp.row_count} registro(s)
              {imp.duplicate_count ? ` · ${imp.duplicate_count} duplicado(s) ignorado(s)` : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
