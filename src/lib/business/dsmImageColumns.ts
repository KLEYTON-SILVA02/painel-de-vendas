// DSM (Desconto Só Meu) — Fase 3, 2ª e 3ª análises: em vez de ler o texto
// corrido de cima a baixo (dsmImageParse.ts, 1ª análise — por LINHA, pegando
// o último token com cara de inteiro), estas duas passadas localizam a
// coluna "Número de Clientes" pela sua POSIÇÃO horizontal na imagem (os
// bounding boxes que o Tesseract devolve quando lib/ocr.ts pede
// `{ blocks: true }`) — ignorando Loja/Data/Número de Vendas/Valor das
// Vendas/Número de Clientes(%) e qualquer outro texto da imagem (cabeçalhos
// inclusive), por nunca olhar pra eles.
//
// - 2ª análise (detectClientesColumnValues): lê o valor já reconhecido pelo
//   MESMO OCR de página inteira da 1ª análise, pra cada linha de
//   colaborador, escolhendo o token mais próximo em X do cabeçalho
//   "Clientes".
// - 3ª análise (findClientesColumnCropRange + matchColumnLinesToRows, usadas
//   por DsmImageImportSection.tsx junto com recognizeColumnText em
//   lib/ocr.ts): recorta só a faixa vertical daquela coluna e roda o motor
//   de OCR DE NOVO, dedicado só a ela (sem o resto da tabela disputando
//   atenção, com whitelist só de dígitos) — pedido explícito do usuário
//   (2026-10-28): mesmo com a 2ª análise, alguns colaboradores continuavam
//   sem quantidade reconhecida, porque o token já estava ilegível (ou
//   ausente) no OCR de página inteira; uma releitura dedicada, numa imagem
//   bem mais simples pro motor, tem uma chance real de achar o que a
//   primeira passada perdeu.
//
// Isso cobre exatamente o caso que a 1ª análise sozinha não resolve: uma
// linha onde o OCR captura o nome certinho mas derrapa nos números (perde
// um token, gruda dois, ou lê a Data como se fosse mais um número) — "pegar
// o último inteiro da linha" vira a coluna errada ou nenhuma coluna. Pegar
// o número mais próximo, em X, do cabeçalho "Clientes" é mais robusto a
// esse tipo de ruído, porque não depende de quantos tokens sobraram nem da
// ordem em que vieram.
//
// Puramente um reforço: quando não encontra o cabeçalho "Clientes" (imagem
// cortada, fonte não reconhecida, etc.) devolve um Map/null vazio, e o
// fluxo inteiro continua funcionando com a 1ª análise sozinha, exatamente
// como antes dessas funções existirem.
import type { Block } from 'tesseract.js';
import { COUNT_TOKEN, correctOcrDigitConfusions, MATRICULA_NAME_LINE } from './dsmImageParse';
import { normalizeMatricula } from './parsing';

interface Bbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface OcrWord {
  text: string;
  bbox: Bbox;
}
interface OcrLine {
  text: string;
  bbox: Bbox;
  words: OcrWord[];
}

function flattenLines(blocks: Block[] | null): OcrLine[] {
  const lines: OcrLine[] = [];
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        lines.push({ text: line.text, bbox: line.bbox, words: line.words.map((w) => ({ text: w.text, bbox: w.bbox })) });
      }
    }
  }
  return lines;
}

function xCenter(bbox: Bbox): number {
  return (bbox.x0 + bbox.x1) / 2;
}

// Any word containing "client" (case/accent-insensitive via plain /i —
// "Clientes", "clientes" cobre o relatório real) é candidato a cabeçalho de
// uma das duas colunas de clientes do relatório (contagem e percentual).
const CLIENT_WORD = /client/i;
const PERCENT_CHAR = /%/;

interface ClientesHeaderMatch {
  xCenter: number;
  bbox: Bbox;
}

/** Acha o cabeçalho "Número de Clientes" (posição X e bounding box) — nunca
 * o de "Número de Clientes(%)", que vem logo depois no mesmo relatório (ver
 * dsmImageParse.ts). Primeiro descarta candidatos com um "%" em palavras
 * vizinhas (mesma linha, até 2 palavras de distância — cobre tanto
 * "Clientes(%)" quanto "Clientes" seguido de "(%)" numa palavra separada);
 * entre o que sobrar, fica com o mais acima na imagem (cabeçalho sempre
 * fica acima das linhas de dado) e, empatado nisso, o mais à esquerda — a
 * coluna de contagem sempre vem antes da de percentual nesse relatório.
 * Null quando a imagem não tem nenhuma palavra reconhecida como "clientes"
 * — nem a 2ª nem a 3ª análise encontram nada pra confirmar, e o fluxo segue
 * só com a 1ª. */
