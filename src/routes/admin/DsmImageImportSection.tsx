import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { DsmReviewTable } from '../../components/dsm/DsmReviewTable';
import type { CentralImportacaoData, ImportAcaoBotoes, ImportStepInfo, ImportStepStatus } from '../../components/import/CentralImportacaoPanel';
import { Spinner } from '../../components/Spinner';
import { detectClientesColumnValues, findClientesColumnCropRange, matchColumnLinesToRows } from '../../lib/business/dsmImageColumns';
import {
  buildCleanDsmImageText,
  buildDsmReviewRowsFromImage,
  computeDsmImageMatches,
  countApparentCollaboratorLines,
  detectDateInText,
  type DsmImageLineMatch,
} from '../../lib/business/dsmImageParse';
import type { DsmReviewRow } from '../../lib/business/dsmImport';
import { normalizeMatricula } from '../../lib/business/parsing';
import { saveDsmReview, translateDbError } from '../../lib/dsmRecordsImport';
import { recognizeColumnText, recognizeImageText } from '../../lib/ocr';
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
 * OCR e descartada.
 *
 * Três análises sobre a mesma imagem (pedido do usuário, 2026-10-24 e
 * 2026-10-28):
 * - 1ª análise (por linha/texto): o texto bruto do OCR, lido linha a linha
 *   por parseDsmImageLines/parseDsmImageLinesByCollaboratorName — ignora
 *   Loja/Data/Vendas/Valor, procurando só o padrão
 *   "<matrícula>-<NOME> ... <inteiro>" (ou o nome já cadastrado, quando a
 *   matrícula sai ilegível do OCR).
 * - 2ª análise (por coluna/posição, MESMO passe de OCR da 1ª — não roda o
 *   motor de novo): detectClientesColumnValues (dsmImageColumns.ts) localiza
 *   o cabeçalho "Número de Clientes" pela posição na imagem e lê, pra cada
 *   linha, o número mais próximo dele em X.
 * - 3ª análise (recorte + releitura dedicada, roda o motor de OCR DE NOVO,
 *   só dessa vez): quando a 2ª análise achou o cabeçalho "Número de
 *   Clientes", findClientesColumnCropRange (dsmImageColumns.ts) calcula a
 *   faixa vertical daquela coluna e recognizeColumnText (lib/ocr.ts) recorta
 *   só essa faixa (via `rectangle` do Tesseract — a imagem original nunca é
 *   alterada) e lê de novo, com whitelist só de dígitos — sem o resto da
 *   tabela disputando atenção do motor. matchColumnLinesToRows
 *   (dsmImageColumns.ts) casa cada linha dessa releitura com a linha de
 *   colaborador certa pela posição Y. Pedido explícito do usuário
 *   (2026-10-28): mesmo com a 2ª análise, alguns colaboradores continuavam
 *   sem quantidade reconhecida — essa 3ª análise é a tentativa dedicada de
 *   achar especificamente esses casos.
 * A 2ª e a 3ª são mescladas numa única Map (3ª prevalece onde achou algo,
 * já que é a releitura mais confiável — ver handleScan), e essa Map é quem
 * decide o valor final sempre que achou algo pra uma matrícula, mesmo que a
 * 1ª já tivesse achado algo (pedido explícito do usuário, 2026-10-28 — ver
 * computeDsmImageMatches). As três são mescladas (computeDsmImageMatches,
 * dsmImageParse.ts) logo após escanear, e a caixa "Texto extraído" mostra o
 * resultado já reconstruído e limpo (buildCleanDsmImageText) — uma linha por
 * colaborador reconhecido, sem Loja/Data/Vendas/Valor/Clientes(%)/
 * cabeçalhos/outros textos da imagem (pedido explícito do usuário,
 * 2026-10-24: essas colunas deviam ser ignoradas também no texto capturado,
 * não só no resultado final). `matches`/`rawText` ficam guardados à parte:
 * se o ADM não tocar no texto, "Processar texto" reusa esse resultado já
 * calculado (preserva os selos "2ª leitura"/"2ª análise (coluna)" da
 * conferência — a 3ª análise usa o mesmo selo "coluna" da 2ª, já que as duas
 * alimentam a mesma Map final); se editar ou colar outro texto por cima,
 * reprocessa esse texto do zero a partir do mesmo computeDsmImageMatches
 * (sem selo nenhum, igual ao caminho "colar texto" de sempre). `rawText`
 * guarda só o despejo original do OCR, usado apenas internamente pela
 * checagem de completude (countApparentCollaboratorLines precisa do texto
 * cru, não do já filtrado, pra notar colaborador que ficou de fora até da
 * reconstrução).
 * `onStepChange` avisa o ImportarPage da troca de etapa — a barra "Importar
 * planilha de DSM" só aparece na etapa 'input' (ver ImportarPage.tsx).
 * `onCentralChange` reporta o estado atual (etapas + % de progresso) pro
 * ImportarPage, que decide ali fora qual dos dois painéis de DSM (este ou o
 * de DsmImportSection) mostrar — este componente não desenha mais seu
 * próprio `CentralImportacaoPanel` (pedido explícito do usuário, 2026-10-29:
 * só pode haver UM velocímetro visível por vez na tela de DSM).
 *
 * `ref.voltar()`/`ref.confirmar()` e `onAcaoChange` seguem o mesmo princípio
 * pros botões das etapas 'review'/'done' — pedido explícito do usuário,
 * 2026-10-31: "as configurações de botões também devem seguir para as
 * outras funções de DSM e UVC" (ver `ImportAcaoBotoesBar`). A etapa 'input'
 * continua sem botão externo — a área de colar/selecionar já É a interação
 * principal (decisão já tomada nesta sessão: não há um "primeiro botão"
 * único extraível dela). */
