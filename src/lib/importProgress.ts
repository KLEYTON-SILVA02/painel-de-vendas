import { useSyncExternalStore } from 'react';

// Estado da importação de vendas em andamento, fora do React (não um
// Context) — de propósito: a tela de Importar Vendas pode ser deixada
// (navegação para a Tela Inicial ou qualquer outra rota) no meio da
// gravação, o que desmonta o componente mas NÃO cancela a função async que
// está gravando os lotes (ver insertSalesInBatches em ImportarPage.tsx) —
// ela continua rodando e precisa continuar reportando progresso para quem
// quiser ler (a barrinha do topo), sem depender de onde na árvore React essa
// leitura acontece nem de o componente que a iniciou ainda existir.
export interface ImportProgressState {
  /** 'writing' = gravando os lotes de vendas (progresso real, inserted/total);
   * 'finalizing' = gravação terminada, atualizando os dados em cache antes
   * de sumir (pequeno trecho sem percentual próprio — fica em 100%). */
  phase: 'writing' | 'finalizing';
  inserted: number;
  total: number;
}

let state: ImportProgressState | null = null;
const listeners = new Set<() => void>();

export function setImportProgress(next: ImportProgressState | null): void {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): ImportProgressState | null {
  return state;
}

export function useImportProgress(): ImportProgressState | null {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Percentual de 0-100 pra exibir — 'finalizing' já é tratado como 100% (a
 * gravação em si terminou, só falta atualizar o cache antes de sumir). */
export function importProgressPct(p: ImportProgressState): number {
  if (p.phase === 'finalizing') return 100;
  return p.total > 0 ? Math.min(100, Math.round((p.inserted / p.total) * 100)) : 0;
}