function findClientesColumnHeader(lines: OcrLine[]): ClientesHeaderMatch | null {
  const candidates: { bbox: Bbox; xCenter: number; y: number; hasPercent: boolean }[] = [];
  for (const line of lines) {
    for (let i = 0; i < line.words.length; i++) {
      const word = line.words[i];
      if (!CLIENT_WORD.test(word.text)) continue;
      const neighborhood = line.words
        .slice(Math.max(0, i - 1), i + 3)
        .map((w) => w.text)
        .join(' ');
      candidates.push({ bbox: word.bbox, xCenter: xCenter(word.bbox), y: word.bbox.y0, hasPercent: PERCENT_CHAR.test(neighborhood) });
    }
  }
  if (candidates.length === 0) return null;
  // Só UM candidato "clientes" no total: o filtro de "%" na vizinhança é a
  // única pista que existe — se ele está marcado, é a coluna de PERCENTUAL
  // (ou o "(%)" que o OCR quebrou num token separado), nunca a de
  // CONTAGEM, e não há um segundo candidato pra desempatar por posição.
  // Usar a posição dele mesmo assim leria sistematicamente a coluna errada
  // (bug visto em produção, 2026-10-24: a 2ª análise "concluía com
  // sucesso" mas confirmava o número de %, não o de clientes) — melhor não
  // ter 2ª/3ª análise nenhuma do que confirmar o valor errado.
  if (candidates.length === 1) {
    return candidates[0].hasPercent ? null : { xCenter: candidates[0].xCenter, bbox: candidates[0].bbox };
  }
  // 2+ candidatos: não filtra mais por "%" aqui — a janela de vizinhança
  // acima marca os DOIS como "tem % por perto" sempre que "Clientes" e
  // "Clientes(%)" ficam lado a lado (o caso normal do relatório), então
  // esse filtro descartaria justamente o cenário que essa análise existe
  // pra resolver. Em vez disso, usa a ordem: a coluna de contagem sempre
  // vem antes (mais à esquerda) da de percentual nesse relatório — mesmo
  // critério já documentado acima.
  candidates.sort((a, b) => a.y - b.y || a.xCenter - b.xCenter);
  return { xCenter: candidates[0].xCenter, bbox: candidates[0].bbox };
}

/** Pra cada linha de colaborador, escolhe — entre os tokens com cara de
 * contagem inteira dessa linha (excluindo o próprio token da matrícula) —
 * o mais próximo em X do cabeçalho "Clientes". Núcleo compartilhado por
 * detectClientesColumnValues (2ª análise — usa só o valor) e
 * findClientesColumnCropRange (3ª análise — usa a bounding box de cada
 * candidato pra calcular a faixa a recortar). */
function collectColumnCandidates(lines: OcrLine[], headerXCenter: number): { matricula: string; word: OcrWord }[] {
  const out: { matricula: string; word: OcrWord }[] = [];
  for (const line of lines) {
    const match = MATRICULA_NAME_LINE.exec(line.text.trim());
    if (!match) continue;
    const matriculaDigits = match[1];
    // Testa/lê a versão corrigida de confusões de OCR (correctOcrDigitConfusions,
    // dsmImageParse.ts) em vez da palavra bruta — mesmo caso da 1ª análise:
    // um dígito lido como letra parecida ("7a" em vez de "74") não pode
    // descartar essa palavra como candidata ao valor da coluna.
    const candidates = line.words.filter((w) => {
      const corrected = correctOcrDigitConfusions(w.text);
      return COUNT_TOKEN.test(corrected) && corrected.replace(/\D/g, '') !== matriculaDigits;
    });
    if (candidates.length === 0) continue;
    let best = candidates[0];
    let bestDist = Math.abs(xCenter(best.bbox) - headerXCenter);
    for (const candidate of candidates.slice(1)) {
      const dist = Math.abs(xCenter(candidate.bbox) - headerXCenter);
      if (dist < bestDist) {
        best = candidate;
        bestDist = dist;
      }
    }
    out.push({ matricula: normalizeMatricula(matriculaDigits), word: best });
  }
  return out;
}

/** 2ª análise (por coluna/posição, sobre o MESMO OCR de página inteira da
 * 1ª análise): devolve matrícula → "Número de Clientes" lido na coluna
 * identificada, uma entrada por linha de colaborador reconhecida (mesmo
 * padrão `<matrícula>-<NOME>` da 1ª análise). */
