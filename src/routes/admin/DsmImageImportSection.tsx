import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { DsmReviewTable } from '../../components/dsm/DsmReviewTable';
import { Spinner } from '../../components/Spinner';
import { buildDsmReviewRowsFromImage, detectDateInText, parseDsmImageLines } from '../../lib/business/dsmImageParse';
import type { DsmReviewRow } from '../../lib/business/dsmImport';
import { normalizeMatricula } from '../../lib/business/parsing';
import { todayISO } from '../../lib/dateRange';
import { saveDsmReview, translateDbError } from '../../lib/dsmRecordsImport';
import { recognizeImageText } from '../../lib/ocr';
import { useCollaborators, useDsmRecords } from '../../lib/queries';

const MAX_IMAGE_SIZE = 15 * 1024 * 1024;

type Step = 'input' | 'review' | 'done';

/** Fase 3 do DSM (Desconto Só Meu): colar ou selecionar uma foto/print do
 * relatório de DSM, ler o texto por OCR (Tesseract, no navegador, sem
 * IA — ver lib/ocr.ts) e cair na mesma tela de conferência da Fase 2
 * (DsmReviewTable). O texto extraído sempre fica numa caixa editável antes
 * de processar — o ADM pode corrigir o que o OCR errou, ou simplesmente
 * colar um texto já copiado de outro lugar sem nunca selecionar imagem
 * nenhuma (mesmo caminho "colar texto" do Super Troco do sistema antigo).
 * A imagem em si nunca é enviada nem guardada — só usada localmente para o
 * OCR e descartada. */
