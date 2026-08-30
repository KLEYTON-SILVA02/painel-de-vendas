import { useRef, useState } from 'react';
import { idFromCell } from '../../lib/business/parsing';

const MAX_SIZE = 50 * 1024 * 1024;

/** Reusable "import a simple registry from a spreadsheet" panel — used by
 * Colaboradores and Produtos bulk import. Always treats row 1 as headers
 * (data starts at row 2, per spec) and reads fixed columns by index
 * (no header-name auto-mapping — these sheets don't have the sales
 * importer's variable layouts). `idColumnIndex`, if set, prefers the raw
 * numeric cell value for that column so a zero-padding number mask on an
 * ID-like column (matrícula/código) doesn't get baked into the import. */
export function SimpleSheetImportPanel({
  title,
  columns,
  idColumnIndex,
  onConfirm,
}: {
  title: string;
  columns: string[];
  idColumnIndex?: number;
  onConfirm: (rows: string[][]) => Promise<{ count: number; skipped: number }>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ count: number; skipped: number } | null>(null);

  function reset() {
    setRows(null);
    setFileName('');
    setError(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleFile(file: File) {
    setError(null);
    setResult(null);
    if (file.size > MAX_SIZE) {
      setError('Arquivo maior que 50MB. Escolha um arquivo menor.');
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        // Dynamic import: xlsx is a large parsing library, kept out of the
        // main bundle (same rationale as the lazy-loaded ImportarPage) —
        // fetched only once a file is actually chosen for import.
        const XLSX = await import('xlsx');
        const data = new Uint8Array(ev.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const formatted = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as unknown[][];
        const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' }) as unknown[][];
        // Row 1 is always the header per spec — data starts at row 2.
        const body = formatted.slice(1);
        const bodyRaw = raw.slice(1);
        const parsed: string[][] = [];
        body.forEach((r, i) => {
          if (!r.some((c) => c !== '')) return;
          const rr = bodyRaw[i] ?? [];
          parsed.push(
            columns.map((_, ci) =>
              ci === idColumnIndex ? idFromCell(rr[ci], r[ci]) : String(r[ci] ?? '').trim(),
            ),
          );
        });
        setRows(parsed);
      } catch {
        setError('Falha ao ler o arquivo. Confira se é uma planilha válida (.xlsx, .xls, .csv, .ods).');
      }
    };
    reader.onerror = () => setError('Falha ao ler o arquivo.');
    reader.readAsArrayBuffer(file);
  }

  async function handleConfirm() {
    if (!rows) return;
    setBusy(true);
    setError(null);
    try {
      const res = await onConfirm(rows);
      setResult(res);
      setRows(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao importar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-semibold flex items-center justify-between w-full"
      >
        <span>📥 {title}</span>
        <span className="text-xs text-slate-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-xs text-slate-500 mb-2">
              Colunas esperadas (dados a partir da <b>linha 2</b> — linha 1 é o cabeçalho):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {columns.map((c, i) => (
                <span key={i} className="text-xs bg-slate-800 rounded-full px-2 py-1">
                  {String.fromCharCode(65 + i)}: {c}
                </span>
              ))}
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.xlsm,.csv,.ods"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 self-start"
          >
            Escolher planilha
          </button>
          {fileName && <p className="text-xs text-slate-500">{fileName}</p>}
          {error && <p className="text-xs text-rose-400">{error}</p>}

          {rows && (
            <>
              <p className="text-xs text-slate-500">{rows.length} linha(s) encontrada(s). Pré-visualização:</p>
              <div className="overflow-x-auto max-h-48 overflow-y-auto rounded-lg border border-slate-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-800 sticky top-0 bg-slate-950">
                      {columns.map((c) => (
                        <th key={c} className="py-1.5 px-2">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 20).map((r, i) => (
                      <tr key={i} className="border-b border-slate-900">
                        {r.map((c, ci) => (
                          <td key={ci} className="py-1.5 px-2">
                            {c || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 20 && <div className="text-xs text-slate-500 p-2">+ {rows.length - 20} linha(s)…</div>}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={reset} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={busy}
                  className="rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm disabled:opacity-50"
                >
                  {busy ? 'Importando…' : `Importar ${rows.length} linha(s)`}
                </button>
              </div>
            </>
          )}

          {result && (
            <p className="text-sm text-green-400">
              {result.count} registro(s) importado(s)
              {result.skipped ? ` · ${result.skipped} ignorado(s) (linha incompleta)` : ''}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
