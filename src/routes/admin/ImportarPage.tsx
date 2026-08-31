import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../auth/AuthContext';
import { classifyProductTier } from '../../lib/business/classification';
import { autoMapColumns, detectHeaderRow, type ColumnMap, type ImportField } from '../../lib/business/importMapping';
import { dateFromCell, idFromCell, normalizeMatricula, parseNumeroBR } from '../../lib/business/parsing';
import { buildClassificationInputs } from '../../lib/mappers';
import { fmtMoney } from '../../lib/format';
import { useBrandKeywords, useCatalog, useExclusiveBrands, useProducts, useSales } from '../../lib/queries';
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


type Step = 'pick' | 'map' | 'verify' | 'done';

export function ImportarPage() {
  const { profile } = useAuth();
  const { data: catalog } = useCatalog();
  const { data: products } = useProducts();
  const { data: brandKeywords } = useBrandKeywords();
  const { data: exclusiveBrands } = useExclusiveBrands();
  const { refetch: refetchSales } = useSales();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('pick');
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [readPct, setReadPct] = useState<number | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmResult, setConfirmResult] = useState<{ count: number; invalidDate: number; noProduto: number } | null>(null);

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
      setTimeout(() => {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer);
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
    setProgress('Gravando vendas…');
    let count = 0;
    let invalidDate = 0;
    let noProduto = 0;
    const batch: Record<string, unknown>[] = [];

    async function flush() {
      if (batch.length === 0) return;
      const { error: insertErr } = await supabase.from('sales').insert(batch.splice(0, batch.length) as never);
      if (insertErr) throw insertErr;
    }

    try {
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
          const { categoria, tier } = classifyProductTier(produto, codigo, inputs);
          batch.push({
            store_id: profile.store_id,
            data_raw: dataStr,
            data_iso: dataISO,
            matricula: sheet.map.matricula >= 0 ? normalizeMatricula(idFromCell(rr[sheet.map.matricula], r[sheet.map.matricula])) : '',
            vendedor: sheet.map.vendedor >= 0 ? String(r[sheet.map.vendedor] ?? '').trim() : '',
            produto,
            codigo: codigo || null,
            qtd: sheet.map.qtd >= 0 ? parseNumeroBR(r[sheet.map.qtd]) : 0,
            valor: sheet.map.valor >= 0 ? parseNumeroBR(r[sheet.map.valor]) : 0,
            grupo: categoria,
            classification_tier: tier,
          });
          count++;
          if (batch.length >= 500) {
            await flush();
            setProgress(`Gravando vendas… ${count}`);
          }
        }
      }
      await flush();
      setConfirmResult({ count, invalidDate, noProduto });
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
    setConfirmResult(null);
    setError(null);
    setReadPct(null);
    setProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="flex flex-col gap-4">
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
          <div className="flex gap-2">
            <button onClick={reset} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">
              Cancelar
            </button>
            <button onClick={() => setStep('verify')} className="rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm">
              Analisar e revisar classificação
            </button>
          </div>
        </>
      )}

      {step === 'verify' && (
        <VerifyStep sheets={sheets} inputs={inputs} onBack={() => setStep('map')} onConfirm={handleConfirm} error={error} />
      )}

      {step === 'done' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          {progress && <p className="text-sm text-cyan-400">{progress}</p>}
          {confirmResult && (
            <>
              <p className="text-sm text-green-400 mb-3">
                {confirmResult.count} vendas importadas
                {confirmResult.invalidDate ? ` · ${confirmResult.invalidDate} com data inválida` : ''}
                {confirmResult.noProduto ? ` · ${confirmResult.noProduto} sem produto` : ''}
              </p>
              <button onClick={reset} className="rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm">
                Importar outra planilha
              </button>
            </>
          )}
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
  itensTotais: number;
  valorTotal: number;
  diasDistintos: number;
  vendedores: { chave: string; nome: string }[];
  amostras: { produto: string; categoria: string; tier: number }[];
}

function summarize(sheets: ParsedSheet[], inputs: ReturnType<typeof buildClassificationInputs>): SheetSummary {
  let total = 0;
  let baixaConfianca = 0;
  let itensTotais = 0;
  let valorTotal = 0;
  const produtosNovosSet = new Set<string>();
  const diasSet = new Set<string>();
  const vendedoresMap = new Map<string, string>();
  const amostras: { produto: string; categoria: string; tier: number }[] = [];

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
    });
  });

  return {
    total,
    baixaConfianca,
    produtosNovos: produtosNovosSet.size,
    itensTotais,
    valorTotal,
    diasDistintos: diasSet.size,
    vendedores: Array.from(vendedoresMap.entries()).map(([chave, nome]) => ({ chave, nome })),
    amostras,
  };
}

function VerifyStep({
  sheets,
  inputs,
  onBack,
  onConfirm,
  error,
}: {
  sheets: ParsedSheet[];
  inputs: ReturnType<typeof buildClassificationInputs>;
  onBack: () => void;
  onConfirm: () => void;
  error: string | null;
}) {
  const s = summarize(sheets, inputs);
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
        <button onClick={() => setShowVendedores((v) => !v)} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-left hover:border-cyan-500">
          <div className="text-xs text-slate-400">Vendedores encontrados</div>
          <div className="text-lg font-mono font-semibold text-cyan-400">{s.vendedores.length}</div>
          <div className="text-[10px] text-slate-500">{showVendedores ? 'ocultar nomes ▲' : 'ver nomes ▼'}</div>
        </button>
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
          <div className="text-xs text-slate-400">Produtos novos</div>
          <div className="text-lg font-mono font-semibold text-amber-400">{s.produtosNovos}</div>
        </div>
      </div>

      {s.produtosNovos > 0 && (
        <p className="text-xs text-slate-500 mb-3">
          {s.produtosNovos} produto(s) sem regra de classificação cadastrada serão importados normalmente (com a
          categoria padrão) e ficarão sinalizados em <b>ADM → Auditoria → Pendentes de Revisão</b> pra classificação
          futura.
        </p>
      )}

      {showVendedores && (
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

      {s.amostras.length > 0 && (
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
