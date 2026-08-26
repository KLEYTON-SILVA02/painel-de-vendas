import { fmtDateBR, fmtMoney } from './format';

// Ported from legacy/index-original.html (copyRankingToClipboard).
export function formatRankingText(
  ranking: { apelido: string; nome: string; valor: number; itens: number }[],
  catLabel: string,
  fromDate: string,
  toDate: string,
  storeName?: string,
): string {
  const medals = ['🥇', '🥈', '🥉'];
  let txt = `🏆 *RANKING DE VENDAS* 🏆\n`;
  txt += `📂 ${catLabel}\n`;
  txt += `📅 ${fmtDateBR(fromDate)} a ${fmtDateBR(toDate)}\n\n`;
  if (ranking.length === 0) {
    txt += 'Sem vendas registradas no período.';
  } else {
    ranking.forEach((r, i) => {
      const medal = medals[i] || `${i + 1}º`;
      txt += `${medal} ${r.apelido || r.nome} — ${fmtMoney(r.valor)} (${r.itens} itens)\n`;
    });
  }
  txt += `\n_Gerado pelo Gestão de Vendas${storeName ? ' — ' + storeName : ''}_`;
  return txt;
}

// Ported from legacy/index-original.html (tryCopyText / tryCopyFallback):
// try the modern Clipboard API, fall back to a hidden textarea + execCommand
// for restricted contexts, resolving/rejecting so the caller can show
// success/failure feedback instead of the legacy's toast+modal.
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy fallback
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
