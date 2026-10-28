// Distância de edição clássica (Levenshtein: inserção/remoção/substituição,
// custo 1 cada) entre duas strings — base de toda correspondência tolerante
// a ruído de OCR usada no DSM por imagem (dsmImageParse.ts: casar o nome do
// colaborador mesmo com uma letra trocada/perdida; dsmImageColumns.ts: achar
// o cabeçalho "Número de Clientes" mesmo quando o OCR lê a palavra com
// ruído) — pedido explícito do usuário (2026-10-28): "o vendedor sendo
// identificado com o nome completo [na imagem]... não está sendo reconhecido
// pelo sistema", porque o casamento de nome exigia substring idêntico, e uma
// única letra trocada pelo OCR (ex.: "CRHYSTINA" em vez de "CHRYSTINA")
// derrubava o reconhecimento inteiro mesmo com o nome inteiro visível.
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}
