import { useEffect, useMemo, useState } from 'react';
import { RankingImageModal } from '../../components/ranking/RankingImageModal';
import { useCategoryLabelMap, useMobileCategoryLabelMap } from '../../lib/business/categoryLabels';
import { getGoalFromTotals } from '../../lib/business/goals';
import { summaryFromCategoryTotals } from '../../lib/business/summary';
import { VISITANTE_SETOR } from '../../lib/business/types';
import { copyText, formatRankingText } from '../../lib/clipboard';
import { monthFirstISO, monthLastISO, todayISO } from '../../lib/dateRange';
import { fmtMoney, monthName } from '../../lib/format';
import { accumulateMonthExtract, buildMonthExtract, buildMonthExtractHtml, openPrintPreview } from '../../lib/printExtract';
import { generateRankingImageBlob, tryCopyImage } from '../../lib/rankingImage';
import { useCollaborators, useGoals, useMobileCategoryTotals, useSalesInRange, useSpecialLists, useStore } from '../../lib/queries';
import { useDateRange } from '../DateRangeContext';
import { MobileDateFilter } from './MobileDateFilter';

const RANKING_COLS = [
  { key: 'DERM' as const, titulo: 'Dermo', cor: '#b84c9c' },
  { key: 'GEN' as const, titulo: 'Gen/Sim', cor: '#698b46' },
  { key: 'MP' as const, titulo: 'Marcas Excl.', cor: '#813c97' },
  { key: 'MER' as const, titulo: 'Merc. Geral', cor: '#f26122' },
  { key: 'LEVMEL' as const, titulo: 'Levmel', cor: '#f0b514' },
  { key: 'CHIP' as const, titulo: 'Chip', cor: '#fed400' },
];

