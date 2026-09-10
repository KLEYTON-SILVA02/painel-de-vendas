// Impressão de extrato de vendas — dois pontos de entrada:
// 1) "IMPRIMIR EXTRATO DO MÊS" (SidebarCalendarCard, Tela Inicial): totais
//    gerais do sistema por categoria (MER/MP/DERM/GEN/LEVMEL/CHIP) + detalhamento
//    dia a dia de cada uma, para o mês corrente.
// 2) Extrato por categoria (CategoryPage, "Lista de vendas"): a lista de vendas
//    já filtrada por colaborador/comissão selecionados na tela.
//
// O layout segue a referência de impressora térmica 80mm (compatível com A4)
// que o usuário forneceu: texto preto sobre fundo branco (sem cores do tema
// escuro do app — ficariam claras/ilegíveis no papel), sem sobrescrever a
// margem do navegador (o próprio driver da impressora já reserva ~3mm), e um
// aviso `.no-print` lembrando as opções do diálogo de impressão (Escala 100%,
// cabeçalho/rodapé e gráficos de fundo desligados) — nada disso é controlável
// via CSS/JS, só via aquele diálogo.
import { matchesSpecialList, type SpecialListItem } from './business/summary';
import type { Sale } from './business/types';
import { fmtDateBR, fmtMoney } from './format';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const PRINT_STYLES = `
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; font-family: 'Courier New', monospace; color: #000; background: #fff; font-size: 12px; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  h2 { font-size: 13px; margin: 18px 0 4px; border-bottom: 1.5px solid #000; padding-bottom: 2px; }
  .meta { font-size: 11px; color: #222; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { text-align: left; padding: 2px 6px 2px 0; border-bottom: 1px solid #555; }
  th { border-bottom: 1.5px solid #000; }
  .total-row td { border-top: 1.5px solid #000; font-weight: bold; }
  .cat-total { font-weight: bold; font-size: 13px; margin: 2px 0 8px; }
  .empty { color: #444; font-size: 11px; margin-bottom: 8px; }
  .no-print { background: #fffbe6; border: 1.5px solid #000; padding: 10px 14px; margin-bottom: 16px; font-family: sans-serif; font-size: 12px; }
  .no-print button { margin-top: 8px; padding: 6px 14px; font-weight: bold; border: 1.5px solid #000; background: #000; color: #fff; border-radius: 4px; cursor: pointer; }
  @media print { .no-print { display: none; } }
`;

/** Abre uma aba nova (mesma origem, sem CSP) com o extrato pronto para
 * impressão e um botão manual de "Imprimir" — o navegador pode bloquear o
 * `window.print()` automático fora de um gesto do usuário, então é o clique
 * nesse botão (ou Ctrl+P) que dispara a impressão de fato. */
export function openPrintPreview(title: string, bodyHtml: string) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(title)}</title>
<style>${PRINT_STYLES}</style>
</head>
<body>
  <div class="no-print">
    <strong>Antes de imprimir:</strong> deixe a Margem como "Padrão" e a Escala em 100% (não use "Ajustar à página"); desligue Cabeçalho/rodapé e Gráficos de fundo nas opções de impressão do navegador. Não é necessário marcar "Preto e branco".
    <div><button onclick="window.print()">🖨️ Imprimir</button></div>
  </div>
  ${bodyHtml}
</body>
</html>`);
  win.document.close();
}

interface MonthExtractCategoryDef {
  key: string;
  isUnit: boolean;
  match: (s: Sale) => boolean;
}

export interface MonthExtractCategory {
  key: string;
  label: string;
  isUnit: boolean;
  total: number;
  days: { dataISO: string; value: number }[];
}

/** Totais gerais + detalhamento dia a dia do mês, para cada uma das 6
 * categorias fixas. MER (Mercadoria Geral) é o total geral da loja — reflete
 * toda venda, não só as com `grupo === 'MER'` — mesma convenção já usada em
 * CategoryPage (`summaryFilter = catKey === 'MER' ? 'ALL' : catKey`).
 * LEVMEL/CHIP não são `sale.grupo`, são casadas por palavra-chave (special_lists),
 * por isso usam qtd (unidades) em vez de valor (R$), respeitando a métrica de
 * unidades dessas categorias. */
export function buildMonthExtract(
  sales: Sale[],
  year: number,
  month: number, // 1-indexed
  specialLists: { levmel: SpecialListItem[]; chip: SpecialListItem[] },
  categoryLabels: Record<string, string>,
): MonthExtractCategory[] {
  const mm = String(month).padStart(2, '0');
  const from = `${year}-${mm}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;

  const defs: MonthExtractCategoryDef[] = [
    { key: 'MER', isUnit: false, match: () => true },
    { key: 'MP', isUnit: false, match: (s) => s.grupo === 'MP' },
    { key: 'DERM', isUnit: false, match: (s) => s.grupo === 'DERM' },
    { key: 'GEN', isUnit: false, match: (s) => s.grupo === 'GEN' },
    { key: 'LEVMEL', isUnit: true, match: (s) => matchesSpecialList(s.produto, specialLists.levmel) },
    { key: 'CHIP', isUnit: true, match: (s) => matchesSpecialList(s.produto, specialLists.chip) },
  ];

  return defs.map(({ key, isUnit, match }) => {
    const byDay = new Map<string, number>();
    let total = 0;
    for (const s of sales) {
      if (!s.dataISO || s.dataISO < from || s.dataISO > to) continue;
      if (!match(s)) continue;
      const value = isUnit ? Number(s.qtd) || 0 : Number(s.valor) || 0;
      byDay.set(s.dataISO, (byDay.get(s.dataISO) ?? 0) + value);
      total += value;
    }
    const days = Array.from(byDay.entries())
      .map(([dataISO, value]) => ({ dataISO, value }))
      .sort((a, b) => a.dataISO.localeCompare(b.dataISO));
    return { key, label: categoryLabels[key] ?? key, isUnit, total, days };
  });
}

