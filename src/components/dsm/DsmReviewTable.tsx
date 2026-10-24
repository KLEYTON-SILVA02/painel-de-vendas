import type { DsmReviewRow } from '../../lib/business/dsmImport';
import type { Collaborator } from '../../lib/business/types';

// Shared editable review table for the DSM ("Desconto Só Meu") import flows
// — planilha (Fase 2) and imagem/OCR (Fase 3) both build a DsmReviewRow[]
// from their own parsing and hand it to this same table, so the ADM always
// gets the same "conferir e corrigir antes de salvar" screen regardless of
// which path brought the data in. Colaborador is always shown by the
// registered apelido (never the planilha/imagem text) and is read-only
// here — matrícula is the identifier, editing it would risk reassigning a
// row to the wrong person; data/quantidade are the two fields a misread
// realistically needs fixing.
interface DsmReviewTableProps {
  rows: DsmReviewRow[];
  collaboratorsById: Map<string, Collaborator>;
  onChangeRow: (key: string, patch: Partial<Pick<DsmReviewRow, 'dataISO' | 'quantidade'>>) => void;
  onRemoveRow: (key: string) => void;
}

export function DsmReviewTable({ rows, collaboratorsById, onChangeRow, onRemoveRow }: DsmReviewTableProps) {
  return (
    <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-xl border border-slate-800">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-slate-950">
          <tr className="text-left text-slate-400 border-b border-slate-800">
            <th className="py-1.5 px-3">Colaborador</th>
            <th className="py-1.5 px-3">Data</th>
            <th className="py-1.5 px-3 text-right">Clientes</th>
            <th className="py-1.5 px-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const collaborator = r.collaboratorId ? collaboratorsById.get(r.collaboratorId) : null;
            const label = collaborator ? collaborator.apelido || collaborator.nome : null;
            return (
              <tr key={r.key} className="border-b border-slate-900">
                <td className="py-1.5 px-3">
                  {label ? (
                    <span>
                      {label}
                      {r.fonte === 'nome' && (
                        <span
                          className="ml-1.5 text-[10px] rounded-full bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 align-middle"
                          title="Este colaborador não foi encontrado pelo padrão matrícula-nome — a segunda leitura achou o nome dele no texto. Confira a quantidade antes de salvar."
                        >
                          2ª leitura
                        </span>
                      )}
                      {r.fonte === 'coluna' && (
                        <span
                          className="ml-1.5 text-[10px] rounded-full bg-amber-500/20 text-amber-300 px-1.5 py-0.5 align-middle"
                          title="A leitura por linha não achou a quantidade desta pessoa — a 2ª análise localizou e confirmou esse valor pela posição da coluna 'Número de Clientes' na imagem. Confira antes de salvar."
                        >
                          2ª análise (coluna)
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-amber-400" title={r.matriculaRaw}>
                      Não cadastrado ({r.matriculaRaw || '—'})
                    </span>
                  )}
                </td>
                <td className="py-1.5 px-3">
                  <input
                    type="date"
                    value={r.dataISO ?? ''}
                    onChange={(e) => onChangeRow(r.key, { dataISO: e.target.value || null })}
                    className="input !py-1 !text-xs"
                  />
                </td>
                <td className="py-1.5 px-3 text-right">
                  <input
                    type="number"
                    min={0}
                    value={r.quantidade}
                    onChange={(e) => onChangeRow(r.key, { quantidade: Math.max(0, Number(e.target.value) || 0) })}
                    className={`input !py-1 !text-xs w-20 text-right ${r.quantidadeIncerta ? '!border-amber-500' : ''}`}
                    title={r.quantidadeIncerta ? 'Quantidade não reconhecida — este 0 é só um valor de preenchimento. Confira antes de salvar.' : undefined}
                  />
                  {r.quantidadeIncerta && (
                    <span className="block text-[10px] text-amber-400 mt-0.5" title="Quantidade não reconhecida no texto/planilha — confira antes de salvar">
                      não reconhecida
                    </span>
                  )}
                </td>
                <td className="py-1.5 px-3">
                  <button type="button" onClick={() => onRemoveRow(r.key)} className="text-slate-500 hover:text-rose-400" title="Remover linha">
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