export interface DsmImageImportSectionHandle {
  voltar: () => void;
  confirmar: () => void;
}

export const DsmImageImportSection = forwardRef<
  DsmImageImportSectionHandle,
  {
    onStepChange?: (step: Step) => void;
    onCentralChange?: (central: CentralImportacaoData) => void;
    onAcaoChange?: (acao: ImportAcaoBotoes) => void;
  }
>(function DsmImageImportSection({ onStepChange, onCentralChange, onAcaoChange }, ref) {
  const { profile } = useAuth();
  const { data: collaborators } = useCollaborators();
  const { data: existingRecords, refetch: refetchDsmRecords } = useDsmRecords();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteAreaRef = useRef<HTMLDivElement>(null);

  // `voltar` serve dois botões diferentes conforme a etapa: na 'review' é
  // "← Voltar" (só volta pra 'input', mantém imagem/texto já lidos); na
  // 'done' é o botão de resultado "Importar outra imagem de DSM" (precisa
  // limpar tudo, daí `reset()` em vez de só trocar de etapa). Sem array de
  // dependências — mesmo motivo de DsmImportSection.tsx: não pode ficar
  // presa ao closure do 1º render (aqui inclusive o próprio `step`).
  useImperativeHandle(ref, () => ({ voltar: () => (step === 'done' ? reset() : setStep('input')), confirmar: handleConfirm }));

  const [step, setStep] = useState<Step>('input');
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<number | null>(null);
  const [text, setText] = useState('');
  // Despejo bruto do OCR (recognized.text), só pra countApparentCollaboratorLines
  // (ver comentário do componente acima) — nunca mostrado na tela.
  const [rawText, setRawText] = useState('');
  // Resultado já mesclado (1ª leitura + 2ª leitura por nome + 2ª análise por
  // coluna) do último scan — reusado por "Processar texto" enquanto `text`
  // continuar igual ao texto limpo gerado a partir daqui (ver comentário do
  // componente). Vazio quando nenhuma imagem foi escaneada ainda (ou o ADM
  // só colou texto direto), caso em que handleProcessText recalcula tudo a
  // partir do `text` atual.
  const [matches, setMatches] = useState<DsmImageLineMatch[]>([]);
  // null = a 2ª análise (por coluna) ainda não rodou pra imagem atual;
  // Map (mesmo vazio) = já rodou. Só passa a bloquear "Processar texto"
  // quando existe imagem carregada (ver o `disabled` do botão abaixo) —
  // colar texto direto, sem nunca selecionar imagem, continua liberado
  // como sempre.
  const [clientesColumnMatches, setClientesColumnMatches] = useState<Map<string, number> | null>(null);
  // Em branco de propósito (não todayISO()) — o ADM precisa informar a data
  // ou o período explicitamente antes de conseguir processar; "Processar
  // texto" fica desabilitado até isso acontecer (ver o disabled do botão
  // abaixo). handleScan ainda pré-preenche automaticamente quando acha uma
  // data no texto (ver detectDateInText), o que já conta como informado.
  const [dataISO, setDataISO] = useState('');
  // "Período": quando o print mostra um total acumulado de vários dias (ex.:
  // relatório da semana) em vez de um único dia — grava tudo na data de FIM
  // do período (dataInicio fica só de referência/anotação, não muda o que é
  // salvo). Cada linha continua editável na conferência abaixo, então dá pra
  // ajustar individualmente se algum colaborador precisar de outra data.
  const [dateMode, setDateMode] = useState<'dia' | 'periodo'>('dia');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [rows, setRows] = useState<DsmReviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [completenessWarning, setCompletenessWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ count: number; duplicateCount: number; unregisteredCount: number } | null>(null);

  useEffect(() => {
    onStepChange?.(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

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
  // Extraído à parte (em vez de usar `collaborators` direto dentro da
  // função abaixo) porque o TypeScript não propaga o "if (!collaborators)
  // return null" acima para dentro de function declarations aninhadas — sem
  // isso o tipo volta a ser `Collaborator[] | undefined` lá dentro.
  const collaboratorNames = collaborators.map((c) => ({ nome: c.nome, matricula: c.matricula }));

  function setImage(blob: Blob) {
    setError(null);
    if (blob.size > MAX_IMAGE_SIZE) {
      setError('Imagem maior que 15MB. Escolha uma imagem menor.');
      return;
    }
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageBlob(blob);
    setImagePreviewUrl(URL.createObjectURL(blob));
    setClientesColumnMatches(null);
    setMatches([]);
    setRawText('');
  }

  function clearImage() {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageBlob(null);
    setImagePreviewUrl(null);
    setClientesColumnMatches(null);
    setMatches([]);
    setRawText('');
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
    setClientesColumnMatches(null);
    try {
      const { text: recognized, blocks } = await recognizeImageText(imageBlob, setScanProgress);
      setRawText(recognized);
      // Auto-detecção de data só se aplica no modo "dia único" — em modo
      // período o ADM já informou início/fim manualmente.
      if (dateMode === 'dia') {
        const detectedDate = detectDateInText(recognized);
        if (detectedDate) setDataISO(detectedDate);
      }
      // 2ª análise: mesmo passe de OCR, lendo a coluna "Número de Clientes"
      // pela posição em vez do texto corrido (ver dsmImageColumns.ts).
      const columnMatches = detectClientesColumnValues(blocks);
      // 3ª análise: quando a 2ª achou o cabeçalho "Número de Clientes",
      // recorta só a faixa vertical dessa coluna (findClientesColumnCropRange)
      // e roda o motor de OCR DE NOVO, dedicado só a ela (recognizeColumnText,
      // lib/ocr.ts) — sem o resto da tabela disputando atenção, com
      // whitelist só de dígitos. Cobre os colaboradores que a 2ª não achou
      // (ou achou errado) por o token já estar ilegível no OCR de página
      // inteira (pedido explícito do usuário, 2026-10-28). Puramente um
      // reforço: se o cabeçalho não foi achado, ou a releitura falhar por
      // qualquer motivo (imagem grande demais, navegador sem suporte a
      // createImageBitmap, etc.), segue só com a 2ª análise — nunca trava o
      // fluxo.
      let finalColumnMatches = columnMatches;
      const cropRange = findClientesColumnCropRange(blocks);
      if (cropRange) {
        try {
          const columnLines = await recognizeColumnText(imageBlob, cropRange, setScanProgress);
          const croppedMatches = matchColumnLinesToRows(columnLines, blocks);
          if (croppedMatches.size > 0) finalColumnMatches = new Map([...columnMatches, ...croppedMatches]);
        } catch {
          // Mantém finalColumnMatches = columnMatches (só a 2ª análise).
        }
      }
      setClientesColumnMatches(finalColumnMatches);
      // Mescla a 1ª leitura (por texto) com a 2ª/3ª (por coluna, já
      // mescladas acima — a 3ª prevalece onde achou algo) e já mostra o
      // resultado reconstruído/limpo na caixa — ignorando Loja/Data/Vendas/
      // Valor/Clientes(%)/cabeçalhos e qualquer outro texto da imagem, em
      // vez do despejo bruto do OCR (pedido explícito do usuário,
      // 2026-10-24). Sem nenhum colaborador reconhecido, mostra o texto
      // bruto mesmo — ao menos dá pro ADM ver o que o OCR leu e corrigir à
      // mão.
      const merged = computeDsmImageMatches(recognized, collaboratorNames, finalColumnMatches);
      setMatches(merged);
      setText(merged.length > 0 ? buildCleanDsmImageText(merged) : recognized);
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
    // Reusa o resultado já calculado no scan (com os selos "2ª leitura"/"2ª
    // análise (coluna)") enquanto o ADM não tocar no texto; se editou ou
    // colou outro texto por cima, recalcula do zero a partir do texto atual
    // (mesmo motor, sem selo nenhum — igual ao caminho "colar texto" direto,
    // sem nunca escanear imagem nenhuma).
    const effectiveMatches =
      matches.length > 0 && text === buildCleanDsmImageText(matches) ? matches : computeDsmImageMatches(text, collaboratorNames, clientesColumnMatches);
    if (effectiveMatches.length === 0) {
      setError('Nenhuma linha de colaborador foi reconhecida neste texto. Confira o texto extraído ou tente escanear de novo.');
      return;
    }
    // Segunda análise: compara quantas linhas o texto PARECE ter (mesmo que
    // nem toda tenha virado uma linha reconhecida) contra quantas de fato
    // viraram — o único caso que nenhuma das duas leituras acima consegue
    // recuperar sozinha é matrícula E nome ilegíveis pro OCR ao mesmo tempo.
    // Sempre a partir do texto BRUTO do OCR (rawText) — o texto já limpo/
    // reconstruído mostrado na tela só teria linhas já reconhecidas, o que
    // tornaria essa checagem inútil (nunca detectaria ninguém faltando).
    const apparentLines = countApparentCollaboratorLines(rawText || text);
    setCompletenessWarning(
      apparentLines > effectiveMatches.length
        ? `O texto parece ter ${apparentLines} linha(s) de colaborador, mas só ${effectiveMatches.length} foram reconhecidas. Role o texto extraído e confira se alguém ficou de fora antes de salvar.`
        : null,
    );
    setRows(buildDsmReviewRowsFromImage(effectiveMatches, effectiveDate, collaboratorByMatricula));
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
    setDataISO('');
    setDateMode('dia');
    setDataInicio('');
    setDataFim('');
    setRows([]);
    setCompletenessWarning(null);
    setResult(null);
    setError(null);
  }

  // Só bloqueia em "Processar texto" quando existe imagem carregada e a 2ª
  // análise ainda não rodou pra ela — colar texto direto, sem imagem
  // nenhuma, nunca passa por esse gate (ver comentário do state acima).
  const waitingSecondAnalysis = !!imageBlob && clientesColumnMatches === null && !scanning;
  const secondAnalysisStatus =
    clientesColumnMatches === null
      ? null
      : clientesColumnMatches.size > 0
        ? `✓ Segunda análise concluída — ${clientesColumnMatches.size} valor(es) de "Número de Clientes" confirmado(s) pela coluna.`
        : '✓ Segunda análise concluída — não foi possível localizar a coluna "Número de Clientes" nesta imagem; revise o texto manualmente.';

  // Mesmo princípio das outras três telas de importação (ver o comentário de
  // buildVendasEtapas em ImportarPage.tsx): só traduz o estado que já existe
  // acima — nenhuma das três análises de OCR, nem o reconhecimento de
  // colaborador, é alterado aqui. Caminho "colar texto direto" (sem nunca
  // selecionar imagem) pula a etapa 2 (nada pra identificar numa imagem que
  // não existe) direto pra "concluído", igual ao resto do fluxo já trata
  // esse caso (ver waitingSecondAnalysis acima).
  const hasInput = !!imageBlob || text.trim().length > 0;
  const etapa1Status: ImportStepStatus = step !== 'input' ? 'concluido' : hasInput ? 'concluido' : error ? 'erro' : 'aguardando';
  const etapa2Status: ImportStepStatus =
    step !== 'input'
      ? 'concluido'
      : !imageBlob
        ? hasInput
          ? 'concluido'
          : 'aguardando'
        : scanning
          ? 'andamento'
          : clientesColumnMatches !== null
            ? 'concluido'
            : 'aguardando';
  const etapa3Status: ImportStepStatus = step !== 'input' ? 'concluido' : scanning ? 'andamento' : 'aguardando';
  const etapa4Status: ImportStepStatus =
    step === 'done'
      ? 'concluido'
      : step === 'review'
        ? error
          ? 'erro'
          : saving
            ? 'concluido'
            : completenessWarning
              ? 'atencao'
              : 'andamento'
        : 'aguardando';
  const etapa5Status: ImportStepStatus = step === 'done' ? 'concluido' : step === 'review' && saving ? 'andamento' : 'aguardando';
  const dsmImagemEtapas: ImportStepInfo[] = [
    {
      key: 'arquivo',
      numero: '01',
      titulo: 'Arquivo recebido',
      descricao: 'Imagem colada/selecionada, ou texto informado manualmente.',
      status: etapa1Status,
      mensagem: step === 'input' && error ? error : undefined,
    },
    {
      key: 'identificacao',
      numero: '02',
      titulo: 'Identificação da coluna de clientes',
      descricao: 'Localização do cabeçalho "Número de Clientes" pela posição na imagem (2ª e 3ª análises).',
      status: etapa2Status,
      resultado: clientesColumnMatches && clientesColumnMatches.size > 0 ? `${clientesColumnMatches.size} valor(es) pela coluna` : undefined,
    },
    {
      key: 'leitura',
      numero: '03',
      titulo: 'Leitura e classificação dos dados',
      descricao: 'Reconhecimento de cada colaborador por matrícula, nome (inclusive aproximado) ou coluna.',
      status: etapa3Status,
      resultado: step !== 'input' ? `${rows.length} linha(s)` : matches.length > 0 ? `${matches.length} reconhecido(s)` : undefined,
    },
    {
      key: 'validacao',
      numero: '04',
      titulo: 'Validação e conferência',
      descricao: 'Conferência de data e quantidade de cada colaborador antes de salvar.',
      status: etapa4Status,
      mensagem: etapa4Status === 'erro' ? (error ?? undefined) : etapa4Status === 'atencao' ? (completenessWarning ?? undefined) : undefined,
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
  const dsmImagemConcluded = [etapa1Status, etapa2Status, etapa3Status, etapa4Status, etapa5Status].filter((s) => s === 'concluido').length;
  const dsmImagemPct = (dsmImagemConcluded / dsmImagemEtapas.length) * 100;

  // Dependências são os estados reais (não o array `dsmImagemEtapas` em si,
  // que é um literal novo a cada render) — evita disparar o efeito (e o
  // onCentralChange pro pai) em todo render sem uma mudança de verdade.
  useEffect(() => {
    onCentralChange?.({
      titulo: 'CENTRAL DE IMPORTAÇÃO — DSM (IMAGEM)',
      subtitulo: 'Análise, validação e gravação segura do DSM a partir de uma foto.',
      etapas: dsmImagemEtapas,
      pct: dsmImagemPct,
    });
    onAcaoChange?.(
      step === 'review'
        ? {
            tipo: 'voltarConfirmar',
            voltarLabel: '← Voltar',
            confirmarLabel: saving ? 'Gravando…' : `Salvar dados de DSM (${rows.filter((r) => r.collaboratorId && r.dataISO).length})`,
            confirmando: saving,
          }
        : step === 'done' && result
          ? { tipo: 'resultado', label: 'Importar outra imagem de DSM' }
          : { tipo: 'nenhuma' },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, imageBlob, text, error, scanning, clientesColumnMatches, matches, rows, completenessWarning, saving, result]);

  return (
    <div className="flex flex-col gap-3">
      {step === 'input' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-semibold text-sm mb-1">Importar imagem de DSM</h3>
          <p className="text-xs text-slate-500 mb-3">
            Cole ou selecione um print do relatório de DSM — a leitura de texto acontece aqui no navegador (sem IA, sem enviar a imagem pra fora). A
            imagem em si não é guardada.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Coluna esquerda: data, prévia da imagem e Escanear (agora
                embaixo da prévia, não mais do lado) — paralela à caixa de
                texto extraído à direita (pedido explícito do usuário,
                2026-10-24). */}
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setDateMode('dia')}
                  className={`w-full rounded-lg px-3 py-1.5 text-xs font-medium ${
                    dateMode === 'dia' ? 'bg-cyan-500 text-slate-950' : 'border border-slate-700 text-slate-300'
                  }`}
                >
                  Dia único
                </button>
                <button
                  type="button"
                  onClick={() => setDateMode('periodo')}
                  className={`w-full rounded-lg px-3 py-1.5 text-xs font-medium ${
                    dateMode === 'periodo' ? 'bg-cyan-500 text-slate-950' : 'border border-slate-700 text-slate-300'
                  }`}
                >
                  Período
                </button>
              </div>

              {dateMode === 'dia' ? (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Data desta análise</label>
                  <input type="date" value={dataISO} onChange={(e) => setDataISO(e.target.value)} className="input max-w-[180px]" />
                </div>
              ) : (
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Início do período</label>
                    <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="input max-w-[180px]" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Fim do período</label>
                    <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="input max-w-[180px]" />
                  </div>
                  <p className="text-xs text-slate-500 basis-full">
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
                <div className="flex flex-col gap-2">
                  <img src={imagePreviewUrl} alt="Prévia do print de DSM" className="rounded-lg border border-slate-800 w-full max-h-72 object-contain" />
                  <button
                    type="button"
                    onClick={handleScan}
                    disabled={scanning}
                    translate="no"
                    className="rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {scanning && <Spinner size={14} color="#04121a" />}
                    {scanning ? `Escaneando… ${scanProgress ?? 0}%` : '🔍 Escanear'}
                  </button>
                  <button type="button" onClick={clearImage} className="text-xs text-slate-500 hover:text-rose-400 text-left">
                    Remover imagem
                  </button>
                </div>
              )}
            </div>

            {/* Coluna direita: texto extraído, paralela ao bloco acima. */}
            <div className="flex flex-col">
              <label className="block text-xs text-slate-400 mb-1">Texto extraído (revise antes de processar — ou cole um texto aqui direto)</label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={12}
                placeholder="70208345-DEIVESON RAMOS PAIVA  1.540  56.955,35  126"
                className="input font-mono text-xs w-full flex-1 min-h-[220px]"
              />
              {secondAnalysisStatus && <p className="text-[11px] text-slate-500 mt-1.5">{secondAnalysisStatus}</p>}
              {waitingSecondAnalysis && (
                <p className="text-[11px] text-amber-400 mt-1.5">
                  Clique em "Escanear" para rodar a segunda análise (confirmação da coluna "Número de Clientes") antes de processar.
                </p>
              )}
            </div>
          </div>

          {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}

          <button
            type="button"
            onClick={handleProcessText}
            disabled={!text.trim() || (dateMode === 'dia' ? !dataISO : !dataInicio || !dataFim) || waitingSecondAnalysis}
            title={
              waitingSecondAnalysis
                ? 'Escaneie a imagem (segunda análise) antes de processar'
                : dateMode === 'dia'
                  ? !dataISO
                    ? 'Informe a data desta análise antes de processar'
                    : undefined
                  : !dataInicio || !dataFim
                    ? 'Informe o início e o fim do período antes de processar'
                    : undefined
            }
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
            {rows.length} linha(s) reconhecida(s)
            {rows.some((r) => r.fonte === 'nome') ? ` (${rows.filter((r) => r.fonte === 'nome').length} pela segunda leitura, por nome)` : ''}
            {rows.some((r) => r.fonte === 'nome-aproximado')
              ? ` (${rows.filter((r) => r.fonte === 'nome-aproximado').length} por nome aproximado — confira se é a pessoa certa)`
              : ''}
            {rows.some((r) => r.fonte === 'coluna') ? ` (${rows.filter((r) => r.fonte === 'coluna').length} pela segunda análise, por coluna)` : ''} —
            data{' '}
            {dateMode === 'dia'
              ? dataISO.split('-').reverse().join('/')
              : `${dataInicio.split('-').reverse().join('/')} a ${dataFim.split('-').reverse().join('/')} (gravado em ${dataFim
                  .split('-')
                  .reverse()
                  .join('/')})`}
            . Corrija data ou quantidade se necessário, ou remova uma linha, antes de salvar. Colaboradores não cadastrados aparecem sinalizados e não são
            salvos.
          </p>
          {completenessWarning && <p className="text-xs text-amber-400 mb-3">⚠️ {completenessWarning}</p>}
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