export function buildMonthExtractHtml(categories: MonthExtractCategory[], periodLabel: string, storeName?: string | null): string {
  const fmt = (v: number, isUnit: boolean) => (isUnit ? `${v} un.` : fmtMoney(v));
  const sections = categories
    .map((c) => {
      const rows = c.days
        .map((d) => `<tr><td>${fmtDateBR(d.dataISO)}</td><td style="text-align:right">${fmt(d.value, c.isUnit)}</td></tr>`)
        .join('');
      const table = c.days.length
        ? `<table><thead><tr><th>Dia</th><th style="text-align:right">Valor</th></tr></thead><tbody>${rows}</tbody></table>`
        : `<div class="empty">Nenhuma venda no período.</div>`;
      return `<h2>${escapeHtml(c.label)}</h2><div class="cat-total">Total do mês: ${fmt(c.total, c.isUnit)}</div>${table}`;
    })
    .join('');
  return `<h1>Extrato do Mês${storeName ? ` — ${escapeHtml(storeName)}` : ''}</h1><div class="meta">Período: ${escapeHtml(periodLabel)}</div>${sections}`;
}

/** Extrato de vendas de uma categoria específica, já filtrado por colaborador
 * e/ou comissão selecionados na tela ("Lista de vendas" de CategoryPage) — o
 * mesmo recorte que está na tela, mas sem o corte de paginação (a impressão
 * é sempre do total do período filtrado, não só da página atual). */
export function buildCategoryExtractHtml(params: {
  categoryLabel: string;
  periodLabel: string;
  sellerName: string | null;
  sales: Sale[];
  commissionPercent?: number | null;
  storeName?: string | null;
}): string {
  const { categoryLabel, periodLabel, sellerName, sales, commissionPercent, storeName } = params;
  const totalQtd = sales.reduce((a, s) => a + (Number(s.qtd) || 0), 0);
  const totalValor = sales.reduce((a, s) => a + (Number(s.valor) || 0), 0);
  const showComissao = commissionPercent != null;
  const totalComissao = showComissao ? (totalValor * commissionPercent!) / 100 : 0;

  const rows = sales
    .map((s) => {
      const comissaoCell = showComissao ? `<td style="text-align:right">${fmtMoney((s.valor * commissionPercent!) / 100)}</td>` : '';
      return `<tr>
        <td>${fmtDateBR(s.dataISO)}</td>
        <td>${escapeHtml(s.produto)}</td>
        <td style="text-align:right">${s.qtd}</td>
        <td style="text-align:right">${fmtMoney(s.valor)}</td>
        ${comissaoCell}
      </tr>`;
    })
    .join('');

  // Impressão voltada ao colaborador (extrato individual, já filtrado por
  // vendedor/comissão na tela) — só as 5 colunas que interessam a quem
  // recebe o papel: Matrícula/Vendedor/Tipo são redundantes aqui (o extrato
  // já é de um vendedor e uma categoria só).
  const table = sales.length
    ? `<table>
        <thead><tr>
          <th>Data</th><th>Produto</th>
          <th style="text-align:right">Qtd</th><th style="text-align:right">Valor</th>
          ${showComissao ? '<th style="text-align:right">Comissão</th>' : ''}
        </tr></thead>
        <tbody>
          ${rows}
          <tr class="total-row">
            <td colspan="2">Subtotal</td>
            <td style="text-align:right">${totalQtd}</td>
            <td style="text-align:right">${fmtMoney(totalValor)}</td>
            ${showComissao ? `<td style="text-align:right">${fmtMoney(totalComissao)}</td>` : ''}
          </tr>
        </tbody>
      </table>`
    : `<div class="empty">Nenhuma venda no período.</div>`;

  return `<h1>Extrato de Vendas — ${escapeHtml(categoryLabel)}${storeName ? ` — ${escapeHtml(storeName)}` : ''}</h1>
    <div class="meta">
      Período: ${escapeHtml(periodLabel)}<br />
      Colaborador: ${escapeHtml(sellerName ?? 'Todos')}${showComissao ? `<br />Comissão: ${commissionPercent}%` : ''}
    </div>
    ${table}`;
}
