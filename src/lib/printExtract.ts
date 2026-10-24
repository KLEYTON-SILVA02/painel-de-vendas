// Impressão de extrato de vendas — dois pontos de entrada:
// 1) "IMPRIMIR EXTRATO DO MÊS" (SidebarCalendarCard, Tela Inicial): totais
//    gerais do sistema por categoria (MER/MP/DERM/GEN/LEVMEL/CHIP) + detalhamento
//    dia a dia de cada uma, para o mês corrente.
// 2) Extrato por categoria (CategoryPage, "Lista de vendas"): a lista de vendas
//    já filtrada por colaborador/comissão selecionados na tela.
//
// O layout segue a referência de impressora térmica 80mm (compatível com A4)
// que o usuário forneceu: texto preto sobre fundo branco (sem cores do tema
// escuro do app — ficariam claras/ilegíveis no papel), uma regra @page com
// margem fixa e simétrica (reduzida, em vez de depender do padrão variável
// de cada navegador/driver — a causa da impressão saindo deslocada para um
// dos lados) para que a impressão sempre saia centralizada, e um aviso
// `.no-print` lembrando as opções do diálogo de impressão (Escala 100%,
// cabeçalho/rodapé e gráficos de fundo desligados) — isso continua não
// controlável via CSS/JS, só via aquele diálogo.
import { matchesSpecialList, type SpecialListItem } from './business/summary';
import type { Sale } from './business/types';
import { fmtUvc } from './business/uvc';
import { fmtDateBR, fmtMoney } from './format';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// `pageSize` vai direto no `@page` — "auto" (padrão, usado pelos extratos já
// existentes) deixa o tamanho a critério do navegador/driver da impressora;
// um valor fixo como "72mm 297mm" (extrato do dia por colaborador, formato
// vertical do papel térmico informado pelo usuário) fixa a largura real do
// rolo, em vez de depender do que o driver decidir sozinho.
function printStyles(pageSize: string): string {
  return `
  /* Margem fixa e igual nos 4 lados — garante que a área impressa fique
     centralizada no papel (nem mais para a direita, nem mais para a
     esquerda), em vez de ficar sujeita à margem padrão de cada navegador/
     impressora, que varia e é a causa do desalinhamento. Reduzida (6mm) em
     vez do padrão usual do navegador (~10mm), para sobrar mais espaço
     horizontal às colunas da tabela — importante em impressoras térmicas de
     80mm, onde essa sobra faz diferença real. */
  @page { size: ${pageSize}; margin: 6mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 6px; font-family: 'Courier New', monospace; color: #000; background: #fff; font-size: 12px; }
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
}

/** Abre uma aba nova (mesma origem, sem CSP) com o extrato pronto para
 * impressão e um botão manual de "Imprimir" — o navegador pode bloquear o
 * `window.print()` automático fora de um gesto do usuário, então é o clique
 * nesse botão (ou Ctrl+P) que dispara a impressão de fato. */
export function openPrintPreview(title: string, bodyHtml: string, pageSize: string = 'auto') {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(title)}</title>
<style>${printStyles(pageSize)}</style>
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

/** As mesmas 6 categorias fixas usadas em todo extrato impresso. MER
 * (Mercadoria Geral) é o total geral da loja — reflete toda venda, não só as
 * com `grupo === 'MER'` — mesma convenção já usada em CategoryPage
 * (`summaryFilter = catKey === 'MER' ? 'ALL' : catKey`). LEVMEL/CHIP não são
 * `sale.grupo`, são casadas por palavra-chave (special_lists), por isso usam
 * qtd (unidades) em vez de valor (R$), respeitando a métrica de unidades
 * dessas categorias. */
function categoryDefs(specialLists: { levmel: SpecialListItem[]; chip: SpecialListItem[] }): MonthExtractCategoryDef[] {
  return [
    { key: 'MER', isUnit: false, match: () => true },
    { key: 'MP', isUnit: false, match: (s) => s.grupo === 'MP' },
    { key: 'DERM', isUnit: false, match: (s) => s.grupo === 'DERM' },
    { key: 'GEN', isUnit: false, match: (s) => s.grupo === 'GEN' },
    { key: 'LEVMEL', isUnit: true, match: (s) => matchesSpecialList(s.produto, specialLists.levmel) },
    { key: 'CHIP', isUnit: true, match: (s) => matchesSpecialList(s.produto, specialLists.chip) },
  ];
}

/** Soma por categoria (+ detalhamento dia a dia) de todo `sale.dataISO` entre
 * `from` e `to` (inclusive, ambos YYYY-MM-DD) — motor comum de
 * `buildMonthExtract`/`buildDayExtract`, que só diferem no intervalo. */
function buildExtractForRange(
  sales: Sale[],
  from: string,
  to: string,
  specialLists: { levmel: SpecialListItem[]; chip: SpecialListItem[] },
  categoryLabels: Record<string, string>,
): MonthExtractCategory[] {
  return categoryDefs(specialLists).map(({ key, isUnit, match }) => {
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
  return buildExtractForRange(sales, from, to, specialLists, categoryLabels);
}

/** Mesmo motor de `buildMonthExtract`, só que para um único dia — cada
 * categoria sai com no máximo uma entrada em `days` (o próprio `dateISO`,
 * sempre igual a `total`), já que não há "dia a dia" para detalhar dentro de
 * um só dia. */
export function buildDayExtract(
  sales: Sale[],
  dateISO: string,
  specialLists: { levmel: SpecialListItem[]; chip: SpecialListItem[] },
  categoryLabels: Record<string, string>,
): MonthExtractCategory[] {
  return buildExtractForRange(sales, dateISO, dateISO, specialLists, categoryLabels);
}

export interface DayExtractByCollaboratorCategory {
  key: string;
  label: string;
  isUnit: boolean;
  total: number;
  rows: { matricula: string; nome: string; value: number }[]; // só quem vendeu nessa categoria, maior valor primeiro
}

/** Mesmas 6 categorias fixas de buildDayExtract, mas cada uma trazendo quem
 * vendeu naquela categoria naquele dia (em vez de só o total da loja) — uma
 * seção por categoria, com os colaboradores dela embaixo, formato vertical
 * de coluna única (nome + valor) em vez de uma tabela larga colaborador ×
 * categoria, pra caber no papel estreito de impressora térmica. Colaborador
 * sem venda naquela categoria nem aparece, pra não lotar o papel. */
export function buildDayExtractByCollaborator(
  sales: Sale[],
  collaborators: { matricula: string; nome: string; apelido?: string | null }[],
  dateISO: string,
  specialLists: { levmel: SpecialListItem[]; chip: SpecialListItem[] },
  categoryLabels: Record<string, string>,
): DayExtractByCollaboratorCategory[] {
  const defs = categoryDefs(specialLists);
  const nameByMatricula = new Map(collaborators.map((c) => [c.matricula, c.apelido || c.nome]));

  return defs.map(({ key, isUnit, match }) => {
    const byMatricula = new Map<string, number>();
    for (const s of sales) {
      if (s.dataISO !== dateISO || !match(s)) continue;
      const value = isUnit ? Number(s.qtd) || 0 : Number(s.valor) || 0;
      byMatricula.set(s.matricula, (byMatricula.get(s.matricula) ?? 0) + value);
    }
    const rows = Array.from(byMatricula.entries())
      .map(([matricula, value]) => ({ matricula, nome: nameByMatricula.get(matricula) ?? matricula, value }))
      .sort((a, b) => b.value - a.value || a.nome.localeCompare(b.nome, 'pt-BR'));
    const total = rows.reduce((a, r) => a + r.value, 0);
    return { key, label: categoryLabels[key] ?? key, isUnit, total, rows };
  });
}

export function buildDayExtractByCollaboratorHtml(
  categories: DayExtractByCollaboratorCategory[],
  dayLabel: string,
  storeName?: string | null,
): string {
  const fmt = (v: number, isUnit: boolean) => (isUnit ? `${v} un.` : fmtMoney(v));
  const sections = categories
    .map((c) => {
      const total = `<div class="cat-total">Total do dia: ${fmt(c.total, c.isUnit)}</div>`;
      const table = c.rows.length
        ? `<table><thead><tr><th>Colaborador</th><th style="text-align:right">${c.isUnit ? 'Qtd' : 'Valor'}</th></tr></thead><tbody>${c.rows
            .map((r) => `<tr><td>${escapeHtml(r.nome)}</td><td style="text-align:right">${fmt(r.value, c.isUnit)}</td></tr>`)
            .join('')}</tbody></table>`
        : `<div class="empty">Nenhuma venda nesta categoria.</div>`;
      return `<h2>${escapeHtml(c.label)}</h2>${total}${table}`;
    })
    .join('');
  return `<h1>Extrato do Dia por Colaborador${storeName ? ` — ${escapeHtml(storeName)}` : ''}</h1><div class="meta">Período: ${escapeHtml(dayLabel)}</div>${sections}`;
}

/** "Dias acumulados" mode for the per-collaborator extract (RankingPage): day
 * N's printed value becomes the running sum of every day up to and
 * including N, instead of just that day's own total — dia 1 stays as is,
 * dia 2 passa a ser dia1+dia2, dia 3 vira dia1+dia2+dia3, e assim até o
 * último dia com venda no mês. `total` is left untouched (it's already the
 * month's grand total, same value either way — it's only the per-day column
 * that changes meaning). Pure transform over `buildMonthExtract`'s own
 * output, so both print modes share the exact same category/day data. */
export function accumulateMonthExtract(categories: MonthExtractCategory[]): MonthExtractCategory[] {
  return categories.map((c) => {
    let running = 0;
    const days = c.days.map((d) => {
      running += d.value;
      return { dataISO: d.dataISO, value: running };
    });
    return { ...c, days };
  });
}

export function buildMonthExtractHtml(
  categories: MonthExtractCategory[],
  periodLabel: string,
  storeName?: string | null,
  collaboratorName?: string | null,
  // "Valor" (padrão, dias individuais) ou "Acumulado" quando os dados já
  // passaram por accumulateMonthExtract — só muda o cabeçalho da coluna,
  // pra deixar claro no papel o que cada número representa (sem isso, o
  // extrato acumulado pareceria ter vendas crescendo de forma suspeita, dia
  // após dia, em vez de ficar óbvio que é uma soma progressiva).
  valueColumnLabel: string = 'Valor',
  // Extrato de um único dia (buildDayExtract) não tem "dia a dia" pra
  // detalhar — a tabela ficaria com uma linha só, redundante com o próprio
  // total da categoria — então usa título/rótulo diferentes e pula a
  // tabela, mostrando só o total por categoria.
  heading: string = 'Extrato do Mês',
  totalLabel: string = 'Total do mês',
  showDayTable: boolean = true,
): string {
  const fmt = (v: number, isUnit: boolean) => (isUnit ? `${v} un.` : fmtMoney(v));
  const sections = categories.length
    ? categories
        .map((c) => {
          const total = `<div class="cat-total">${escapeHtml(totalLabel)}: ${fmt(c.total, c.isUnit)}</div>`;
          if (!showDayTable) {
            return `<h2>${escapeHtml(c.label)}</h2>${total}`;
          }
          const rows = c.days
            .map((d) => `<tr><td>${fmtDateBR(d.dataISO)}</td><td style="text-align:right">${fmt(d.value, c.isUnit)}</td></tr>`)
            .join('');
          const table = c.days.length
            ? `<table><thead><tr><th>Dia</th><th style="text-align:right">${escapeHtml(valueColumnLabel)}</th></tr></thead><tbody>${rows}</tbody></table>`
            : `<div class="empty">Nenhuma venda no período.</div>`;
          return `<h2>${escapeHtml(c.label)}</h2>${total}${table}`;
        })
        .join('')
    : `<div class="empty">Nenhuma categoria selecionada.</div>`;
  return `<h1>${escapeHtml(heading)}${storeName ? ` — ${escapeHtml(storeName)}` : ''}</h1><div class="meta">Período: ${escapeHtml(periodLabel)}${
    collaboratorName ? `<br />Colaborador: ${escapeHtml(collaboratorName)}` : ''
  }</div>${sections}`;
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
      const valorCell = showComissao ? '' : `<td style="text-align:right">${fmtMoney(s.valor)}</td>`;
      const comissaoCell = showComissao ? `<td style="text-align:right">${fmtMoney((s.valor * commissionPercent!) / 100)}</td>` : '';
      return `<tr>
        <td>${fmtDateBR(s.dataISO)}</td>
        <td>${escapeHtml(s.produto)}</td>
        <td style="text-align:right">${s.qtd}</td>
        ${valorCell}
        ${comissaoCell}
      </tr>`;
    })
    .join('');

  // Impressão voltada ao colaborador (extrato individual, já filtrado por
  // vendedor/comissão na tela) — só as colunas que interessam a quem recebe
  // o papel: Matrícula/Vendedor/Tipo são redundantes aqui (o extrato já é de
  // um vendedor e uma categoria só). Quando o extrato é o de comissão, o
  // Valor da venda em si não faz parte do que o colaborador precisa ver
  // impresso — só Data, Produto, Qtd e Comissão.
  const table = sales.length
    ? `<table>
        <thead><tr>
          <th>Data</th><th>Produto</th>
          <th style="text-align:right">Qtd</th>
          ${showComissao ? '' : '<th style="text-align:right">Valor</th>'}
          ${showComissao ? '<th style="text-align:right">Comissão</th>' : ''}
        </tr></thead>
        <tbody>
          ${rows}
          <tr class="total-row">
            <td colspan="2">Subtotal</td>
            <td style="text-align:right">${totalQtd}</td>
            ${showComissao ? '' : `<td style="text-align:right">${fmtMoney(totalValor)}</td>`}
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

export interface UvcExtractRow {
  matricula: string;
  nome: string;
  apelido: string;
  itens: number;
  atendimentos: number;
  uvc: number;
}

/** Extrato de UVC por colaborador (UvcPage.tsx, "Imprimir extrato") — uma
 * única tabela colaborador × itens vendidos/atendimentos/UVC, no mesmo
 * padrão visual (impressora térmica) dos outros extratos deste arquivo.
 * `rows`/`totals` vêm prontos de computeUvcSummary (uvc.ts) — já na mesma
 * ordem (por UVC, maior primeiro) que o pódio da tela usa, sem recalcular
 * nada aqui. UVC é formatado com fmtUvc (a mesma razão itens÷atendimentos,
 * nunca R$ de verdade, mesmo com o prefixo visual "R$" — ver uvc.ts). */
export function buildUvcExtractHtml(params: {
  periodLabel: string;
  storeName?: string | null;
  rows: UvcExtractRow[];
  totals: { itens: number; atendimentos: number; uvc: number | null };
}): string {
  const { periodLabel, storeName, rows, totals } = params;
  const table = rows.length
    ? `<table>
        <thead><tr>
          <th>Colaborador</th>
          <th style="text-align:right">Itens vendidos</th>
          <th style="text-align:right">Atendimentos</th>
          <th style="text-align:right">UVC</th>
        </tr></thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr>
            <td>${escapeHtml(r.apelido || r.nome)}</td>
            <td style="text-align:right">${r.itens.toLocaleString('pt-BR')}</td>
            <td style="text-align:right">${r.atendimentos.toLocaleString('pt-BR')}</td>
            <td style="text-align:right">${fmtUvc(r.uvc)}</td>
          </tr>`,
            )
            .join('')}
          <tr class="total-row">
            <td>Total do período</td>
            <td style="text-align:right">${totals.itens.toLocaleString('pt-BR')}</td>
            <td style="text-align:right">${totals.atendimentos.toLocaleString('pt-BR')}</td>
            <td style="text-align:right">${fmtUvc(totals.uvc)}</td>
          </tr>
        </tbody>
      </table>`
    : `<div class="empty">Nenhum item vendido nem atendimento importado no período.</div>`;

  return `<h1>Extrato de UVC${storeName ? ` — ${escapeHtml(storeName)}` : ''}</h1>
    <div class="meta">Período: ${escapeHtml(periodLabel)}</div>
    ${table}`;
}
