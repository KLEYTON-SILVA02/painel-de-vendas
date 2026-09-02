import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../auth/AuthContext';
import { Spinner } from '../../components/Spinner';
import { classifyProductTier } from '../../lib/business/classification';
import { autoMapColumns, detectHeaderRow, type ColumnMap, type ImportField } from '../../lib/business/importMapping';
import { dateFromCell, idFromCell, normalizeMatricula, parseNumeroBR } from '../../lib/business/parsing';
import { buildClassificationInputs } from '../../lib/mappers';
import { fmtMoney } from '../../lib/format';
import { useBrandKeywords, useCatalog, useExclusiveBrands, useProducts, useSales, useSalesImports } from '../../lib/queries';
import { findExistingImport, hashBytes, recordSalesImport, saleImportKey } from '../../lib/salesImport';
import { supabase } from '../../lib/supabase';

const MAX_SIZE = 50 * 1024 * 1024;
const FIELDS: ImportField[] = ['data', 'matricula', 'vendedor', 'codigo', 'produto', 'qtd', 'valor'];
const NEON_CYAN = '#00f0ff';
const NEON_PURPLE = '#a82bff';

interface ParsedSheet {
  name: string;
  headers: unknown[];
  rows: unknown[][];
  rawRows: unknown[][];
  map: ColumnMap;
}


type Step = 'pick' | 'map' | 'analyze' | 'verify' | 'done';

interface AnalysisOptions {
  produtos: boolean;
  vendedores: boolean;
  listaVendas: boolean;
}

