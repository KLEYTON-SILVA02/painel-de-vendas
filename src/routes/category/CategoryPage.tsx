import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { MetricsFilterBar, type MfbStatCard } from '../../components/MetricsFilterBar';
import { ReclassifyBar } from '../../components/admin/ReclassifyBar';
import { PodiumStaircase } from '../../components/ranking/PodiumStaircase';
import { RankingImageModal } from '../../components/ranking/RankingImageModal';
import type { CategoryKey } from '../../lib/business/classification';
import { copyText, formatRankingText } from '../../lib/clipboard';
import { diasRestantesNoMes, getGoal, getSuperMeta } from '../../lib/business/goals';
import { todayISO } from '../../lib/dateRange';
import { computeSummary, computeVendorExtract } from '../../lib/business/summary';
import type { CommissionRate, SummaryRow } from '../../lib/business/types';
import { fmtDateBR, fmtMoney } from '../../lib/format';
import { generateRankingImageBlob, tryCopyImage } from '../../lib/rankingImage';
import { useReclassifyProdutos } from '../../lib/mutations';
import { useCatalog, useCollaborators, useCommissionRates, useGoals, useSales, useSpecialLists, useStore, useStoreSettings } from '../../lib/queries';
import { useDateRange } from '../DateRangeContext';

export type PageCategoryKey = CategoryKey | 'LEVMEL' | 'CHIP';

// Ported 1:1 from legacy/index-original.html (CATEGORIA_META / CATS / catLabel / catCls / .pill.*).
const CATEGORY_META: Record<PageCategoryKey, { titulo: string; cor: string }> = {
  DERM: { titulo: '🩹 Dermocosméticos', cor: '#ff3df0' },
  GEN: { titulo: '💊 Genérico', cor: '#14ff00' },
  MP: { titulo: '🏷️ Marcas Exclusivas', cor: '#a82bff' },
  MER: { titulo: '📦 Mercadoria Geral', cor: '#ff6a00' },
  LEVMEL: { titulo: '🍯 Levmel', cor: '#ffb700' },
  CHIP: { titulo: '🔴 Chip', cor: '#00e5ff' },
};
const CAT_PLAIN_LABEL: Record<CategoryKey, string> = {
  DERM: 'Dermocosméticos',
  GEN: 'Genérico',
  MP: 'Marcas Exclusivas',
  MER: 'Mercadoria Geral',
};
const CAT_PILL: Record<CategoryKey, { bg: string; color: string }> = {
  DERM: { bg: '#ff3df033', color: '#ff3df0' },
  GEN: { bg: '#39ff1433', color: '#14ff00' },
  MP: { bg: '#b026ff33', color: '#a82bff' },
  MER: { bg: '#ff6a0033', color: '#ff6a00' },
};

