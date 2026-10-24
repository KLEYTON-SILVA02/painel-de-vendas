// DSM Fase 3: leitura de texto em imagem (OCR) — roda inteiramente no
// navegador via Tesseract.js, sem IA e sem enviar a imagem pra nenhum
// servidor (mesmo princípio do OCR do Super Troco no sistema antigo). O
// motor e os dados de idioma em si são baixados de um CDN público na
// primeira vez que a função é usada — só arquivos estáticos do motor de
// leitura, nunca a imagem do relatório, que nunca sai do navegador do ADM.
import { createWorker, type Block } from 'tesseract.js';

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
