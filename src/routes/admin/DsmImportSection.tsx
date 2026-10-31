import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../auth/AuthContext';
import { DsmReviewTable } from '../../components/dsm/DsmReviewTable';
import type { CentralImportacaoData, ImportAcaoBotoes, ImportStepInfo, ImportStepStatus } from '../../components/import/CentralImportacaoPanel';
import {
  buildDsmReviewRows,
  detectDsmHeaderRow,
  fillMergedCells,
  mapDsmColumns,
  parseDsmRows,
  type DsmReviewRow,
  type MergeRange,
} from '../../lib/business/dsmImport';
import { parseOdsTable } from '../../lib/business/odsTable';
import { normalizeMatricula } from '../../lib/business/parsing';
import { saveDsmReview, translateDbError } from '../../lib/dsmRecordsImport';
import { readOdsContentXml } from '../../lib/odsZip';
import { useCollaborators, useDsmRecords } from '../../lib/queries';

const MAX_SIZE = 50 * 1024 * 1024;

type Step = 'pick' | 'review' | 'done';

/** Fase 2 do DSM (Desconto Só Meu): botão de importar planilha, ao lado do
 * de vendas em ImportarPage. Reaproveita SheetJS (já usado pela importação
 * de vendas) mas com um parser próprio (dsmImport.ts) — o formato real da
 * planilha (colunas mescladas, subtotal por colaborador, total geral no
 * fim) é bem diferente do da planilha de vendas.
 *
 * `onCentralChange` reporta o estado atual (etapas + % de progresso) pro
 * ImportarPage, que decide ali fora qual dos dois painéis de DSM (este ou o
 * de DsmImageImportSection) mostrar — este componente não desenha mais seu
 * próprio `CentralImportacaoPanel` (pedido explícito do usuário, 2026-10-29:
 * só pode haver UM velocímetro visível por vez na tela de DSM).
 *
 * `ref.abrirSeletor()` abre o seletor de arquivo — o botão que dispara isso
 * não é mais desenhado aqui dentro: ImportarPage o desenha como um botão à
 * parte, embaixo das 3 colunas do painel (pedido explícito do usuário,
 * 2026-10-29: "o primeiro botão inicial de importação... deverá ficar na
 * parte de baixo... embaixo das três colunas"). Este componente continua
 * dono do `<input type="file">` e do parse — só a parte clicável do
 * primeiro passo saiu daqui.
 *
 * `ref.voltar()`/`ref.confirmar()` e `onAcaoChange` seguem o mesmo princípio
 * pros botões das etapas 'review'/'done' — pedido explícito do usuário,
 * 2026-10-31: "as configurações de botões também devem seguir para as
 * outras funções de DSM e UVC", generalizando o padrão de barra fixa já
 * usado em Importar Vendas (ver `ImportAcaoBotoesBar`). */
export interface DsmImportSectionHandle {
  abrirSeletor: () => void;
  voltar: () => void;
  confirmar: () => void;
}

export const DsmImportSection = forwardRef<
  DsmImportSectionHandle,
  { onCentralChange?: (central: CentralImportacaoData) => void; onAcaoChange?: (acao: ImportAcaoBotoes) => void }
