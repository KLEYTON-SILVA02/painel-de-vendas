import { Capacitor } from '@capacitor/core';

/** Entrega um arquivo gerado no aparelho (backup, PDF, imagem).
 * No navegador: baixa pelo link com `download`. No app Android (WebView) esse
 * link costuma não fazer nada; ali tenta antes a folha de compartilhar do
 * sistema (salvar no Drive, enviar por WhatsApp etc.) e só cai no link se o
 * compartilhamento não estiver disponível para esse tipo de arquivo. */
export async function saveBlobFile(blob: Blob, filename: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (Capacitor.isNativePlatform() && nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return 'shared';
    } catch (err) {
      // Pessoa fechou a folha de compartilhar: não é falha, e baixar de novo seria estranho.
      if (err instanceof Error && err.name === 'AbortError') return 'shared';
      // Outro erro: segue para o download pelo link.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
