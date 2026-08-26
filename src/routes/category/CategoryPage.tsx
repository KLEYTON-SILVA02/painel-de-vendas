import { useState } from 'react';
import { PodiumStaircase } from '../../components/ranking/PodiumStaircase';
import { DateRangeControls } from '../../components/DateRangeControls';
import type { CategoryKey } from '../../lib/business/classification';
import { getGoal, getSuperMeta } from '../../lib/business/goals';
import { computeSummary, computeVendorExtract } from '../../lib/business/summary';
import type { SummaryRow } from '../../lib/business/types';
import { fmtDateBR, fmtMoney } from '../../lib/format';
import { useCollaborators, useGoals, useSales, useSpecialLists, useStoreSettings } from '../../lib/queries';
import { useDateRange } from '../DateRangeContext';

export type PageCategoryKey = CategoryKey | 'LEVMEL' | 'CHIP';

const CATEGORY_META: Record<PageCategoryKey, { titulo: string; cor: string }> = {
  DERM: { titulo: '🩹 Dermocosméticos', cor: '#ff3df0' },
  GEN: { titulo: '💊 Genérico & Similar', cor: '#14ff00' },
  MP: { titulo: '🏷️ Marcas Exclusivas', cor: '#a82bff' },
  MER: { titulo: '📦 Mercadoria Geral', cor: '#ff6a00' },
  LEVMEL: { titulo: '🍯 Levmel', cor: '#ffb700' },
  CHIP: { titulo: '🔴 Chip', cor: '#00e5ff' },
};

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="text-[11px] text-slate-400 mb-1">{label}</div>
      <div className="text-sm font-mono font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