export function ImportarPage() {
  const { profile } = useAuth();
  const { data: catalog } = useCatalog();
  const { data: products } = useProducts();
  const { data: brandKeywords } = useBrandKeywords();
  const { data: exclusiveBrands } = useExclusiveBrands();
  const { data: existingSales, refetch: refetchSales } = useSales();
  const { data: pastImports } = useSalesImports();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('pick');
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [fileName, setFileName] = useState('');
  const [fileHash, setFileHash] = useState('');
  const [readPct, setReadPct] = useState<number | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmResult, setConfirmResult] = useState<{ count: number; invalidDate: number; noProduto: number; duplicateCount: number } | null>(
    null,
  );
  const [analysisOptions, setAnalysisOptions] = useState<AnalysisOptions>({ produtos: true, vendedores: true, listaVendas: true });
  const [summary, setSummary] = useState<SheetSummary | null>(null);

  if (!catalog || !products || !brandKeywords || !exclusiveBrands) {
    return <div className="text-sm text-slate-500 p-6">Carregando…</div>;
  }
  const inputs = buildClassificationInputs(catalog, products, brandKeywords, exclusiveBrands);

  function handleFile(file: File) {
    setError(null);
    if (file.size > MAX_SIZE) {
      setError('Arquivo maior que 50MB. Escolha um arquivo menor.');
      return;
    }
    setReadPct(0);
    setProgress('Lendo arquivo… 0%');
    const reader = new FileReader();
    reader.onprogress = (ev) => {
      if (!ev.lengthComputable) return;
      const pct = Math.round((ev.loaded / ev.total) * 100);
      setReadPct(pct);
      setProgress(`Lendo arquivo… ${pct}%`);
    };
    reader.onload = (ev) => {
      setReadPct(100);
      setProgress('Processando planilha…');
      // Mirrors the legacy's own brief pause here — lets the 100% fill paint
      // before the (synchronous, can be heavy on large files) parse blocks the thread.
      setTimeout(async () => {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer);

        // File-identity check — catches "uploaded the exact same spreadsheet
        // again" before any parsing happens, so the admin gets warned early.
        let hash = '';
        try {
          hash = await hashBytes(data);
          if (profile?.store_id) {
            const existing = await findExistingImport(profile.store_id, hash);
            if (existing) {
              const when = new Date(existing.createdAt).toLocaleString('pt-BR');
              const proceed = window.confirm(
                `Esta planilha já foi importada em ${when} (${existing.rowCount} venda(s)). Importar de novo pode gerar duplicidade se os dados não mudaram — o sistema vai ignorar automaticamente qualquer venda idêntica a uma já existente. Deseja continuar mesmo assim?`,
              );
              if (!proceed) {
                setProgress(null);
                setReadPct(null);
                return;
              }
            }
          }
        } catch {
          // Hashing/lookup failing (e.g. crypto.subtle unavailable) isn't
          // fatal — the row-level dedup check in handleConfirm still protects
          // against duplicates; the file-identity warning just gets skipped.
        }
        setFileName(file.name);
        setFileHash(hash);

        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const parsed: ParsedSheet[] = wb.SheetNames.map((name) => {
          const sheet = wb.Sheets[name];
          // Two passes: raw:false gives human-formatted text (needed for
          // dates and money), raw:true gives the underlying numeric value
          // (needed to sidestep a zero-padding number mask on ID columns —
          // see idFromCell in lib/business/parsing.ts).
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as unknown[][];
          const rowsRaw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' }) as unknown[][];
          if (!rows.length) return null;
          const headerIdx = detectHeaderRow(rows);
          const headers = rows[headerIdx];
          const body = rows.slice(headerIdx + 1);
          const bodyRaw = rowsRaw.slice(headerIdx + 1);
          const dataRows: unknown[][] = [];
          const dataRowsRaw: unknown[][] = [];
          body.forEach((r, i) => {
            if (!r.some((c) => c !== '')) return;
            dataRows.push(r);
            dataRowsRaw.push(bodyRaw[i] ?? []);
          });
          return { name, headers, rows: dataRows, rawRows: dataRowsRaw, map: autoMapColumns(headers) };
        }).filter((s): s is ParsedSheet => s !== null);
        setSheets(parsed);
        setProgress(null);
        setReadPct(null);
        setStep('map');
      }, 200);
    };
    reader.onerror = () => {
      setError('Falha ao ler o arquivo.');
      setProgress(null);
      setReadPct(null);
    };
    reader.readAsArrayBuffer(file);
  }

  function updateMap(sheetIdx: number, field: ImportField, value: number) {
    setSheets((prev) => {
      const next = [...prev];
      next[sheetIdx] = { ...next[sheetIdx], map: { ...next[sheetIdx].map, [field]: value } };
      return next;
    });
  }

  async function handleConfirm() {
    if (!profile?.store_id) return;
    setStep('done');
    setProgress('Verificando duplicidade…');

    // Every sale already in the store, keyed the same way as the rows about
    // to be inserted — a new row matching one of these is a duplicate
    // (already imported before, from this file or another one) and gets
    // skipped rather than inserted again.
    const existingKeys = new Set((existingSales ?? []).map((s) => saleImportKey({ ...s, codigo: s.codigo ?? null })));
    const seenInBatch = new Set<string>();
    const rows: Record<string, unknown>[] = [];
    let invalidDate = 0;
    let noProduto = 0;
    let duplicateCount = 0;

    for (const sheet of sheets) {
      for (const [ri, r] of sheet.rows.entries()) {
        const rr = sheet.rawRows[ri] ?? [];
        const produto = sheet.map.produto >= 0 ? String(r[sheet.map.produto] ?? '').trim() : '';
        if (!produto) {
          noProduto++;
          continue;
        }
        const dataStr = sheet.map.data >= 0 ? String(r[sheet.map.data] ?? '').trim() : '';
        const dataISO = sheet.map.data >= 0 ? dateFromCell(rr[sheet.map.data], dataStr) : null;
        if (!dataISO) invalidDate++;
        const codigo = sheet.map.codigo >= 0 ? idFromCell(rr[sheet.map.codigo], r[sheet.map.codigo]) : '';
        const matricula = sheet.map.matricula >= 0 ? normalizeMatricula(idFromCell(rr[sheet.map.matricula], r[sheet.map.matricula])) : '';
        const qtd = sheet.map.qtd >= 0 ? parseNumeroBR(r[sheet.map.qtd]) : 0;
        const valor = sheet.map.valor >= 0 ? parseNumeroBR(r[sheet.map.valor]) : 0;

        const key = saleImportKey({ dataISO, matricula, produto, codigo: codigo || null, qtd, valor });
        if (existingKeys.has(key) || seenInBatch.has(key)) {
          duplicateCount++;
          continue;
        }
        seenInBatch.add(key);

        const { categoria, tier } = classifyProductTier(produto, codigo, inputs);
        rows.push({
          store_id: profile.store_id,
          data_raw: dataStr,
          data_iso: dataISO,
          matricula,
          vendedor: sheet.map.vendedor >= 0 ? String(r[sheet.map.vendedor] ?? '').trim() : '',
          produto,
          codigo: codigo || null,
          qtd,
          valor,
          grupo: categoria,
          classification_tier: tier,
        });
      }
    }

    try {
      const importRow = await recordSalesImport(profile.store_id, fileName, fileHash, rows.length, duplicateCount);
      rows.forEach((row) => {
        row.import_id = importRow.id;
      });

      setProgress(`Gravando vendas… 0/${rows.length}`);
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error: insertErr } = await supabase.from('sales').insert(chunk as never);
        if (insertErr) throw insertErr;
        setProgress(`Gravando vendas… ${Math.min(i + 500, rows.length)}/${rows.length}`);
      }
      setConfirmResult({ count: rows.length, invalidDate, noProduto, duplicateCount });
      refetchSales();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gravar vendas.');
      setStep('verify');
    } finally {
      setProgress(null);
    }
  }

  function reset() {
    setStep('pick');
    setSheets([]);
    setFileName('');
    setFileHash('');
    setConfirmResult(null);
    setError(null);
    setReadPct(null);
    setProgress(null);
    setSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function runAnalysis() {
    setStep('analyze');
    // Same brief-pause pattern as the file read step: lets the "Analisando…"
    // bar paint before the (synchronous) reclassification pass, which can be
    // heavy on large files, blocks the thread.
    setTimeout(() => {
      setSummary(summarize(sheets, inputs));
      setStep('verify');
    }, 250);
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      <div className="flex flex-col gap-3 flex-1 min-w-0 w-full">
      {step === 'pick' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-semibold mb-1 text-sm">Importar planilha de vendas</h3>
          <p className="text-xs text-slate-500 mb-3">
            Formatos aceitos: .xlsx, .xls, .xlsm, .csv, .ods — até 50MB. O sistema varre as 15 primeiras linhas de
            cada aba procurando o cabeçalho (data, matrícula, vendedor, produto, qtd, valor) e mapeia as colunas
            automaticamente — se não encontrar, usa o layout padrão. Você pode revisar e ajustar antes de confirmar.
            Todas as abas do arquivo são processadas.
          </p>

          <ExpectedColumnsBar />

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
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              width: '100%',
              maxWidth: 420,
              padding: '14px 20px',
              borderRadius: 14,
              border: 'none',
              cursor: 'pointer',
              background: `linear-gradient(90deg, ${NEON_CYAN}, ${NEON_PURPLE})`,
              color: '#fff',
              fontWeight: 800,
              fontSize: 14,
              textTransform: 'uppercase',
              letterSpacing: '.03em',
              boxShadow: '0 0 18px rgba(0,240,255,.35)',
            }}
          >
            <UploadGlyph />
            <span>Importar Planilha de Vendas</span>
          </button>

          {readPct !== null && (
            <div style={{ marginTop: 14 }}>
              <div style={{ width: '100%', height: 14, borderRadius: 8, background: '#080818', border: '1px solid #212948', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    borderRadius: 8,
                    width: `${readPct}%`,
                    transition: 'width .15s ease',
                    background:
                      readPct >= 66
                        ? 'linear-gradient(90deg,#00e5ff,#14ff00)'
                        : readPct >= 33
                          ? 'linear-gradient(90deg,#a82bff,#00e5ff)'
                          : 'linear-gradient(90deg,#ff3df0,#a82bff)',
                  }}
                />
              </div>
              {progress && <p className="text-xs text-slate-500 mt-1">{progress}</p>}
            </div>
          )}
          {readPct === null && progress && <p className="text-xs text-cyan-400 mt-2">{progress}</p>}
          {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
        </div>
      )}

      {step === 'map' && (
        <>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs text-slate-500">
              {sheets.length} aba(s), {sheets.reduce((a, s) => a + s.rows.length, 0)} linhas encontradas. Colunas
              mapeadas automaticamente — confira abaixo (uma seção por aba):
            </p>
          </div>
          {sheets.map((sheet, si) => (
            <div key={sheet.name} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <b className="text-sm">{sheet.name}</b>
                <span className="text-xs text-slate-500">{sheet.rows.length} linhas</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {FIELDS.map((field) => (
                  <div key={field}>
                    <label className="block text-xs text-slate-400 mb-1 capitalize">{field}</label>
                    <select
                      value={sheet.map[field]}
                      onChange={(e) => updateMap(si, field, Number(e.target.value))}
                      className="input"
                    >
                      <option value={-1}>(ignorar)</option>
                      {sheet.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {String(h || `coluna ${i + 1}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs text-slate-400 mb-2">O que a 2ª verificação deve analisar antes de gravar:</p>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={analysisOptions.produtos}
                  onChange={(e) => setAnalysisOptions((o) => ({ ...o, produtos: e.target.checked }))}
                />
                Identificação e categorização de produtos (recomendado)
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={analysisOptions.vendedores}
                  onChange={(e) => setAnalysisOptions((o) => ({ ...o, vendedores: e.target.checked }))}
                />
                Vendedores encontrados na planilha
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={analysisOptions.listaVendas}
                  onChange={(e) => setAnalysisOptions((o) => ({ ...o, listaVendas: e.target.checked }))}
                />
                Pré-visualizar lista de vendas antes de salvar
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={reset} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">
              Cancelar
            </button>
            <button onClick={runAnalysis} className="rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm">
              Analisar e revisar classificação
            </button>
          </div>
        </>
      )}

      {step === 'analyze' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-semibold mb-1 text-sm">🔍 Analisando produtos…</h3>
          <p className="text-xs text-slate-500 mb-3">
            Conferindo a categorização de cada produto e preparando a pré-visualização.
          </p>
          <div style={{ width: '100%', height: 14, borderRadius: 8, background: '#080818', border: '1px solid #212948', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: '100%',
                borderRadius: 8,
                background: `linear-gradient(90deg, ${NEON_CYAN}, ${NEON_PURPLE})`,
                animation: 'importar-analyze-pulse 1s ease-in-out infinite',
              }}
            />
          </div>
          <style>{`@keyframes importar-analyze-pulse { 0%, 100% { opacity: .45; } 50% { opacity: 1; } }`}</style>
        </div>
      )}

      {step === 'verify' && summary && (
        <VerifyStep summary={summary} options={analysisOptions} onBack={() => setStep('map')} onConfirm={handleConfirm} error={error} />
      )}

      {step === 'done' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          {progress && (
            <p className="text-sm text-cyan-400 flex items-center gap-2">
              <Spinner size={16} color={NEON_CYAN} />
              {progress}
            </p>
          )}
          {confirmResult && (
            <>
              <p className="text-sm text-green-400 mb-3">
                {confirmResult.count} vendas importadas
                {confirmResult.duplicateCount ? ` · ${confirmResult.duplicateCount} duplicada(s) ignorada(s)` : ''}
                {confirmResult.invalidDate ? ` · ${confirmResult.invalidDate} com data inválida` : ''}
                {confirmResult.noProduto ? ` · ${confirmResult.noProduto} sem produto` : ''}
              </p>
              {confirmResult.duplicateCount > 0 && (
                <p className="text-xs text-slate-500 mb-3">
                  {confirmResult.duplicateCount} venda(s) da planilha já existiam no sistema (mesma data, matrícula, produto,
                  quantidade e valor) e não foram gravadas de novo.
                </p>
              )}
              <button onClick={reset} className="rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm">
                Importar outra planilha
              </button>
            </>
          )}
        </div>
      )}
      </div>

      <ImportHistoryPanel imports={pastImports ?? []} />
    </div>
  );
}

function ImportHistoryPanel({ imports }: { imports: { id: string; file_name: string; row_count: number; duplicate_count: number; created_at: string }[] }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 w-full lg:w-80 lg:shrink-0 lg:sticky lg:top-4">
      <h3 className="font-semibold mb-1 text-sm">Planilhas já importadas</h3>
      <p className="text-xs text-slate-500 mb-3">Histórico de todas as importações desta loja, mais recente primeiro.</p>
      {imports.length === 0 ? (
        <p className="text-xs text-slate-500">Nenhuma planilha importada ainda.</p>
      ) : (
        <div className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto">
          {imports.map((imp) => (
            <div key={imp.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-xs font-medium text-slate-200 truncate" title={imp.file_name}>
                {imp.file_name}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">{new Date(imp.created_at).toLocaleString('pt-BR')}</div>
              <div className="text-[11px] text-cyan-400 mt-1">
                {imp.row_count} venda(s) gravada(s)
                {imp.duplicate_count ? ` · ${imp.duplicate_count} duplicada(s) ignorada(s)` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const EXPECTED_COLUMNS: { nome: string; descricao: string }[] = [
  { nome: 'Data', descricao: 'Data da venda (DD/MM/AAAA ou AAAA-MM-DD).' },
  { nome: 'Vendedor Nome', descricao: 'Nome do colaborador que realizou a venda.' },
  { nome: 'Matrícula', descricao: 'Código de venda/matrícula do colaborador — usado para achar o cadastro dele.' },
  { nome: 'Descrição do Produto', descricao: 'Nome do produto vendido, usado na classificação por categoria.' },
  { nome: 'Quantidade Vendida', descricao: 'Quantidade de itens vendidos na linha.' },
  { nome: 'Valor do Produto', descricao: 'Valor total vendido na linha (R$).' },
];

function ExpectedColumnsBar() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-cyan-400 flex items-center gap-1"
      >
        {open ? '▲' : '▼'} Quais colunas o sistema procura?
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <table className="w-full text-xs">
            <tbody>
              {EXPECTED_COLUMNS.map((c) => (
                <tr key={c.nome} className="border-b border-slate-900 last:border-0">
                  <td className="py-1.5 pr-3 font-medium text-slate-300 whitespace-nowrap align-top">{c.nome}</td>
                  <td className="py-1.5 text-slate-500">{c.descricao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UploadGlyph() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

interface SheetSummary {
  total: number;
  baixaConfianca: number;
  produtosNovos: number;
  produtosNovosNomes: string[];
  itensTotais: number;
  valorTotal: number;
  diasDistintos: number;
  vendedores: { chave: string; nome: string }[];
  amostras: { produto: string; categoria: string; tier: number }[];
  previewRows: { data: string; vendedor: string; produto: string; qtd: number; valor: number }[];
}

const PREVIEW_ROWS_LIMIT = 200;

function summarize(sheets: ParsedSheet[], inputs: ReturnType<typeof buildClassificationInputs>): SheetSummary {
  let total = 0;
  let baixaConfianca = 0;
  let itensTotais = 0;
  let valorTotal = 0;
  const produtosNovosSet = new Set<string>();
  const diasSet = new Set<string>();
  const vendedoresMap = new Map<string, string>();
  const amostras: { produto: string; categoria: string; tier: number }[] = [];
  const previewRows: { data: string; vendedor: string; produto: string; qtd: number; valor: number }[] = [];

  sheets.forEach((sheet) => {
    const map = sheet.map;
    sheet.rows.forEach((r, ri) => {
      const rr = sheet.rawRows[ri] ?? [];
      const produto = map.produto >= 0 ? String(r[map.produto] ?? '').trim() : '';
      if (!produto) return;
      total++;
      const codigo = map.codigo >= 0 ? idFromCell(rr[map.codigo], r[map.codigo]) : '';
      const { categoria, tier } = classifyProductTier(produto, codigo, inputs);
      if (tier >= 4) {
        baixaConfianca++;
        if (amostras.length < 25) amostras.push({ produto, categoria: categoria!, tier });
      }
      // "Produto novo" = nenhuma regra específica bateu (nem catálogo, palavra-chave
      // ou heurística) — o mesmo critério que a aba "Pendentes de Revisão" da
      // Auditoria usa (useFallback=false). Continua sendo importado com a
      // classificação padrão; só fica sinalizado pra revisão futura.
      const semRegra = classifyProductTier(produto, codigo, inputs, false).categoria === null;
      if (semRegra) produtosNovosSet.add(produto.toLowerCase());

      const qtd = map.qtd >= 0 ? parseNumeroBR(r[map.qtd]) : 0;
      const valor = map.valor >= 0 ? parseNumeroBR(r[map.valor]) : 0;
      itensTotais += qtd;
      valorTotal += valor;

      const dataStr = map.data >= 0 ? String(r[map.data] ?? '').trim() : '';
      const dataISO = map.data >= 0 ? dateFromCell(rr[map.data], dataStr) : null;
      if (dataISO) diasSet.add(dataISO);

      const matricula = map.matricula >= 0 ? normalizeMatricula(idFromCell(rr[map.matricula], r[map.matricula])) : '';
      const vendedor = map.vendedor >= 0 ? String(r[map.vendedor] ?? '').trim() : '';
      const chave = matricula || vendedor;
      if (chave && !vendedoresMap.has(chave)) vendedoresMap.set(chave, vendedor || matricula);

      if (previewRows.length < PREVIEW_ROWS_LIMIT) {
        previewRows.push({ data: dataISO ?? dataStr, vendedor: vendedor || matricula, produto, qtd, valor });
      }
    });
  });

  return {
    total,
    baixaConfianca,
    produtosNovos: produtosNovosSet.size,
    produtosNovosNomes: Array.from(produtosNovosSet).slice(0, 30),
    itensTotais,
    valorTotal,
    diasDistintos: diasSet.size,
    vendedores: Array.from(vendedoresMap.entries()).map(([chave, nome]) => ({ chave, nome })),
    amostras,
    previewRows,
  };
}

function VerifyStep({
  summary: s,
  options,
  onBack,
  onConfirm,
  error,
}: {
  summary: SheetSummary;
  options: AnalysisOptions;
  onBack: () => void;
  onConfirm: () => void;
  error: string | null;
}) {
  const [showVendedores, setShowVendedores] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="font-semibold mb-1 text-sm">🔍 2ª releitura — verificação de classificação</h3>
      <p className="text-xs text-slate-500 mb-3">
        Antes de gravar, o sistema reclassificou todos os {s.total} produtos e conferiu o nível de confiança de cada
        um, pra reduzir o risco de categoria errada.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-xs text-slate-400">Classificação de alta confiança</div>
          <div className="text-lg font-mono font-semibold text-green-400">{s.total - s.baixaConfianca}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-xs text-slate-400">Baixa confiança (heurística/padrão)</div>
          <div className="text-lg font-mono font-semibold text-amber-400">{s.baixaConfianca}</div>
        </div>
      </div>

      <p className="text-xs text-slate-500 mb-2">Detalhamento da planilha:</p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
        {options.vendedores ? (
          <button onClick={() => setShowVendedores((v) => !v)} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-left hover:border-cyan-500">
            <div className="text-xs text-slate-400">Vendedores encontrados</div>
            <div className="text-lg font-mono font-semibold text-cyan-400">{s.vendedores.length}</div>
            <div className="text-[10px] text-slate-500">{showVendedores ? 'ocultar nomes ▲' : 'ver nomes ▼'}</div>
          </button>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="text-xs text-slate-400">Vendedores encontrados</div>
            <div className="text-lg font-mono font-semibold text-cyan-400">{s.vendedores.length}</div>
          </div>
        )}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-xs text-slate-400">Itens totais</div>
          <div className="text-lg font-mono font-semibold">{s.itensTotais}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-xs text-slate-400">Valor total</div>
          <div className="text-lg font-mono font-semibold">{fmtMoney(s.valorTotal)}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-xs text-slate-400">Dias na planilha</div>
          <div className="text-lg font-mono font-semibold">{s.diasDistintos}</div>
        </div>
        <div className="rounded-xl border border-amber-700/60 bg-slate-950/60 p-3">
          <div className="text-xs text-slate-400">Produtos não reconhecidos</div>
          <div className="text-lg font-mono font-semibold text-amber-400">{s.produtosNovos}</div>
        </div>
      </div>

      {options.produtos && s.produtosNovos > 0 && (
        <>
          <p className="text-xs text-slate-500 mb-2">
            {s.produtosNovos} produto(s) sem regra de classificação cadastrada serão importados normalmente (com a
            categoria padrão) e ficarão sinalizados em <b>ADM → Auditoria → Pendentes de Revisão</b> pra classificação
            futura:
          </p>
          <div className="rounded-xl border border-amber-700/40 bg-slate-950/60 p-3 mb-3 max-h-32 overflow-y-auto">
            <div className="flex flex-wrap gap-1.5">
              {s.produtosNovosNomes.map((p) => (
                <span key={p} className="text-xs bg-amber-900/40 text-amber-200 rounded-full px-2.5 py-1">
                  {p}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {showVendedores && options.vendedores && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 mb-3 max-h-48 overflow-y-auto">
          <div className="flex flex-wrap gap-1.5">
            {s.vendedores.map((v) => (
              <span key={v.chave} className="text-xs bg-slate-800 rounded-full px-2.5 py-1">
                {v.nome || v.chave}
              </span>
            ))}
          </div>
        </div>
      )}

      {options.produtos && s.amostras.length > 0 && (
        <>
          <p className="text-xs text-slate-500 mb-2">Amostra de produtos com baixa confiança (revise depois em Auditoria se necessário):</p>
          <div className="overflow-x-auto mb-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-800">
                  <th className="py-1.5 pr-3">Produto</th>
                  <th className="py-1.5 pr-3">Categoria sugerida</th>
                </tr>
              </thead>
              <tbody>
                {s.amostras.map((a, i) => (
                  <tr key={i} className="border-b border-slate-900">
                    <td className="py-1.5 pr-3">{a.produto}</td>
                    <td className="py-1.5 pr-3">
                      <span className="bg-slate-800 rounded-full px-2 py-0.5">{a.categoria}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {options.listaVendas && s.previewRows.length > 0 && (
        <>
          <p className="text-xs text-slate-500 mb-2">
            Lista de vendas (prévia das primeiras {s.previewRows.length} de {s.total}):
          </p>
          <div className="overflow-x-auto mb-3 max-h-64 overflow-y-auto rounded-xl border border-slate-800">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-950">
                <tr className="text-left text-slate-400 border-b border-slate-800">
                  <th className="py-1.5 px-3">Data</th>
                  <th className="py-1.5 px-3">Vendedor</th>
                  <th className="py-1.5 px-3">Produto</th>
                  <th className="py-1.5 px-3 text-right">Qtd</th>
                  <th className="py-1.5 px-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {s.previewRows.map((row, i) => (
                  <tr key={i} className="border-b border-slate-900">
                    <td className="py-1.5 px-3 whitespace-nowrap">{row.data || '—'}</td>
                    <td className="py-1.5 px-3">{row.vendedor || '—'}</td>
                    <td className="py-1.5 px-3">{row.produto}</td>
                    <td className="py-1.5 px-3 text-right">{row.qtd}</td>
                    <td className="py-1.5 px-3 text-right whitespace-nowrap">{fmtMoney(row.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {error && <p className="text-xs text-rose-400 mb-3">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onBack} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">
          ← Voltar ao mapeamento
        </button>
        <button
          onClick={onConfirm}
          style={{
            background: `linear-gradient(90deg, ${NEON_CYAN}, ${NEON_PURPLE})`,
            color: '#04121a',
            textTransform: 'uppercase',
            letterSpacing: '.03em',
          }}
          className="rounded-lg font-bold px-4 py-2 text-sm"
        >
          💾 Salvar Dados de Venda ({s.total})
        </button>
      </div>
    </div>
  );
}