export function DsmImageImportSection() {
  const { profile } = useAuth();
  const { data: collaborators } = useCollaborators();
  const { data: existingRecords, refetch: refetchDsmRecords } = useDsmRecords();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteAreaRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>('input');
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [dataISO, setDataISO] = useState(todayISO());
  // "Período": quando o print mostra um total acumulado de vários dias (ex.:
  // relatório da semana) em vez de um único dia — grava tudo na data de FIM
  // do período (dataInicio fica só de referência/anotação, não muda o que é
  // salvo). Cada linha continua editável na conferência abaixo, então dá pra
  // ajustar individualmente se algum colaborador precisar de outra data.
  const [dateMode, setDateMode] = useState<'dia' | 'periodo'>('dia');
  const [dataInicio, setDataInicio] = useState(todayISO());
  const [dataFim, setDataFim] = useState(todayISO());
  const [rows, setRows] = useState<DsmReviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ count: number; duplicateCount: number; unregisteredCount: number } | null>(null);

  // Revoga a URL do preview ao trocar de imagem ou desmontar — nunca
  // guardamos a imagem em lugar nenhum além dessa memória temporária do navegador.
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  if (!collaborators) return null;

  const collaboratorsById = new Map(collaborators.map((c) => [c.id, c]));
  const collaboratorByMatricula = new Map(collaborators.map((c) => [normalizeMatricula(c.matricula), c]));

  function setImage(blob: Blob) {
    setError(null);
    if (blob.size > MAX_IMAGE_SIZE) {
      setError('Imagem maior que 15MB. Escolha uma imagem menor.');
      return;
    }
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageBlob(blob);
    setImagePreviewUrl(URL.createObjectURL(blob));
  }

  function clearImage() {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageBlob(null);
    setImagePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith('image/'));
    if (!item) return;
    const blob = item.getAsFile();
    if (blob) setImage(blob);
  }

  async function handleScan() {
    if (!imageBlob) return;
    setError(null);
    setScanning(true);
    setScanProgress(0);
    try {
      const recognized = await recognizeImageText(imageBlob, setScanProgress);
      setText(recognized);
      // Auto-detecção de data só se aplica no modo "dia único" — em modo
      // período o ADM já informou início/fim manualmente.
      if (dateMode === 'dia') {
        const detectedDate = detectDateInText(recognized);
        if (detectedDate) setDataISO(detectedDate);
      }
    } catch {
      setError('Não foi possível ler o texto desta imagem. Tente uma foto mais nítida, ou cole o texto manualmente abaixo.');
    } finally {
      setScanning(false);
      setScanProgress(null);
    }
  }

  function handleProcessText() {
    setError(null);
    let effectiveDate: string;
    if (dateMode === 'dia') {
      if (!dataISO) {
        setError('Informe a data desta análise antes de processar.');
        return;
      }
      effectiveDate = dataISO;
    } else {
      if (!dataInicio || !dataFim) {
        setError('Informe as datas de início e fim do período antes de processar.');
        return;
      }
      if (dataInicio > dataFim) {
        setError('A data de início não pode ser depois da data de fim.');
        return;
      }
      effectiveDate = dataFim;
    }
    const matches = parseDsmImageLines(text);
    if (matches.length === 0) {
      setError('Nenhuma linha de colaborador foi reconhecida neste texto. Confira o texto extraído ou tente escanear de novo.');
      return;
    }
    setRows(buildDsmReviewRowsFromImage(matches, effectiveDate, collaboratorByMatricula));
    setStep('review');
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
      const { data: freshRecords } = await refetchDsmRecords();
      const saveResult = await saveDsmReview(profile.store_id, 'imagem', null, rows, freshRecords ?? existingRecords ?? []);
      setResult(saveResult);
      setStep('done');
    } catch (err) {
      setError(translateDbError(err));
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setStep('input');
    clearImage();
    setText('');
    setDataISO(todayISO());
    setDateMode('dia');
    setDataInicio(todayISO());
    setDataFim(todayISO());
    setRows([]);
    setResult(null);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {step === 'input' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-semibold text-sm mb-1">Importar imagem de DSM</h3>
          <p className="text-xs text-slate-500 mb-3">
            Cole ou selecione um print do relatório de DSM — a leitura de texto acontece aqui no navegador (sem IA, sem enviar a imagem pra fora). A
            imagem em si não é guardada.
          </p>

          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setDateMode('dia')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                dateMode === 'dia' ? 'bg-cyan-500 text-slate-950' : 'border border-slate-700 text-slate-300'
              }`}
            >
              Dia único
            </button>
            <button
              type="button"
              onClick={() => setDateMode('periodo')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                dateMode === 'periodo' ? 'bg-cyan-500 text-slate-950' : 'border border-slate-700 text-slate-300'
              }`}
            >
              Período
            </button>
          </div>

          {dateMode === 'dia' ? (
            <>
              <label className="block text-xs text-slate-400 mb-1">Data desta análise</label>
              <input type="date" value={dataISO} onChange={(e) => setDataISO(e.target.value)} className="input mb-3 max-w-[180px]" />
            </>
          ) : (
            <div className="flex flex-wrap items-end gap-3 mb-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Início do período</label>
                <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="input max-w-[180px]" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Fim do período</label>
                <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="input max-w-[180px]" />
              </div>
              <p className="text-xs text-slate-500 mb-1.5 basis-full">
                Os dados escaneados serão gravados na data de fim do período — cada linha continua editável na conferência antes de salvar.
              </p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && setImage(e.target.files[0])}
            style={{ display: 'none' }}
          />

          {!imagePreviewUrl ? (
            <div
              ref={pasteAreaRef}
              onPaste={handlePaste}
              tabIndex={0}
              role="button"
              onClick={() => pasteAreaRef.current?.focus()}
              className="rounded-xl border border-dashed border-slate-700 p-6 text-center cursor-text focus:outline-none focus:border-cyan-500"
            >
              <p className="text-sm text-slate-300 mb-1">
                Clique aqui e cole a imagem com <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-xs">Ctrl</kbd> +{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-xs">V</kbd>
              </p>
              <p className="text-xs text-slate-500 mb-3">ou use o botão abaixo</p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Selecionar imagem
              </button>
            </div>
          ) : (
            <div className="flex items-start gap-3 mb-3">
              <img src={imagePreviewUrl} alt="Prévia do print de DSM" className="rounded-lg border border-slate-800 max-h-40" />
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleScan}
                  disabled={scanning}
                  className="rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm disabled:opacity-60 flex items-center gap-2"
                >
                  {scanning && <Spinner size={14} color="#04121a" />}
                  {scanning ? `Escaneando… ${scanProgress ?? 0}%` : '🔍 Escanear'}
                </button>
                <button type="button" onClick={clearImage} className="text-xs text-slate-500 hover:text-rose-400 text-left">
                  Remover imagem
                </button>
              </div>
            </div>
          )}

          <label className="block text-xs text-slate-400 mt-4 mb-1">Texto extraído (revise antes de processar — ou cole um texto aqui direto)</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder="70208345-DEIVESON RAMOS PAIVA  1.540  56.955,35  126"
            className="input font-mono text-xs w-full"
          />

          {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}

          <button
            type="button"
            onClick={handleProcessText}
            disabled={!text.trim()}
            className="rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm mt-3 disabled:opacity-60"
          >
            Processar texto
          </button>
        </div>
      )}

      {step === 'review' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-semibold text-sm mb-1">Conferir dados de DSM antes de salvar</h3>
          <p className="text-xs text-slate-500 mb-3">
            {rows.length} linha(s) reconhecida(s) — data{' '}
            {dateMode === 'dia'
              ? dataISO.split('-').reverse().join('/')
              : `${dataInicio.split('-').reverse().join('/')} a ${dataFim.split('-').reverse().join('/')} (gravado em ${dataFim
                  .split('-')
                  .reverse()
                  .join('/')})`}
            . Corrija data ou quantidade se necessário, ou remova uma linha, antes de salvar. Colaboradores não cadastrados aparecem sinalizados e não são
            salvos.
          </p>
          <DsmReviewTable rows={rows} collaboratorsById={collaboratorsById} onChangeRow={updateRow} onRemoveRow={removeRow} />
          {error && <p className="text-xs text-rose-400 mt-3">{error}</p>}
          <div className="flex gap-2 mt-3">
            <button onClick={() => setStep('input')} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">
              ← Voltar
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm disabled:opacity-60 flex items-center gap-2"
            >
              {saving && <Spinner size={14} color="#04121a" />}
              {saving ? 'Gravando…' : `Salvar dados de DSM (${rows.filter((r) => r.collaboratorId && r.dataISO).length})`}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-sm text-green-400 mb-2">
            {result.count} registro(s) de DSM importado(s)
            {result.duplicateCount ? ` · ${result.duplicateCount} duplicado(s) ignorado(s)` : ''}
            {result.unregisteredCount ? ` · ${result.unregisteredCount} de colaborador não cadastrado (não incluído)` : ''}
          </p>
          <button onClick={reset} className="rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm">
            Importar outra imagem de DSM
          </button>
        </div>
      )}
    </div>
  );
}
