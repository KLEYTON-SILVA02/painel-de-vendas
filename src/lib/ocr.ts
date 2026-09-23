// DSM Fase 3: leitura de texto em imagem (OCR) — roda inteiramente no
// navegador via Tesseract.js, sem IA e sem enviar a imagem pra nenhum
// servidor (mesmo princípio do OCR do Super Troco no sistema antigo). O
// motor e os dados de idioma em si são baixados de um CDN público na
// primeira vez que a função é usada — só arquivos estáticos do motor de
// leitura, nunca a imagem do relatório, que nunca sai do navegador do ADM.
import { createWorker } from 'tesseract.js';

/** Lê todo o texto de uma imagem em português. `onProgress` (0-100) só
 * cobre a fase de reconhecimento em si — a inicialização do motor (baixar
 * e carregar os arquivos do CDN, mais lenta na primeira vez) não é
 * refletida no progresso. */
export async function recognizeImageText(image: File | Blob, onProgress?: (pct: number) => void): Promise<string> {
  const worker = await createWorker('por', undefined, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') onProgress?.(Math.round(m.progress * 100));
    },
  });
  try {
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