>(function DsmImportSection({ onCentralChange, onAcaoChange }, ref) {
  const { profile } = useAuth();
  const { data: collaborators } = useCollaborators();
  const { data: existingRecords, refetch: refetchDsmRecords } = useDsmRecords();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sem array de dependências — o objeto precisa ser recriado a cada render
  // pra `voltar`/`confirmar` nunca ficarem presos ao closure (e aos valores
  // de estado) da primeira renderização; `[]` prenderia a função pra sempre
  // num `rows`/`fileName` vazios, do primeiro render.
  useImperativeHandle(ref, () => ({ abrirSeletor: () => fileInputRef.current?.click(), voltar: reset, confirmar: handleConfirm }));

  const [step, setStep] = useState<Step>('pick');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<DsmReviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ count: number; duplicateCount: number; unregisteredCount: number } | null>(null);

  if (!collaborators) return null;

  const collaboratorsById = new Map(collaborators.map((c) => [c.id, c]));
  const collaboratorByMatricula = new Map(collaborators.map((c) => [normalizeMatricula(c.matricula), c]));

  function finishParsing(body: unknown[][], bodyRaw: unknown[][]) {
    if (!body.length) {
      setError('Não foi possível ler nenhuma linha desta planilha.');
      return;
    }
    const headerIdx = detectDsmHeaderRow(body);
    const headers = body[headerIdx];
    const dataRows = body.slice(headerIdx + 1);
    const dataRowsRaw = bodyRaw.slice(headerIdx + 1);
    const map = mapDsmColumns(headers);
    if (map.matriculaNome < 0 || map.data < 0 || map.quantidade < 0) {
      setError('Não foi possível identificar as colunas de matrícula, data e número de clientes nesta planilha.');
      return;
    }
    const parsed = parseDsmRows(dataRows, dataRowsRaw, map);
    setRows(buildDsmReviewRows(parsed, collaboratorByMatricula));
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

      // .ods goes through a dedicated reader instead of the `xlsx` package
      // — see business/odsTable.ts's file comment for the confirmed
      // SheetJS ODS bug (merged-cell columns silently drifting) this works
      // around. .xlsx/.xls/.csv don't have that failure mode, so they keep
      // using SheetJS exactly like the sales import does.
      if (file.name.toLowerCase().endsWith('.ods')) {
        const xml = await readOdsContentXml(data);
        if (!xml) {
          setError('Não foi possível ler este arquivo .ods.');
          return;
        }
        const { rows: grid, merges } = parseOdsTable(xml);
        fillMergedCells(grid, merges);
        finishParsing(grid, grid);
        return;
      }

      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const body = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as unknown[][];
      const bodyRaw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as unknown[][];
      const merges = (ws['!merges'] ?? []) as MergeRange[];
      fillMergedCells(body, merges);
      fillMergedCells(bodyRaw, merges);
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
      // Refetches right before computing duplicates for the same reason
      // the sales import does (see ImportarPage.tsx's handleConfirm): a
      // stale cached snapshot would be blind to DSM rows saved since the
      // review screen was opened.
      const { data: freshRecords } = await refetchDsmRecords();
      const result = await saveDsmReview(profile.store_id, 'planilha', fileName, rows, freshRecords ?? existingRecords ?? []);
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

  // Traduz o `step`/`error`/`rows`/`saving`/`result` que já existem acima nas
  // 5 etapas do painel visual (CentralImportacaoPanel) — só leitura do
  // estado real, mesmo princípio de ImportarPage.tsx (ver seu comentário em
  // buildVendasEtapas). Esta planilha (DSM) não tem indicador de progresso
  // de leitura próprio (o parse é rápido o bastante pra não precisar de um
  // hoje) — por isso as etapas 1-3 pulam direto de "aguardando" pra
  // "concluído" quando `step` sai de 'pick', em vez de inventar um estado
  // intermediário que não existe de verdade.
  const etapa1Status: ImportStepStatus = step !== 'pick' ? 'concluido' : error ? 'erro' : 'aguardando';
  const etapa2Status: ImportStepStatus = step === 'review' || step === 'done' ? 'concluido' : 'aguardando';
  const etapa3Status: ImportStepStatus = step === 'review' || step === 'done' ? 'concluido' : 'aguardando';
  const etapa4Status: ImportStepStatus =
    step === 'done' ? 'concluido' : step === 'review' ? (error ? 'erro' : saving ? 'concluido' : 'andamento') : 'aguardando';
  const etapa5Status: ImportStepStatus = step === 'done' ? 'concluido' : step === 'review' && saving ? 'andamento' : 'aguardando';
  const dsmEtapas: ImportStepInfo[] = [
    {
      key: 'arquivo',
      numero: '01',
      titulo: 'Arquivo recebido',
      descricao: 'Seleção da planilha de DSM (.xlsx, .xls, .xlsm, .csv, .ods).',
      status: etapa1Status,
      resultado: fileName || undefined,
      mensagem: step === 'pick' && error ? error : undefined,
    },
    {
      key: 'identificacao',
      numero: '02',
      titulo: 'Identificação de colunas',
      descricao: 'Detecção do cabeçalho e das colunas de matrícula, data e número de clientes.',
      status: etapa2Status,
    },
    {
      key: 'leitura',
      numero: '03',
      titulo: 'Leitura e classificação dos dados',
      descricao: 'Associação de cada linha ao colaborador cadastrado pela matrícula.',
      status: etapa3Status,
      resultado: rows.length > 0 ? `${rows.length} linha(s)` : undefined,
    },
    {
      key: 'validacao',
      numero: '04',
      titulo: 'Validação e conferência',
      descricao: 'Conferência de data e quantidade de cada linha antes de salvar.',
      status: etapa4Status,
      mensagem: etapa4Status === 'erro' ? (error ?? undefined) : undefined,
    },
    {
      key: 'gravacao',
      numero: '05',
      titulo: 'Gravação no sistema',
      descricao: 'Soma ao total de DSM já registrado para cada colaborador — nunca substitui.',
      status: etapa5Status,
      resultado: result ? `${result.count} gravado(s)` : undefined,
    },
  ];
  const dsmConcluded = [etapa1Status, etapa2Status, etapa3Status, etapa4Status, etapa5Status].filter((s) => s === 'concluido').length;
  const dsmPct = (dsmConcluded / dsmEtapas.length) * 100;

  // Dependências são os estados reais (não o array `dsmEtapas` em si, que é
  // um literal novo a cada render) — evita disparar o efeito (e o
  // onCentralChange pro pai) em todo render sem uma mudança de verdade.
  useEffect(() => {
    onCentralChange?.({ titulo: 'CENTRAL DE IMPORTAÇÃO — DSM', subtitulo: 'Análise, validação e gravação segura do DSM.', etapas: dsmEtapas, pct: dsmPct });
    onAcaoChange?.(
      step === 'review'
        ? {
            tipo: 'voltarConfirmar',
            voltarLabel: 'Cancelar',
            confirmarLabel: saving ? 'Gravando…' : `Salvar dados de DSM (${rows.filter((r) => r.collaboratorId && r.dataISO).length})`,
            confirmando: saving,
          }
        : step === 'done' && result
          ? { tipo: 'resultado', label: 'Importar outra planilha de DSM' }
          : { tipo: 'nenhuma' },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, fileName, error, saving, result, rows]);

  return (
    <div className="flex flex-col gap-3">
        {step === 'pick' && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="font-semibold text-sm mb-1">Importar planilha de DSM</h3>
            <p className="text-xs text-slate-500 mb-3">
              Importa a contagem de conversões do cupom DSM (Desconto Só Meu) por colaborador e por dia. Cada
              importação soma ao total já registrado — nunca substitui uma importação anterior.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.xlsm,.csv,.ods"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              style={{ display: 'none' }}
            />
            {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
          </div>
        )}

        {step === 'review' && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="font-semibold text-sm mb-1">Conferir dados de DSM antes de salvar</h3>
            <p className="text-xs text-slate-500 mb-3">
              {rows.length} linha(s) encontrada(s). Corrija data ou quantidade se necessário, ou remova uma linha, antes de salvar. Colaboradores não
              cadastrados aparecem sinalizados e não são salvos.
            </p>
            <DsmReviewTable rows={rows} collaboratorsById={collaboratorsById} onChangeRow={updateRow} onRemoveRow={removeRow} />
            {error && <p className="text-xs text-rose-400 mt-3">{error}</p>}
          </div>
        )}

        {step === 'done' && result && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-sm text-green-400">
              {result.count} registro(s) de DSM importado(s)
              {result.duplicateCount ? ` · ${result.duplicateCount} duplicado(s) ignorado(s)` : ''}
              {result.unregisteredCount ? ` · ${result.unregisteredCount} de colaborador não cadastrado (não incluído)` : ''}
            </p>
          </div>
        )}
    </div>
  );
});
