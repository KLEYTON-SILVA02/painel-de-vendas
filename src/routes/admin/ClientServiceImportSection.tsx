import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../auth/AuthContext';
import { DsmReviewTable } from '../../components/dsm/DsmReviewTable';
import { Spinner } from '../../components/Spinner';
import { aggregateClientServiceRows, buildClientServiceReviewRows } from '../../lib/business/clientServiceImport';
import { autoMapColumns, detectHeaderRow } from '../../lib/business/importMapping';
import { normalizeMatricula } from '../../lib/business/parsing';
import type { DsmReviewRow } from '../../lib/business/dsmImport';
import { parseOdsTable } from '../../lib/business/odsTable';
import { readOdsContentXml } from '../../lib/odsZip';
import { saveClientServiceReview, translateDbError } from '../../lib/clientServiceRecordsImport';
import { useCollaborators } from '../../lib/queries';

const MAX_SIZE = 50 * 1024 * 1024;

type Step = 'pick' | 'review' | 'done';

/** Importação de "Vendas por Clientes" (UVC — Unidades Vendidas por
 * Cliente). Reaproveita `detectHeaderRow`/`autoMapColumns` de
 * importMapping.ts (mesmo motor da importação de vendas comum), mas com um
 * `overrides` próprio pro campo "qtd": nesta planilha real (colunas A-R,
 * confirmada pelo usuário) o layout só é idêntico ao da planilha de vendas
 * até a coluna I (A=Data, ..., H=Vendedor Nome, I=Matrícula) — a partir da
 * coluna J ele diverge completamente (Valor/Qtde Cliente/TKM de Venda
 * Líquida, Recebimento e Total, sem nenhuma coluna de produto). O
 * "atendimentos" certo é a coluna **K: QTDE CLIENTE VENDA LÍQUIDA**, nunca a
 * posição fixa antiga (coluna L, que nessa planilha é "TKM Venda" — uma
 * razão, não uma contagem). Quando a mesma matrícula aparece em mais de uma
 * linha no mesmo dia (um PDV diferente por linha — coluna F), o agregador
 * (clientServiceImport.ts) já soma todas automaticamente: a chave de
 * agrupamento é só matrícula+dia, nunca inclui o PDV.
 *
 * Destino: client_service_records, nunca `sales`. Reimportar o mesmo dia
 * SUBSTITUI o valor salvo (upsert por `collaborator_id`+`data`), nunca soma
 * — diferente do DSM. */
const CLIENT_SERVICE_FIELD_OVERRIDES = { qtd: ['qtde cliente venda liquida'] };
/** Último recurso, só quando a planilha não tem um cabeçalho reconhecível
 * nem pelo override acima nem pelos termos genéricos de importMapping.ts
 * (ex.: "qtd") — a coluna K (índice 10) é a posição real da planilha
 * confirmada pelo usuário, nunca a FIXED_COLS.qtd global (que é da
 * planilha de vendas comum, coluna L). */
