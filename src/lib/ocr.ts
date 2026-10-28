// DSM Fase 3: leitura de texto em imagem (OCR) — roda inteiramente no
// navegador via Tesseract.js, sem IA e sem enviar a imagem pra nenhum
// servidor (mesmo princípio do OCR do Super Troco no sistema antigo). O
// motor e os dados de idioma em si são baixados de um CDN público na
// primeira vez que a função é usada — só arquivos estáticos do motor de
// leitura, nunca a imagem do relatório, que nunca sai do navegador do ADM.
import { createWorker, PSM, type Block } from 'tesseract.js';

export interface OcrResult {
  /** Texto corrido (mesma 1ª leitura de sempre) — o que já alimenta a caixa
   * "Texto extraído" e a análise por linha (dsmImageParse.ts). */
  text: string;
  /** Blocos → parágrafos → linhas → palavras, cada um com bounding box em
   * pixels da imagem original — só vem preenchido porque recognizeImageText
   * pede esse output explicitamente (`{ blocks: true }`; Tesseract.js não
   * devolve isso por padrão). Base da 2ª análise (por coluna, ver
   * dsmImageColumns.ts): localizar onde cada valor fica na imagem, não só
   * em que ordem ele aparece no texto corrido. `null` só no caso raro do
   * motor não devolver bloco nenhum (imagem sem texto detectável). */
  blocks: Block[] | null;
}

/** Lê o texto de uma imagem em português — e, no mesmo passe de OCR (sem
 * rodar o motor de novo, que é a parte lenta), também devolve a posição de
 * cada palavra reconhecida. `onProgress` (0-100) só cobre a fase de
 * reconhecimento em si — a inicialização do motor (baixar e carregar os
 * arquivos do CDN, mais lenta na primeira vez) não é refletida no
 * progresso. */
export async function recognizeImageText(image: File | Blob, onProgress?: (pct: number) => void): Promise<OcrResult> {
  const worker = await createWorker('por', undefined, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') onProgress?.(Math.round(m.progress * 100));
    },
  });
  try {
    const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
    return { text: data.text, blocks: data.blocks };
  } finally {
    await worker.terminate();
  }
}

export interface ColumnOcrLine {
  /** Texto bruto de uma linha dessa releitura — como o motor roda com
   * whitelist só de dígitos (tessedit_char_whitelist abaixo), o esperado é
   * um número, mas o motor pode devolver outra coisa (ruído, linha vazia) —
   * quem usa o resultado decide o que fazer com isso (ver
   * matchColumnLinesToRows, dsmImageColumns.ts). */
  text: string;
  /** Centro vertical em pixels da imagem ORIGINAL, sem nenhuma conversão —
   * `rectangle` abaixo recorta só a REGIÃO que o motor analisa, mas as
   * bounding boxes devolvidas continuam no sistema de coordenadas da
   * imagem inteira (mesmo comportamento do Tesseract/Leptonica por trás:
   * SetRectangle restringe a análise, não "corta" a imagem de verdade). */
  yCenter: number;
}

/** 3ª análise do DSM por imagem (pedido explícito do usuário, 2026-10-28:
 * mesmo com a 2ª análise — detectClientesColumnValues, dsmImageColumns.ts —
 * alguns colaboradores continuavam sem a quantidade de clientes
 * reconhecida). Recorta — via a opção `rectangle` do Tesseract, sem
 * desenhar nada em canvas: o motor só restringe a região analisada, a
 * imagem original nunca é alterada — a faixa vertical inteira onde fica a
 * coluna "Número de Clientes" (já calculada à parte por
 * findClientesColumnCropRange, a partir do OCR de página inteira da 1ª/2ª
 * análise) e roda o motor de OCR DE NOVO, dedicado só a essa faixa estreita
 * — sem o resto da tabela (Loja/Data/Vendas/Valor) disputando atenção, e
 * com `tessedit_char_whitelist` restrito a dígitos (PSM.SINGLE_COLUMN: a
 * faixa recortada é, por definição, uma única coluna de números um embaixo
 * do outro) — bem mais fácil pro motor acertar do que no meio do texto
 * corrido da página inteira. Devolve uma entrada por linha que o motor
 * conseguiu separar nessa faixa — matchColumnLinesToRows (dsmImageColumns.ts)
 * é quem casa cada uma com a linha de colaborador certa, pela posição Y. */
export async function recognizeColumnText(
  image: File | Blob,
  columnXRange: { x0: number; x1: number },
  onProgress?: (pct: number) => void,
): Promise<ColumnOcrLine[]> {
  const bitmap = await createImageBitmap(image);
  const imageWidth = bitmap.width;
  const imageHeight = bitmap.height;
  bitmap.close();
  const left = Math.max(0, Math.round(columnXRange.x0));
  const width = Math.max(1, Math.min(imageWidth, Math.round(columnXRange.x1)) - left);

  const worker = await createWorker('por', undefined, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') onProgress?.(Math.round(m.progress * 100));
    },
  });
  try {
    await worker.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: PSM.SINGLE_COLUMN });
    const { data } = await worker.recognize(image, { rectangle: { left, top: 0, width, height: imageHeight } }, { blocks: true });
    const lines: ColumnOcrLine[] = [];
    for (const block of data.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const line of paragraph.lines ?? []) {
          lines.push({ text: line.text, yCenter: (line.bbox.y0 + line.bbox.y1) / 2 });
        }
      }
    }
    return lines;
  } finally {
    await worker.terminate();
  }
}
