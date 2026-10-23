// Importação "Vendas por Clientes" (UVC — Unidades Vendidas por Cliente).
//
// A planilha de origem usa o MESMO layout fixo (A=Data, G=Vendedor código,
// H=Vendedor Nome, I=Matrícula, J=Código do Produto, K=Descrição do
// Produto, L=Quantidade Vendida, M=Valor do Produto) já reconhecido pela
// importação de vendas comum (ver FIXED_COLS/FIELD_NAMES em
// importMapping.ts) — por isso reaproveita `detectHeaderRow`/
// `autoMapColumns` dali sem nenhuma mudança, em vez de um parser próprio.
// A diferença não é o layout: é que, nesta planilha específica, a coluna L
// já representa quantos clientes aquele vendedor atendeu naquela linha
// (confirmado pelo usuário), não unidades de produto — por isso o destino
// é outra tabela (`client_service_records`, migration 0103), nunca `sales`.
//
// Cada linha da planilha é um item vendido; o que salvamos é UM número por
// vendedor/dia (atendimentos = soma de L daquele vendedor naquele dia),
// então este módulo agrega antes de chegar na tela de revisão — o ADM
// nunca revisa linha de produto por linha de produto, só vendedor/dia,
// igual ao DSM.
import type { ColumnMap } from './importMapping';
import type { DsmReviewRow } from './dsmImport';
import { dateFromCell, idFromCell, normalizeMatricula, parseNumeroBR } from './parsing';

export interface ClientServiceParsedRow {
  matricula: string;
  vendedorNome: string;
  dataISO: string;
  atendimentos: number;
}

/** Agrupa as linhas (uma por produto vendido) em uma por matrícula+dia,
 * somando a coluna de quantidade. Linha sem data (subtotal/rodapé) ou sem
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