export function CategoryPage({ catKey }: { catKey: PageCategoryKey }) {
  const { profile } = useAuth();
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: goals } = useGoals();
  const { data: storeSettings } = useStoreSettings();
  const { data: specialLists } = useSpecialLists();
  const { data: store } = useStore();
  const { data: commissionRates } = useCommissionRates();
  const { data: catalog } = useCatalog();
  const { dashFrom, dashTo } = useDateRange();
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [extractMatricula, setExtractMatricula] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [imageModal, setImageModal] = useState<{ url: string; copied: boolean } | null>(null);
  const [reclassifyMode, setReclassifyMode] = useState(false);
  const [selectedProdutos, setSelectedProdutos] = useState<Set<string>>(new Set());
  const [bulkCat, setBulkCat] = useState<CategoryKey>('DERM');
  const reclassify = useReclassifyProdutos(profile?.store_id);

  if (!collaborators || !sales || !goals || !storeSettings || !specialLists || !commissionRates || !catalog) {
    return <div className="text-sm text-slate-500 p-6">Carregando…</div>;
  }

  const info = CATEGORY_META[catKey];
  const isUnit = catKey === 'LEVMEL' || catKey === 'CHIP';
  const modoDia = dashFrom === dashTo;
  const mode = modoDia ? 'dia' : 'mes';

  const ranking = computeSummary(sales, collaborators, dashFrom, dashTo, catKey, specialLists);
  const totalValor = ranking.reduce((a, r) => a + r.valor, 0);
  const totalItens = ranking.reduce((a, r) => a + r.itens, 0);
  const dias = diasRestantesNoMes();

  // Ported 1:1 from legacy/index-original.html (viewCategoria()'s statCards).
  let statCards: MfbStatCard[];
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
      {
        stack: [
          { label: `Meta Geral (${isUnidadeMetric ? 'un.' : 'R$'})`, value: fmtMetrica(metaGeral), color: '#ffd700' },
          { label: `Super Meta (${isUnidadeMetric ? 'un.' : 'R$'})`, value: fmtMetrica(metaSuper), color: '#ff3df0' },
          { label: 'Dias restantes', value: `${dias} dia(s)`, color: '#14ff00' },
        ],
      },
    ];
  } else {
    // Levmel/Chip aren't CategoryKeys, but reuse the same `goals` table
    // (categoria=LEVMEL/CHIP, configured in ADM > Funções > Metas > Levmel/Chip).
    const goal = goals[catKey];
    const metaMensal = goal?.mensal ?? 0;
    const metaDiaria = goal?.diaria ?? 0;
    const today = todayISO();
    const todayRanking = computeSummary(sales, collaborators, today, today, catKey, specialLists);
    const itensHoje = todayRanking.reduce((a, r) => a + r.itens, 0);
    const pctMensal = metaMensal > 0 ? Math.min(999, (totalItens / metaMensal) * 100) : 0;
    const pctDiaria = metaDiaria > 0 ? Math.min(999, (itensHoje / metaDiaria) * 100) : 0;
    statCards = [
      { label: 'Dias restantes', value: `${dias} dia(s)`, color: '#14ff00' },
      { label: 'Itens vendidos', value: `${totalItens} un.`, color: '#00f0ff' },
      { label: 'Vendedores ativos', value: String(ranking.filter((r) => r.itens > 0).length), color: '#a82bff' },
      // Meta Mensal/Diária values are long compound strings ("142/500 un.
      // (28%)") — as flat compact cards they got clipped by the fixed
      // 56px-tall card's forced nowrap+ellipsis while leaving most of that
      // height empty. Grouped into a stack card instead, same as every
      // other category screen already does for its own longer meta values
      // (Meta Geral/Super Meta/Dias restantes) — gives them the stack's
      // taller row and un-truncated width, and evens out the whole row's
      // height to match.
      {
        stack: [
          { label: 'Meta Mensal', value: metaMensal > 0 ? `${totalItens}/${metaMensal} un. (${pctMensal.toFixed(0)}%)` : '—', color: '#ffd700' },
          { label: 'Meta Diária (hoje)', value: metaDiaria > 0 ? `${itensHoje}/${metaDiaria} un. (${pctDiaria.toFixed(0)}%)` : '—', color: '#ff3df0' },
        ],
      },
    ];
  }

  const rankingList = ranking.filter((r) => (isUnit ? r.itens > 0 : r.valor > 0));
  const modeloRanking = storeSettings.modelo_ranking as 'escadinha' | 'lista';

  async function handleCopy() {
    const text = formatRankingText(rankingList, info.titulo, dashFrom, dashTo, store?.nome_loja);
    const ok = await copyText(text);
    setCopied(ok);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleGenerateImage() {
    setGenerating(true);
    try {
      const blob = await generateRankingImageBlob(rankingList, info.titulo, dashFrom, dashTo, store?.nome_loja);
      if (!blob) return;
      const copiedToClipboard = await tryCopyImage(blob);
      setImageModal({ url: URL.createObjectURL(blob), copied: copiedToClipboard });
    } finally {
      setGenerating(false);
    }
  }

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

  function toggleProduto(produto: string) {
    setSelectedProdutos((prev) => {
      const next = new Set(prev);
      if (next.has(produto)) next.delete(produto);
      else next.add(produto);
      return next;
    });
  }
  async function applyReclassify() {
    await reclassify.mutateAsync({ produtos: Array.from(selectedProdutos), categoria: bulkCat, catalog: catalog!, sales: sales! });
    setSelectedProdutos(new Set());
    setReclassifyMode(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-lg font-semibold mb-3" style={{ color: info.cor }}>
          {info.titulo}
        </h3>
        <MetricsFilterBar statCards={statCards} />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <PodiumStaircase
          ranking={rankingList}
          getValue={(r: SummaryRow) => (isUnit ? r.itens : r.valor)}
          formatValue={(v) => (isUnit ? `${v} un.` : fmtMoney(v))}
          variant={modeloRanking}
        />
        <div className="flex flex-wrap gap-2 mt-4">
          <button onClick={handleCopy} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
            {copied ? '✓ Copiado!' : '📋 Copiar ranking p/ WhatsApp'}
          </button>
          <button
            onClick={handleGenerateImage}
            disabled={generating}
            className="rounded-lg border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
            style={{ borderColor: '#ffb700', color: '#ffb700' }}
          >
            {generating ? 'Gerando...' : '🖼️ Gerar imagem do ranking'}
          </button>
          <button
            onClick={() => setGalleryOpen(true)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            👥 Detalhamento por vendedor
          </button>
        </div>
      </div>

      {!isUnit && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
            <h3 className="text-sm font-semibold text-slate-300">Lista de vendas — {info.titulo}</h3>
            <ReclassifyBar
              active={reclassifyMode}
              onToggle={() => {
                setReclassifyMode((v) => !v);
                setSelectedProdutos(new Set());
              }}
              selectedCount={selectedProdutos.size}
              categoria={bulkCat}
              onCategoriaChange={setBulkCat}
              onApply={applyReclassify}
              applying={reclassify.isPending}
            />
          </div>
          {categorySales.length === 0 ? (
            <div className="text-sm text-slate-500 py-4 text-center">Nenhuma venda no período.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-800">
                    {reclassifyMode && <th className="py-1.5 pr-3"></th>}
                    <th className="py-1.5 pr-3">Data</th>
                    <th className="py-1.5 pr-3">Matrícula</th>
                    <th className="py-1.5 pr-3">Vendedor</th>
                    <th className="py-1.5 pr-3">Produto</th>
                    <th className="py-1.5 pr-3">Qtd</th>
                    <th className="py-1.5 pr-3">Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {categorySales.map((s) => (
                    <tr key={s.id} className="border-b border-slate-900">
                      {reclassifyMode && (
                        <td className="py-1.5 pr-3">
                          <input type="checkbox" checked={selectedProdutos.has(s.produto)} onChange={() => toggleProduto(s.produto)} />
                        </td>
                      )}
                      <td className="py-1.5 pr-3 font-mono">{fmtDateBR(s.dataISO)}</td>
                      <td className="py-1.5 pr-3 font-mono">{s.matricula}</td>
                      <td className="py-1.5 pr-3">{s.vendedor}</td>
                      <td className="py-1.5 pr-3">{s.produto}</td>
                      <td className="py-1.5 pr-3 font-mono">{s.qtd}</td>
                      <td className="py-1.5 pr-3">
                        <span
                          className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide"
                          style={{ background: CAT_PILL[catKey as CategoryKey].bg, color: CAT_PILL[catKey as CategoryKey].color }}
                        >
                          {CAT_PLAIN_LABEL[catKey as CategoryKey]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {imageModal && <RankingImageModal url={imageModal.url} copied={imageModal.copied} onClose={() => setImageModal(null)} />}

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
          commissionRates={catKey === 'DERM' || catKey === 'GEN' || catKey === 'MP' ? commissionRates[catKey] : []}
          isMP={catKey === 'MP'}
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
  commissionRates,
  isMP,
  onClose,
}: {
  nome: string;
  from: string;
  to: string;
  extract: ReturnType<typeof computeVendorExtract>;
  commissionRates: CommissionRate[];
  isMP: boolean;
  onClose: () => void;
}) {
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const totalValor = extract.reduce((a, s) => a + s.valor, 0);
  const totalItens = extract.reduce((a, s) => a + s.qtd, 0);
  // The extract modal is always about one specific vendor (extractMatricula),
  // so this is exactly the "colaborador selecionado" moment the commission
  // feature is scoped to. Each admin-enabled rate gets its own liga/desliga
  // button — a single-select group: off by default (sale's own valor shown
  // as-is), clicking the active one again turns it back off. Marcas
  // Exclusivas always shows its 3 slots fixed (even one never configured,
  // at 0%), rather than only the ones the admin happened to mark "ativo" in
  // Metas > Comissões — a slot left unchecked there used to just vanish
  // from this screen instead of showing up as an obvious 0% button.
  const availableRates = isMP
    ? [1, 2, 3].map((slot) => commissionRates.find((r) => r.slot === slot) ?? { categoria: 'MP' as const, slot, percentual: 0, ativo: false })
    : commissionRates.filter((r) => r.ativo);
  const activeRate = activeSlot !== null ? availableRates.find((r) => r.slot === activeSlot) : undefined;
  const showCommission = !!activeRate;
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
          {showCommission && ` · comissão (${activeRate!.percentual}%): ${fmtMoney((totalValor * activeRate!.percentual) / 100)}`}
        </p>

        {availableRates.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {availableRates.map((r) => (
              <button
                key={r.slot}
                onClick={() => setActiveSlot((cur) => (cur === r.slot ? null : r.slot))}
                className="rounded-full border px-3 py-1 text-[11px] font-bold"
                style={{
                  borderColor: '#ffb700',
                  background: activeSlot === r.slot ? '#ffb700' : 'transparent',
                  color: activeSlot === r.slot ? '#231a02' : '#ffb700',
                }}
              >
                {availableRates.length > 1 ? `Comissão ${r.slot} (${r.percentual}%)` : `Comissão (${r.percentual}%)`}
              </button>
            ))}
          </div>
        )}

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
                {showCommission && <th className="py-1.5 pr-3">Comissão</th>}
              </tr>
            </thead>
            <tbody>
              {extract.map((s) => (
                <tr key={s.id} className="border-b border-slate-900">
                  <td className="py-1.5 pr-3 font-mono">{fmtDateBR(s.dataISO)}</td>
                  <td className="py-1.5 pr-3">{s.produto}</td>
                  <td className="py-1.5 pr-3 font-mono">{s.qtd}</td>
                  <td className="py-1.5 pr-3 font-mono">{fmtMoney(s.valor)}</td>
                  {showCommission && (
                    <td className="py-1.5 pr-3 font-mono text-amber-400">{fmtMoney((s.valor * activeRate!.percentual) / 100)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
