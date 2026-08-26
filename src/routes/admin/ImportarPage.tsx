import { useState } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../auth/AuthContext';
import { classifyProductTier } from '../../lib/business/classification';
import { autoMapColumns, detectHeaderRow, type ColumnMap, type ImportField } from '../../lib/business/importMapping';
import { parseDateISO, parseNumeroBR } from '../../lib/business/parsing';
import { buildClassificationInputs } from '../../lib/mappers';
import { useBrandKeywords, useCatalog, useExclusiveBrands, useProducts, useSales } from '../../lib/queries';
import { supabase } from '../../lib/supabase';

const MAX_SIZE = 50 * 1024 * 1024;
const FIELDS: ImportField[] = ['data', 'matricula', 'vendedor', 'codigo', 'produto', 'qtd', 'valor'];

interface ParsedSheet {
  name: string;
  headers: unknown[];
  rows: unknown[][];
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

  const [step, setStep] = useState<Step>('pick');
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
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
    setProgress('Lendo arquivo…');
    const reader = new FileReader();
    reader.onload = (ev) => {
      setProgress('Processando planilha…');
      const data = new Uint8Array(ev.target!.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const parsed: ParsedSheet[] = wb.SheetNames.map((name) => {
        const sheet = wb.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as unknown[][];
        if (!rows.length) return null;
        const headerIdx = detectHeaderRow(rows);
        const headers = rows[headerIdx];
        const dataRows = rows.slice(headerIdx + 1).filter((r) => r.some((c) => c !== ''));
        return { name, headers, rows: dataRows, map: autoMapColumns(headers) };
      }).filter((s): s is ParsedSheet => s !== null);
      setSheets(parsed);
      setProgress(null);
      setStep('map');
    };
    reader.onerror = () => {
      setError('Falha ao ler o arquivo.');
      setProgress(null);
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
        for (const r of sheet.rows) {
          const produto = sheet.map.produto >= 0 ? String(r[sheet.map.produto] ?? '').trim() : '';
          if (!produto) {
            noProduto++;
            continue;
          }
          const dataStr = sheet.map.data >= 0 ? String(r[sheet.map.data] ?? '').trim() : '';
          const dataISO = parseDateISO(dataStr);
          if (!dataISO) invalidDate++;
          const codigo = sheet.map.codigo >= 0 ? String(r[sheet.map.codigo] ?? '').trim() : '';
          const { categoria, tier } = classifyProductTier(produto, codigo, inputs);
          batch.push({
            store_id: profile.store_id,
            data_raw: dataStr,
            data_iso: dataISO,
            matricula: sheet.map.matricula >= 0 ? String(r[sheet.map.matricula] ?? '').trim() : '',
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
  }

  return (
    <div className="flex flex-col gap-4">
      {step === 'pick' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-semibold mb-1 text-sm">Importar planilha de vendas</h3>
          <p className="text-xs text-slate-500 mb-3">
            Formatos aceitos: .xlsx, .xls, .xlsm, .csv, .ods — até 50MB. As colunas são mapeadas automaticamente;
            confira antes de confirmar.
          </p>
          <input
            type="file"
            accept=".xlsx,.xls,.xlsm,.csv,.ods"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="text-xs text-slate-400"
          />
          {progress && <p className="text-xs text-cyan-400 mt-2">{progress}</p>}
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
  let total = 0;
  let baixaConfianca = 0;
  const amostras: { produto: string; categoria: string; tier: number }[] = [];

  sheets.forEach((sheet) => {
    sheet.rows.forEach((r) => {
      const produto = sheet.map.produto >= 0 ? String(r[sheet.map.produto] ?? '').trim() : '';
      if (!produto) return;
      total++;
      const codigo = sheet.map.codigo >= 0 ? String(r[sheet.map.codigo] ?? '').trim() : '';
      const { categoria, tier } = classifyProductTier(produto, codigo, inputs);
      if (tier >= 4) {
        baixaConfianca++;
        if (amostras.length < 25) amostras.push({ produto, categoria: categoria!, tier });
      }
    });
  });

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="font-semibold mb-1 text-sm">🔍 2ª releitura — verificação de classificação</h3>
      <p className="text-xs text-slate-500 mb-3">
        Antes de gravar, o sistema reclassificou todos os {total} produtos e conferiu o nível de confiança de cada
        um, pra reduzir o risco de categoria errada.
      </p>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-xs text-slate-400">Classificação de alta confiança</div>
          <div className="text-lg font-mono font-semibold text-green-400">{total - baixaConfianca}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-xs text-slate-400">Baixa confiança (heurística/padrão)</div>
          <div className="text-lg font-mono font-semibold text-amber-400">{baixaConfianca}</div>
        </div>
      </div>
      {amostras.length > 0 && (
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
                {amostras.map((a, i) => (
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
        <button onClick={onConfirm} className="rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm">
          ✓ Confirmar e gravar {total} vendas
        </button>
      </div>
    </div>
  );
}