const CLIENT_SERVICE_QTD_FALLBACK_COL = 10;
export function ClientServiceImportSection() {
  const { profile } = useAuth();
  const { data: collaborators } = useCollaborators();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('pick');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<DsmReviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ count: number; unregisteredCount: number } | null>(null);

  if (!collaborators) return null;

  const collaboratorsById = new Map(collaborators.map((c) => [c.id, c]));
  const collaboratorByMatricula = new Map(collaborators.map((c) => [normalizeMatricula(c.matricula), c]));

  function finishParsing(body: unknown[][], bodyRaw: unknown[][]) {
    if (!body.length) {
      setError('Não foi possível ler nenhuma linha desta planilha.');
      return;
    }
    const headerIdx = detectHeaderRow(body);
    const headers = body[headerIdx];
    const dataRows = body.slice(headerIdx + 1);
    const dataRowsRaw = bodyRaw.slice(headerIdx + 1);
    const map = autoMapColumns(headers, CLIENT_SERVICE_FIELD_OVERRIDES);
    // Último recurso: se nem o override acima nem os termos genéricos de
    // importMapping.ts (ex.: "qtd", que bate em "QTDE...") acharem a coluna
    // pelo cabeçalho, cai na posição real desta planilha (K) — nunca na
    // FIXED_COLS.qtd global, que é da planilha de vendas comum (coluna L).
    if (map.qtd < 0) map.qtd = CLIENT_SERVICE_QTD_FALLBACK_COL;
    if (map.data < 0 || map.matricula < 0) {
      setError('Não foi possível identificar as colunas de data e matrícula nesta planilha.');
      return;
    }
    const parsed = aggregateClientServiceRows(dataRows, dataRowsRaw, map);
    if (!parsed.length) {
      setError('Nenhuma linha com data e matrícula válidas foi encontrada nesta planilha.');
      return;
    }
    setRows(buildClientServiceReviewRows(parsed, collaboratorByMatricula));
    setStep('review');
  }

  async function handleFile(file: File) {
    setError(null);
    if (file.size > MAX_SIZE) {
      setError('Arquivo maior que 50MB. Escolha um arquivo menor.');
      return;
    }
    setFileName(file.name);
    try {
      const data = new Uint8Array(await file.arrayBuffer());

      if (file.name.toLowerCase().endsWith('.ods')) {
        const xml = await readOdsContentXml(data);
        if (!xml) {
          setError('Não foi possível ler este arquivo .ods.');
          return;
        }
        const { rows: grid } = parseOdsTable(xml);
        finishParsing(grid, grid);
        return;
      }

      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const body = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as unknown[][];
      const bodyRaw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as unknown[][];
      finishParsing(body, bodyRaw);
    } catch {
      setError('Falha ao ler o arquivo.');
    }
  }

  function updateRow(key: string, patch: Partial<Pick<DsmReviewRow, 'dataISO' | 'quantidade'>>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  async function handleConfirm() {
    if (!profile?.store_id) return;
    setError(null);
    setSaving(true);
    try {
      const result = await saveClientServiceReview(profile.store_id, fileName, rows);
      setResult(result);
      setStep('done');
    } catch (err) {
      setError(translateDbError(err));
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setStep('pick');
    setRows([]);
    setFileName('');
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="flex flex-col gap-3">
      {step === 'pick' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-semibold text-sm mb-1">Importar planilha de Vendas por Clientes</h3>
          <p className="text-xs text-slate-500 mb-3">
            Alimenta o acompanhamento de UVC (Unidades Vendidas por Cliente) — quantos clientes cada colaborador
            atendeu por dia. Reimportar um dia já importado <b>substitui</b> o valor salvo, nunca soma.
          </p>
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
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            Importar planilha de Vendas por Clientes
          </button>
          {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
        </div>
      )}

      {step === 'review' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-semibold text-sm mb-1">Conferir atendimentos antes de salvar</h3>
          <p className="text-xs text-slate-500 mb-3">
            {rows.length} linha(s) (já somadas por colaborador/dia). Corrija data ou atendimentos se necessário, ou
            remova uma linha, antes de salvar. Colaboradores não cadastrados aparecem sinalizados e não são salvos.
          </p>
          <DsmReviewTable rows={rows} collaboratorsById={collaboratorsById} onChangeRow={updateRow} onRemoveRow={removeRow} />
          {error && <p className="text-xs text-rose-400 mt-3">{error}</p>}
          <div className="flex gap-2 mt-3">
            <button onClick={reset} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm disabled:opacity-60 flex items-center gap-2"
            >
              {saving && <Spinner size={14} color="#04121a" />}
              {saving ? 'Gravando…' : `Salvar atendimentos (${rows.filter((r) => r.collaboratorId && r.dataISO).length})`}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-sm text-green-400 mb-2">
            {result.count} registro(s) de atendimentos salvo(s) (dias já existentes foram substituídos)
            {result.unregisteredCount ? ` · ${result.unregisteredCount} de colaborador não cadastrado (não incluído)` : ''}
          </p>
          <button onClick={reset} className="rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm">
            Importar outra planilha de Vendas por Clientes
          </button>
        </div>
      )}
    </div>
  );
}

export interface ClientServiceImportHistoryItem {
  id: string;
  file_name: string | null;
  row_count: number;
  created_at: string;
}

/** Histórico de importações de "Vendas por Clientes" — mesmo padrão visual
 * de DsmImportHistoryPanel, sem duplicate_count (não se aplica: cada
 * importação substitui, nunca ignora linhas como duplicata). */
export function ClientServiceImportHistoryPanel({ imports }: { imports: ClientServiceImportHistoryItem[] }) {
  if (imports.length === 0) return null;
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 w-full lg:w-80 lg:shrink-0 lg:sticky lg:top-4">
      <h3 className="font-semibold mb-1 text-sm">Vendas por Clientes já importadas</h3>
      <p className="text-xs text-slate-500 mb-3">Histórico de importações desta loja, mais recente primeiro.</p>
      <div className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto">
        {imports.map((imp) => (
          <div key={imp.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="text-xs font-medium text-slate-200 truncate" title={imp.file_name ?? ''}>
              {imp.file_name || 'Planilha'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">{new Date(imp.created_at).toLocaleString('pt-BR')}</div>
            <div className="text-[11px] text-cyan-400 mt-1">{imp.row_count} registro(s)</div>
          </div>
        ))}
      </div>
    </div>
  );
}
