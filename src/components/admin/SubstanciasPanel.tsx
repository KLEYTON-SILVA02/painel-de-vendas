import { useMemo, type ReactNode } from 'react';
import { HelpTip } from '../HelpTip';
import { normalize } from '../../lib/business/normalize';
import { SimpleSheetImportPanel } from './SimpleSheetImportPanel';

export interface SubstanciaItem {
  id: string;
  nome: string;
}

const toggleClass = (ativo: boolean) =>
  `w-full min-w-0 truncate rounded-md border px-2 py-1.5 text-xs font-medium ${
    ativo ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-slate-700 text-slate-300'
  }`;

/** Barra única da aba Substâncias: título + última varredura, adicionar uma, colar
 * lista e importar planilha (estes dois abrem uma área logo abaixo, uma por vez).
 * Antes eram 3 cards separados, ocupando bem mais altura. */
export function SubstanciasBarra({
  nome,
  setNome,
  onAdd,
  painel,
  setPainel,
  bulkText,
  setBulkText,
  onBulkAdd,
  bulkPending,
  onImport,
  ultimaVarredura,
  erros,
}: {
  nome: string;
  setNome: (v: string) => void;
  onAdd: () => void;
  painel: 'lista' | 'planilha' | null;
  setPainel: (p: 'lista' | 'planilha' | null) => void;
  bulkText: string;
  setBulkText: (v: string) => void;
  onBulkAdd: () => void;
  bulkPending: boolean;
  onImport: (rows: string[][]) => Promise<{ count: number; skipped: number }>;
  ultimaVarredura: string;
  erros?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 flex flex-col gap-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="font-semibold text-sm">Substâncias — Genéricos</h3>
        <HelpTip
          helpKey="produtos.substancias"
          fallback='Cadastre nomes de substâncias (ex.: Dipirona, Losartana). "Aplicar / Escanear" procura, entre os produtos já vendidos, os que contêm alguma delas no nome e ainda não são Genéricos: eles entram no Catálogo (aba "Via Substância") e as vendas já importadas são reclassificadas. A varredura também roda sozinha 5x por dia (07h, 10h, 15h, 18h, 22h).'
        />
        <span className="text-xs text-cyan-400 sm:ml-auto">{ultimaVarredura}</span>
      </div>
      <p className="text-xs text-slate-500">
        Produtos vendidos com uma dessas substâncias no nome vão para Genéricos. Roda sozinho 5x por dia.
      </p>

      <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] lg:grid-cols-[2fr_1fr_1fr_1fr] gap-2">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Adicionar substância (ex: Dipirona)"
          className="input col-span-3 lg:col-span-1"
          onKeyDown={(e) => e.key === 'Enter' && onAdd()}
        />
        <button onClick={onAdd} className="w-full min-w-0 truncate rounded-md bg-amber-500 text-slate-950 px-2 py-1.5 text-xs font-medium">
          + Adicionar
        </button>
        <button onClick={() => setPainel(painel === 'lista' ? null : 'lista')} className={toggleClass(painel === 'lista')}>
          📋 <span className="sm:hidden">Lista</span>
          <span className="hidden sm:inline">Colar lista</span>
        </button>
        <button onClick={() => setPainel(painel === 'planilha' ? null : 'planilha')} className={toggleClass(painel === 'planilha')}>
          📥 <span className="sm:hidden">Planilha</span>
          <span className="hidden sm:inline">Importar planilha</span>
        </button>
      </div>
      {erros}

      {painel === 'lista' && (
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-2 items-stretch">
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={3}
            placeholder={'Uma substância por linha:\nDipirona\nParacetamol'}
            className="input w-full"
          />
          <button
            onClick={onBulkAdd}
            disabled={!bulkText.trim() || bulkPending}
            className="w-full rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-50"
          >
            {bulkPending ? 'Adicionando…' : '+ Adicionar lista'}
          </button>
        </div>
      )}

      {painel === 'planilha' && (
        <SimpleSheetImportPanel embedded title="Importar planilha de substâncias" columns={['Nome da substância']} onConfirm={onImport} />
      )}
    </div>
  );
}

const letraDe = (n: string) => (normalize(n)[0] ?? '').toUpperCase();

/** Lista em ordem alfabética repartida em 3 colunas seguidas de largura igual
 * (A→… na 1ª, …→Z na 3ª), cada uma uma lista vertical — mesmo desenho da aba
 * Palavras-chave. No celular vira 1 coluna. */
export function SubstanciasColunas({
  substancias,
  selectMode,
  selected,
  onToggle,
  onDelete,
}: {
  substancias: SubstanciaItem[];
  selectMode: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const colunas = useMemo(() => {
    const ordenadas = substancias.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
    const tamanho = Math.max(1, Math.ceil(ordenadas.length / 3));
    return [0, 1, 2].map((i) => ordenadas.slice(i * tamanho, (i + 1) * tamanho));
  }, [substancias]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
      {colunas.map((coluna, i) => (
        <div key={i} className="rounded-xl border border-slate-800 bg-slate-950/40 p-2.5 flex flex-col gap-2 min-w-0">
          <div className="text-[11px] font-semibold tracking-wide text-slate-400 px-1">
            {coluna.length === 0
              ? '—'
              : letraDe(coluna[0].nome) === letraDe(coluna[coluna.length - 1].nome)
                ? letraDe(coluna[0].nome)
                : `${letraDe(coluna[0].nome)} – ${letraDe(coluna[coluna.length - 1].nome)}`}
            <span className="font-normal text-slate-500"> · {coluna.length}</span>
          </div>
          <ul className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto pr-1">
            {coluna.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-800/60 px-2.5 py-1 text-xs">
                <label className="flex items-center gap-2 min-w-0">
                  {selectMode && <input type="checkbox" checked={selected.has(s.id)} onChange={() => onToggle(s.id)} />}
                  <span className="truncate" title={s.nome}>
                    {s.nome}
                  </span>
                </label>
                {!selectMode && (
                  <button onClick={() => onDelete(s.id)} aria-label={`Excluir ${s.nome}`} className="text-slate-500 hover:text-rose-400 shrink-0">
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