export function CategoryPage({ catKey }: { catKey: PageCategoryKey }) {
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: goals } = useGoals();
  const { data: storeSettings } = useStoreSettings();
  const { data: specialLists } = useSpecialLists();
  const { dashFrom, dashTo } = useDateRange();
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [extractMatricula, setExtractMatricula] = useState<string | null>(null);

  if (!collaborators || !sales || !goals || !storeSettings || !specialLists) {
    return <div className="text-sm text-slate-500 p-6">Carregando…</div>;
  }

  const info = CATEGORY_META[catKey];
  const isUnit = catKey === 'LEVMEL' || catKey === 'CHIP';
  const modoDia = dashFrom === dashTo;
  const mode = modoDia ? 'dia' : 'mes';

  const ranking = computeSummary(sales, collaborators, dashFrom, dashTo, catKey, specialLists);
  const totalValor = ranking.reduce((a, r) => a + r.valor, 0);
  const totalItens = ranking.reduce((a, r) => a + r.itens, 0);

  let statCards: { label: string; value: string; color: string }[];
  if (!isUnit) {
    const goal = goals[catKey];
    const isUnidadeMetric = goal?.metrica === 'unidade';
    const valorRef = isUnidadeMetric ? totalItens : totalValor;
    const fmtMetrica = (v: number) => (isUnidadeMetric ? `${Math.round(v)} un.` : fmtMoney(v));
    const metaGeral = getGoal(goal, mode, sales, collaborators);
    const metaSuper = getSuperMeta(goal, mode, sales, collaborators);
    const atingiuMeta = metaGeral > 0 && valorRef >= metaGeral;
    const pctMeta = metaGeral > 0 ? Math.min(999, (valorRef / metaGeral) * 100) : 0;
    const pctSuper = metaSuper > 0 ? Math.min(999, (valorRef / metaSuper) * 100) : null;
    let faltaLabel: string;
    let faltaValor: number;
    if (atingiuMeta && metaSuper > metaGeral) {
      faltaLabel = 'Falta p/ Super Meta';
      faltaValor = Math.max(0, metaSuper - valorRef);
    } else {
      faltaLabel = 'Falta p/ Meta';
      faltaValor = Math.max(0, metaGeral - valorRef);
    }
    statCards = [
      { label: 'Total vendido', value: fmtMoney(totalValor), color: '#00f0ff' },
      { label: 'Itens vendidos', value: `${totalItens} un.`, color: '#a82bff' },
      { label: (atingiuMeta ? 'MG OK · ' : 'MG · ') + faltaLabel, value: fmtMetrica(faltaValor), color: faltaValor <= 0 ? '#14ff00' : '#ff6a00' },
      { label: 'Atingim. Meta', value: `${pctMeta.toFixed(0)}%`, color: '#00f0ff' },
      { label: 'Atingim. Super Meta', value: pctSuper !== null ? `${pctSuper.toFixed(0)}%` : '—', color: '#ffd700' },
      { label: `Meta Geral (${isUnidadeMetric ? 'un.' : 'R$'})`, value: fmtMetrica(metaGeral), color: '#ffd700' },
    ];
  } else {
    statCards = [
      { label: 'Itens vendidos', value: `${totalItens} un.`, color: '#00f0ff' },
      { label: 'Vendedores ativos', value: String(ranking.filter((r) => r.itens > 0).length), color: '#a82bff' },
    ];
  }

  const rankingList = ranking.filter((r) => (isUnit ? r.itens > 0 : r.valor > 0));
  const modeloRanking = storeSettings.modelo_ranking as 'escadinha' | 'lista';

  const categorySales = !isUnit
    ? sales
        .filter((s) => s.grupo === catKey && (!s.dataISO || (s.dataISO >= dashFrom && s.dataISO <= dashTo)))
        .sort((a, b) => (b.dataISO || '').localeCompare(a.dataISO || ''))
        .slice(0, 150)
    : [];

  const extractVendor = extractMatricula ? collaborators.find((c) => c.matricula === extractMatricula) : null;
  const extract = extractMatricula
    ? computeVendorExtract(sales, extractMatricula, catKey, dashFrom, dashTo, specialLists)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-semibold" style={{ color: info.cor }}>
            {info.titulo}
          </h3>
          <DateRangeControls />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <PodiumStaircase
          ranking={rankingList}
          getValue={(r: SummaryRow) => (isUnit ? r.itens : r.valor)}
          formatValue={(v) => (isUnit ? `${v} un.` : fmtMoney(v))}
          variant={modeloRanking}
        />
        <button
          onClick={() => setGalleryOpen(true)}
          className="mt-4 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
        >
          👥 Detalhamento por vendedor
        </button>
      </div>

      {!isUnit && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold mb-3 text-slate-300">Lista de vendas — {info.titulo}</h3>
          {categorySales.length === 0 ? (
            <div className="text-sm text-slate-500 py-4 text-center">Nenhuma venda no período.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-800">
                    <th className="py-1.5 pr-3">Data</th>
                    <th className="py-1.5 pr-3">Matrícula</th>
                    <th className="py-1.5 pr-3">Vendedor</th>
                    <th className="py-1.5 pr-3">Produto</th>
                    <th className="py-1.5 pr-3">Qtd</th>
                  </tr>
                </thead>
                <tbody>
                  {categorySales.map((s) => (
                    <tr key={s.id} className="border-b border-slate-900">
                      <td className="py-1.5 pr-3 font-mono">{fmtDateBR(s.dataISO)}</td>
                      <td className="py-1.5 pr-3 font-mono">{s.matricula}</td>
                      <td className="py-1.5 pr-3">{s.vendedor}</td>
                      <td className="py-1.5 pr-3">{s.produto}</td>
                      <td className="py-1.5 pr-3 font-mono">{s.qtd}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {galleryOpen && (
        <VendorGalleryModal
          title={info.titulo}
          ranking={rankingList}
          isUnit={isUnit}
          onClose={() => setGalleryOpen(false)}
          onSelect={(matricula) => {
            setGalleryOpen(false);
            setExtractMatricula(matricula);
          }}
        />
      )}

      {extractMatricula && (
        <ExtractModal
          nome={extractVendor?.apelido || extractVendor?.nome || extractMatricula}
          from={dashFrom}
          to={dashTo}
          extract={extract}
          onClose={() => setExtractMatricula(null)}
        />
      )}
    </div>
  );
}

function VendorGalleryModal({
  title,
  ranking,
  isUnit,
  onClose,
  onSelect,
}: {
  title: string;
  ranking: SummaryRow[];
  isUnit: boolean;
  onClose: () => void;
  onSelect: (matricula: string) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-5 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Vendedores — {title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3">Toque num vendedor pra ver o extrato individual de vendas do período.</p>
        {ranking.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">Nenhum vendedor com vendas nesta categoria/período.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ranking.map((r) => (
              <button
                key={r.matricula}
                onClick={() => onSelect(r.matricula)}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 p-3 hover:border-cyan-500"
              >
                {r.foto ? (
                  <img src={r.foto} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-700" />
                )}
                <div className="text-xs font-medium truncate w-full text-center">{r.apelido || r.nome}</div>
                <div className="text-[11px] font-mono text-slate-400">{isUnit ? `${r.itens} un.` : fmtMoney(r.valor)}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ExtractModal({
  nome,
  from,
  to,
  extract,
  onClose,
}: {
  nome: string;
  from: string;
  to: string;
  extract: ReturnType<typeof computeVendorExtract>;
  onClose: () => void;
}) {
  const totalValor = extract.reduce((a, s) => a + s.valor, 0);
  const totalItens = extract.reduce((a, s) => a + s.qtd, 0);
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-5 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold">Extrato — {nome}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          {fmtDateBR(from)} — {fmtDateBR(to)} · {totalItens} itens · {fmtMoney(totalValor)}
        </p>
        {extract.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">Nenhuma venda no período.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-800">
                <th className="py-1.5 pr-3">Data</th>
                <th className="py-1.5 pr-3">Item</th>
                <th className="py-1.5 pr-3">Qtd</th>
                <th className="py-1.5 pr-3">Valor</th>
              </tr>
            </thead>
            <tbody>
              {extract.map((s) => (
                <tr key={s.id} className="border-b border-slate-900">
                  <td className="py-1.5 pr-3 font-mono">{fmtDateBR(s.dataISO)}</td>
                  <td className="py-1.5 pr-3">{s.produto}</td>
                  <td className="py-1.5 pr-3 font-mono">{s.qtd}</td>
                  <td className="py-1.5 pr-3 font-mono">{fmtMoney(s.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