export function detectClientesColumnValues(blocks: Block[] | null): Map<string, number> {
  const result = new Map<string, number>();
  const lines = flattenLines(blocks);
  const header = findClientesColumnHeader(lines);
  if (!header) return result;
  for (const { matricula, word } of collectColumnCandidates(lines, header.xCenter)) {
    const value = parseInt(correctOcrDigitConfusions(word.text).replace(/\D/g, ''), 10);
    if (Number.isNaN(value)) continue;
    result.set(matricula, value);
  }
  return result;
}

/** Calcula a faixa horizontal (em pixels da imagem original) da coluna
 * "Número de Clientes", pra a 3ª análise recortar só essa faixa vertical e
 * reler com o motor de OCR dedicado só a ela (DsmImageImportSection.tsx,
 * via recognizeColumnText em lib/ocr.ts) — bem mais preciso que ler a
 * palavra já reconhecida no meio do texto corrido da página inteira, porque
 * o motor foca inteiro numa faixa estreita de dígitos em vez de competir
 * com o resto da tabela. Envelope = a bounding box do próprio cabeçalho
 * UNIDA com a de cada valor já encontrado pela 2ª análise nessa coluna
 * (collectColumnCandidates) — cobre tanto a posição do cabeçalho quanto o
 * espalhamento real dos números abaixo dele (que podem ficar deslocados do
 * cabeçalho pelo alinhamento da célula) — mais uma margem generosa, já que
 * o objetivo aqui é não deixar nenhum dígito de fora do recorte, não achar
 * a fronteira exata da coluna. Null no mesmo caso de detectClientesColumnValues:
 * cabeçalho "Clientes" não encontrado — a 3ª análise então nem roda, e o
 * fluxo segue só com a 1ª/2ª. */
export function findClientesColumnCropRange(blocks: Block[] | null): { x0: number; x1: number } | null {
  const lines = flattenLines(blocks);
  const header = findClientesColumnHeader(lines);
  if (!header) return null;
  let x0 = header.bbox.x0;
  let x1 = header.bbox.x1;
  for (const { word } of collectColumnCandidates(lines, header.xCenter)) {
    x0 = Math.min(x0, word.bbox.x0);
    x1 = Math.max(x1, word.bbox.x1);
  }
  const margin = Math.max(12, (x1 - x0) * 0.25);
  return { x0: Math.max(0, x0 - margin), x1: x1 + margin };
}

/** 3ª análise: casa cada linha devolvida pela releitura dedicada da coluna
 * recortada (recognizeColumnText, lib/ocr.ts — já roda com whitelist só de
 * dígitos) com a linha de colaborador correspondente da 1ª análise, pela
 * posição VERTICAL (Y) — o `rectangle` que recognizeColumnText passa pro
 * Tesseract recorta só a REGIÃO analisada, mas as bounding boxes devolvidas
 * continuam no sistema de coordenadas da imagem inteira, então dá pra
 * comparar direto com a linha "<matrícula>-<NOME>" já identificada, sem
 * nenhuma conversão de escala. Pra cada linha de colaborador, pega a linha
 * da releitura mais próxima em Y e só aceita o casamento quando a distância
 * é razoável (até 1,5x a altura da própria linha de dado) — evita grudar
 * numa linha de ruído distante quando a coluna recortada não achou nada pra
 * essa linha específica (nesse caso, o colaborador simplesmente não entra
 * no Map, igual a quando a 2ª análise não acha nada pra ele). */
export function matchColumnLinesToRows(columnLines: { text: string; yCenter: number }[], blocks: Block[] | null): Map<string, number> {
  const result = new Map<string, number>();
  if (columnLines.length === 0) return result;
  const lines = flattenLines(blocks);
  for (const line of lines) {
    const match = MATRICULA_NAME_LINE.exec(line.text.trim());
    if (!match) continue;
    const rowHeight = Math.max(line.bbox.y1 - line.bbox.y0, 1);
    const rowCenter = (line.bbox.y0 + line.bbox.y1) / 2;
    let best = columnLines[0];
    let bestDist = Math.abs(best.yCenter - rowCenter);
    for (const candidate of columnLines.slice(1)) {
      const dist = Math.abs(candidate.yCenter - rowCenter);
      if (dist < bestDist) {
        best = candidate;
        bestDist = dist;
      }
    }
    if (bestDist > rowHeight * 1.5) continue;
    const corrected = correctOcrDigitConfusions(best.text.trim());
    if (!COUNT_TOKEN.test(corrected)) continue;
    const value = parseInt(corrected.replace(/\D/g, ''), 10);
    if (Number.isNaN(value)) continue;
    result.set(normalizeMatricula(match[1]), value);
  }
  return result;
}