export function MobileRankingPage() {
  const { data: collaborators } = useCollaborators();
  const { data: goals } = useGoals();
  const { data: store } = useStore();
  const { dashFrom, dashTo, refYear, refMonth } = useDateRange();
  const categoryLabels = useMobileCategoryLabelMap();
  // Impressão do extrato usa os rótulos completos (não as abreviações de
  // chip da tela, como "MERC"/"M.P") — o papel não tem a mesma restrição de
  // largura do celular.
  const fullCategoryLabels = useCategoryLabelMap();
  const { data: specialLists } = useSpecialLists();
  // MER's chip is the store's grand-total bucket (every sale, regardless of
  // category — see the `catKey === 'MER' ? 'ALL' : catKey` mapping below),
  // the same merged "Todas" filter Desktop's RankFilterBar already exposes
  // (DashboardPage.tsx). Desktop labels it with the store's own Mercadoria
  // Geral name; here it's shortened to "Mercadoria" per the mobile spec,
  // instead of the longer store-customizable label used everywhere else.
  const RANKING_COLS_LABELED = useMemo(
    () => RANKING_COLS.map((c) => ({ ...c, titulo: c.key === 'MER' ? 'Mercadoria' : (categoryLabels[c.key] ?? c.titulo) })),
    [categoryLabels],
  );
  const [catKey, setCatKey] = useState<(typeof RANKING_COLS)[number]['key']>('DERM');
  const [generating, setGenerating] = useState(false);
  const [imageModal, setImageModal] = useState<{ url: string; copied: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  // Extrato por colaborador (mesma função do Ranking Desktop): colapsado por
  // padrão, como o resto do mobile — só busca as vendas do mês item a item
  // (useSalesInRange) quando o ADM de fato pede a impressão, nunca ao abrir
  // a tela.
  const [extratoOpen, setExtratoOpen] = useState(false);
  const [extratoMatricula, setExtratoMatricula] = useState<string | null>(null);
  const [extratoCategorias, setExtratoCategorias] = useState<Set<string>>(new Set(RANKING_COLS.map((c) => c.key)));
  const [extratoModo, setExtratoModo] = useState<'dia' | 'acumulado'>('dia');
  const [printRequested, setPrintRequested] = useState(false);
  const monthFrom = monthFirstISO(refYear, refMonth);
  const monthTo = monthLastISO(refYear, refMonth);
  const { data: extratoSales, isFetching: extratoSalesFetching } = useSalesInRange(monthFrom, monthTo, printRequested);

  useEffect(() => {
    if (!printRequested || !extratoMatricula || !extratoSales || !specialLists || !collaborators) return;
    const colaborador = collaborators.find((c) => c.matricula === extratoMatricula);
    const nomeColaborador = colaborador?.apelido || colaborador?.nome || extratoMatricula;
    const salesColaborador = extratoSales.filter((s) => s.matricula === extratoMatricula);
    const categoriasBase = buildMonthExtract(salesColaborador, refYear, refMonth + 1, specialLists, fullCategoryLabels).filter((c) =>
      extratoCategorias.has(c.key),
    );
    const isAcumulado = extratoModo === 'acumulado';
    const categorias = isAcumulado ? accumulateMonthExtract(categoriasBase) : categoriasBase;
    const monthLabel = `${monthName(refMonth)}/${refYear}`;
    const html = buildMonthExtractHtml(
      categorias,
      monthLabel,
      store?.nome_loja,
      nomeColaborador,
      isAcumulado ? 'Acumulado' : 'Valor',
      'Extrato do Mês',
      'Total do mês',
      true,
      !isAcumulado,
    );
    openPrintPreview(`Extrato ${isAcumulado ? '(acumulado) ' : ''}— ${nomeColaborador} — ${monthLabel}`, html);
    setPrintRequested(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printRequested, extratoSales, specialLists, collaborators]);

  const { data: categoryTotals } = useMobileCategoryTotals(dashFrom, dashTo);
  // Only fetched when the currently selected category's goal actually needs
  // it (auto-redistribute) — handleGenerateImage's metaDiariaValor is the
  // only consumer, and it's read lazily on click, not per render.
  const needsMonthToDate = !!goals?.[catKey]?.autoRedistribuir;
  const now = new Date();
  const { data: monthToDateTotals } = useMobileCategoryTotals(monthFirstISO(now.getFullYear(), now.getMonth()), todayISO(), needsMonthToDate);

  // Safe stand-ins so the useMemo below always runs in the same order
  // (Rules of Hooks) whether or not every query has resolved yet — the
  // "Carregando…" guard comes after it, not before.
  const collaboratorsData = collaborators ?? [];
  // Mercadoria Geral is the store's grand total, not its own exclusive
  // bucket — every sale counts regardless of category, same as the desktop
  // Ranking/CategoryPage and the collaborator-facing screens.
  const ranking = useMemo(
    () => summaryFromCategoryTotals(categoryTotals ?? [], collaboratorsData, catKey === 'MER' ? 'ALL' : catKey),
    [categoryTotals, collaboratorsData, catKey],
  );

  if (!collaborators || !categoryTotals || !goals || (needsMonthToDate && !monthToDateTotals)) {
    return <div style={{ padding: 24, fontSize: 12, color: 'var(--mv2-texto-2)' }}>Carregando…</div>;
  }

  const info = RANKING_COLS_LABELED.find((c) => c.key === catKey)!;
  const isUnit = catKey === 'LEVMEL' || catKey === 'CHIP';
  const rankingList = ranking.filter((r) => (isUnit ? r.itens > 0 : r.valor > 0));
  const totalValor = ranking.reduce((a, r) => a + r.valor, 0);
  const totalItens = ranking.reduce((a, r) => a + r.itens, 0);

  async function handleCopy() {
    const text = formatRankingText(rankingList, info.titulo, dashFrom, dashTo, store?.nome_loja);
    const ok = await copyText(text);
    setCopied(ok);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleGenerateImage() {
    setGenerating(true);
    try {
      const rows = rankingList.map((r) => ({ nome: r.nome, apelido: r.apelido, foto: r.foto, valor: isUnit ? r.itens : r.valor }));
      const metaDiariaValor = getGoalFromTotals(goals![catKey], 'dia', monthToDateTotals ?? [], collaborators!);
      const blob = await generateRankingImageBlob(rows, info.titulo, dashFrom, dashTo, store?.nome_loja, isUnit, metaDiariaValor);
      if (!blob) return;
      const copied = await tryCopyImage(blob);
      setImageModal({ url: URL.createObjectURL(blob), copied });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <div className="mv2-screen-title mv2-ranking">RANKING</div>

      <MobileDateFilter />

      <div className="mv2-chip-row">
        {RANKING_COLS_LABELED.map((c) => (
          <button
            key={c.key}
            onClick={() => setCatKey(c.key)}
            className={`mv2-chip ${catKey === c.key ? 'active' : ''}`}
            style={{ ['--mv2-chip-color' as string]: c.cor }}
          >
            {c.titulo}
          </button>
        ))}
      </div>

      <div className="mv2-ranking-list-card">
        <div style={{ fontSize: 10, fontWeight: 700, color: info.cor, marginBottom: 4 }}>{info.titulo.toUpperCase()}</div>
        {rankingList.length === 0 ? (
          <div style={{ fontSize: 10, color: 'var(--mv2-texto-2)', padding: '8px 0', textAlign: 'center' }}>Sem vendas no período.</div>
        ) : (
          rankingList.map((r, i) => (
            <div key={r.matricula} className="mv2-row">
              <span className="mv2-pos" style={{ color: info.cor }}>
                {i + 1}
              </span>
              {r.foto ? <img src={r.foto} alt="" className="mv2-avatar" /> : <div className="mv2-avatar" />}
              <span className="mv2-name">{r.apelido || r.nome}</span>
              <span className="mv2-qty">{isUnit ? `${r.itens} un.` : fmtMoney(r.valor)}</span>
            </div>
          ))
        )}
      </div>

      <div className="mv2-ranking-actions">
        <div className="mv2-row" style={{ gap: 6 }}>
          <button className="mv2-btn-outline" onClick={handleCopy}>
            {copied ? '✓ Copiado' : 'Copiar'}
          </button>
          <button className="mv2-btn-generate" onClick={handleGenerateImage} disabled={generating}>
            {generating ? 'Gerando…' : 'Gerar Imagem'}
          </button>
        </div>
      </div>

      <div style={{ margin: '0 18px', fontSize: 8, color: 'var(--mv2-texto-2)' }}>
        Total período: {fmtMoney(totalValor)} · {totalItens} un.
      </div>

      <div style={{ margin: extratoOpen ? '14px 18px 24px' : '14px 18px 0' }}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExtratoOpen((v) => !v)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setExtratoOpen((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}
        >
          <span>🖨️ Extrato por Colaborador</span>
          <span style={{ fontSize: 9, color: 'var(--mv2-texto-2)' }}>{extratoOpen ? '▲' : '▼'}</span>
        </div>

        {extratoOpen && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 9, color: 'var(--mv2-texto-2)', marginBottom: 6 }}>
              Escolha um colaborador e as categorias — a impressão mostra só os valores dele, dia a dia de venda, no
              mês de {monthName(refMonth)}/{refYear}.
            </div>

            <div className="mv2-seller-grid">
              {collaborators
                .filter((c) => c.setor !== VISITANTE_SETOR)
                .map((c) => (
                  <button
                    key={c.id}
                    className={`mv2-seller ${extratoMatricula === c.matricula ? 'active' : ''}`}
                    onClick={() => setExtratoMatricula(c.matricula)}
                  >
                    {c.foto ? <img src={c.foto} alt="" className="mv2-avatar" /> : <div className="mv2-avatar" />}
                    <span className="mv2-name">{c.apelido || c.nome}</span>
                  </button>
                ))}
            </div>

            <div className="mv2-chip-row" style={{ marginTop: 8 }}>
              {RANKING_COLS_LABELED.map((c) => {
                const checked = extratoCategorias.has(c.key);
                return (
                  <button
                    key={c.key}
                    onClick={() =>
                      setExtratoCategorias((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.key)) next.delete(c.key);
                        else next.add(c.key);
                        return next;
                      })
                    }
                    className={`mv2-chip ${checked ? 'active' : ''}`}
                    style={{ ['--mv2-chip-color' as string]: c.cor }}
                  >
                    {checked ? '✓ ' : ''}
                    {c.titulo}
                  </button>
                );
              })}
            </div>

            <div className="mv2-chip-row" style={{ marginTop: 8 }}>
              <button
                onClick={() => setExtratoModo('dia')}
                className={`mv2-chip ${extratoModo === 'dia' ? 'active' : ''}`}
                style={{ ['--mv2-chip-color' as string]: '#ffb700' }}
              >
                📅 Dias individuais
              </button>
              <button
                onClick={() => setExtratoModo('acumulado')}
                className={`mv2-chip ${extratoModo === 'acumulado' ? 'active' : ''}`}
                style={{ ['--mv2-chip-color' as string]: '#ffb700' }}
              >
                📈 Dias acumulados
              </button>
            </div>

            <button
              onClick={() => setPrintRequested(true)}
              disabled={!extratoMatricula || extratoCategorias.size === 0 || (printRequested && extratoSalesFetching)}
              className="mv2-btn-generate"
              style={{ marginTop: 8, width: '100%' }}
            >
              {printRequested && extratoSalesFetching ? 'Gerando…' : '🖨️ Preparar impressão'}
            </button>
          </div>
        )}
      </div>

      {imageModal && (
        <RankingImageModal
          url={imageModal.url}
          copied={imageModal.copied}
          onClose={() => setImageModal(null)}
          title="Imagem do ranking"
          filename="ranking-vendas.png"
          alt="Ranking"
        />
      )}
    </div>
  );
}
