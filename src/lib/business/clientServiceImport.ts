// Importação "Vendas por Clientes" (UVC — Unidades Vendidas por Cliente).
//
// A planilha de origem (layout real confirmado pelo usuário, colunas A-R)
// só coincide com a planilha de vendas comum até a coluna I: A=Data,
// B=GO, C=GR, D=Filial, E=Filial Nome, F=PDV, G=Vendedor código, H=Vendedor
// Nome, I=Matrícula — a partir da coluna J ela é totalmente diferente, sem
// nenhum dado de produto: J=Valor Venda Líquida, K=Qtde Cliente Venda
// Líquida, L=TKM Venda, M-O=mesmos três campos pro "Recebimento", P-R=mesmos
// três pro "Total" (TKM = Ticket Médio = Valor ÷ Qtde Cliente, já vem pronto
// na planilha, não é usado aqui). O "atendimentos" certo é a coluna K —
// reconhecida pelo cabeçalho via um `overrides` dedicado em
// ClientServiceImportSection.tsx, reaproveitando `detectHeaderRow`/
// `autoMapColumns` de importMapping.ts (mesmo motor da importação de vendas
// comum) em vez de um parser próprio, mas sem depender da posição fixa
// antiga (coluna L, que nessa planilha é "TKM Venda" — uma razão, não uma
// contagem). Destino: `client_service_records` (migration 0103), nunca
// `sales`.
//
// Uma loja com atendimento em mais de um PDV no mesmo dia pode ter várias
// linhas pro mesmo vendedor (uma por PDV, coluna F) — o agrupamento abaixo
// soma todas (chave = matrícula+dia, nunca inclui o PDV), exatamente como
// pedido. O que salvamos é UM número por vendedor/dia, então este módulo
// agrega antes de chegar na tela de revisão — o ADM nunca revisa linha a
// linha, só vendedor/dia, igual ao DSM.
import type { ColumnMap } from './importMapping';
import type { DsmReviewRow } from './dsmImport';
import { dateFromCell, idFromCell, normalizeMatricula, parseNumeroBR } from './parsing';

export interface ClientServiceParsedRow {
  matricula: string;
  vendedorNome: string;
  dataISO: string;
  atendimentos: number;
}

/** Agrupa as linhas (uma por PDV, quando o colaborador atendeu em mais de
 * um no mesmo dia) em uma por matrícula+dia, somando a coluna de
 * quantidade de clientes. Linha sem data (subtotal/rodapé) ou sem
 * matrícula é ignorada — mesma regra "sem data = ignorar" do DSM, que
 * cobre os dois casos de uma vez sem precisar reconhecer texto
 * "Total"/"Subtotal". */
export function aggregateClientServiceRows(rows: unknown[][], rawRows: unknown[][], map: ColumnMap): ClientServiceParsedRow[] {
  const byKey = new Map<string, ClientServiceParsedRow>();
  rows.forEach((r, i) => {
    const rr = rawRows[i] ?? [];
    const dataStr = map.data >= 0 ? String(r[map.data] ?? '').trim() : '';
    const dataISO = map.data >= 0 ? dateFromCell(rr[map.data], dataStr) : null;
    if (!dataISO) return;
    const matricula = map.matricula >= 0 ? normalizeMatricula(idFromCell(rr[map.matricula], r[map.matricula])) : '';
    if (!matricula) return;
    const vendedorNome = map.vendedor >= 0 ? String(r[map.vendedor] ?? '').trim() : '';
    const qtd = map.qtd >= 0 ? parseNumeroBR(r[map.qtd]) : 0;
    const key = `${matricula}|${dataISO}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.atendimentos += qtd;
    } else {
      byKey.set(key, { matricula, vendedorNome, dataISO, atendimentos: qtd });
    }
  });
  return Array.from(byKey.values());
}

/** Monta as linhas da tela de revisão reaproveitando o mesmo formato/
 * componente do DSM (`DsmReviewRow`/`DsmReviewTable`) — "quantidade" aqui
 * é atendimentos, não conversões, mas a forma da tela (colaborador + data +
 * número editável) é idêntica. `quantidadeIncerta`/`fonte` nunca se aplicam
 * aqui (matrícula vem direto de uma coluna dedicada, sem OCR nem células
 * mescladas), sempre `false`/`undefined`. */
export function buildClientServiceReviewRows(
  parsed: ClientServiceParsedRow[],
  collaboratorByMatricula: Map<string, { id: string }>,
): DsmReviewRow[] {
  return parsed
    .sort((a, b) => (a.dataISO < b.dataISO ? 1 : a.dataISO > b.dataISO ? -1 : a.vendedorNome.localeCompare(b.vendedorNome, 'pt-BR')))
    .map((p, i) => ({
      key: `${i}-${p.matricula}-${p.dataISO}`,
      matriculaRaw: p.matricula,
      matricula: p.matricula,
      nomeFonte: p.vendedorNome,
      collaboratorId: collaboratorByMatricula.get(p.matricula)?.id ?? null,
      dataISO: p.dataISO,
      quantidade: Math.round(p.atendimentos),
      quantidadeIncerta: false,
    }));
}
