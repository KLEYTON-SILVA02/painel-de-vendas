// DSM (Desconto Só Meu) — Fase 3, 2ª análise: em vez de ler o texto corrido
// de cima a baixo (dsmImageParse.ts, 1ª análise — por LINHA, pegando o
// último token com cara de inteiro), esta segunda passada localiza a
// coluna "Número de Clientes" pela sua POSIÇÃO horizontal na imagem (os
// bounding boxes que o Tesseract devolve quando lib/ocr.ts pede
// `{ blocks: true }`) e lê, pra cada linha de colaborador, especificamente
// o token que cai naquela coluna — ignorando Loja/Data/Número de Vendas/
// Valor das Vendas/Número de Clientes(%) e qualquer outro texto da imagem
// (cabeçalhos inclusive), por nunca olhar pra eles.
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
// cortada, fonte não reconhecida, etc.) devolve um Map vazio, e o fluxo
// inteiro continua funcionando com a 1ª análise sozinha, exatamente como
// antes desta função existir.
import type { Block } from 'tesseract.js';
import { COUNT_TOKEN, MATRICULA_NAME_LINE } from './dsmImageParse';
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
  words: OcrWord[];
}

function flattenLines(blocks: Block[] | null): OcrLine[] {
  const lines: OcrLine[] = [];
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        lines.push({ text: line.text, words: line.words.map((w) => ({ text: w.text, bbox: w.bbox })) });
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

/** Acha o centro X (pixels da imagem) do cabeçalho "Número de Clientes" —
 * nunca o de "Número de Clientes(%)", que vem logo depois no mesmo
 * relatório (ver dsmImageParse.ts). Primeiro descarta candidatos com um
 * "%" em palavras vizinhas (mesma linha, até 2 palavras de distância —
 * cobre tanto "Clientes(%)" quanto "Clientes" seguido de "(%)" numa
 * palavra separada); entre o que sobrar, fica com o mais acima na imagem
 * (cabeçalho sempre fica acima das linhas de dado) e, empatado nisso, o
 * mais à esquerda — a coluna de contagem sempre vem antes da de
 * percentual nesse relatório. Null quando a imagem não tem nenhuma palavra
 * reconhecida como "clientes" — a 2ª análise então não encontra nada pra
 * confirmar, e o fluxo segue só com a 1ª. */
function findClientesColumnXCenter(lines: OcrLine[]): number | null {
  const candidates: { xCenter: number; y: number; hasPercent: boolean }[] = [];
  for (const line of lines) {
    for (let i = 0; i < line.words.length; i++) {
      const word = line.words[i];
      if (!CLIENT_WORD.test(word.text)) continue;
      const neighborhood = line.words
        .slice(Math.max(0, i - 1), i + 3)
        .map((w) => w.text)
        .join(' ');
      candidates.push({ xCenter: xCenter(word.bbox), y: word.bbox.y0, hasPercent: PERCENT_CHAR.test(neighborhood) });
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
  // ter 2ª análise nenhuma do que confirmar o valor errado.
  if (candidates.length === 1) return candidates[0].hasPercent ? null : candidates[0].xCenter;
  // 2+ candidatos: não filtra mais por "%" aqui — a janela de vizinhança
  // acima marca os DOIS como "tem % por perto" sempre que "Clientes" e
  // "Clientes(%)" ficam lado a lado (o caso normal do relatório), então
  // esse filtro descartaria justamente o cenário que essa análise existe
  // pra resolver. Em vez disso, usa a ordem: a coluna de contagem sempre
  // vem antes (mais à esquerda) da de percentual nesse relatório — mesmo
  // critério já documentado acima.
  candidates.sort((a, b) => a.y - b.y || a.xCenter - b.xCenter);
  return candidates[0].xCenter;
}

/** 2ª análise (por coluna/posição): devolve matrícula → "Número de
 * Clientes" lido na coluna identificada, uma entrada por linha de
 * colaborador reconhecida (mesmo padrão `<matrícula>-<NOME>` da 1ª
 * análise). Para cada linha, exclui o próprio token da matrícula dos
 * candidatos (senão ele mesmo — um inteiro "simples" — podia ser lido como
 * se fosse a contagem de clientes) e escolhe, entre os tokens com cara de
 * contagem inteira que sobraram, o mais próximo em X do cabeçalho
 * "Clientes" encontrado. */
export function detectClientesColumnValues(blocks: Block[] | null): Map<string, number> {
  const result = new Map<string, number>();
  const lines = flattenLines(blocks);
  const headerXCenter = findClientesColumnXCenter(lines);
  if (headerXCenter === null) return result;

  for (const line of lines) {
    const match = MATRICULA_NAME_LINE.exec(line.text.trim());
    if (!match) continue;
    const matriculaDigits = match[1];
    const candidates = line.words.filter((w) => COUNT_TOKEN.test(w.text) && w.text.replace(/\D/g, '') !== matriculaDigits);
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
    const value = parseInt(best.text.replace(/\D/g, ''), 10);
    if (Number.isNaN(value)) continue;
    result.set(normalizeMatricula(matriculaDigits), value);
  }
  return result;
}
