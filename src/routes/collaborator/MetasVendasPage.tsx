import { useAuth } from '../../auth/AuthContext';
import { useCategoryLabelMap } from '../../lib/business/categoryLabels';
import { CAT_KEYS, type CategoryKey } from '../../lib/business/classification';
import { diasRestantesNoMes, effectiveMetaGeralFromTotals, getSuperMetaFromTotals, goalProration } from '../../lib/business/goals';
import { summaryFromCategoryTotals, sumCategoryTotals } from '../../lib/business/summary';
import { monthFirstISO, todayISO } from '../../lib/dateRange';
import { fmtMoney } from '../../lib/format';
import { useIndividualGoals } from '../../lib/mutations';
import { useCollaborators, useGoals, useMobileCategoryTotals, useStoreSettings } from '../../lib/queries';
import { MobileDateFilter } from '../admin-mobile/MobileDateFilter';
import { useDateRange } from '../DateRangeContext';

const CAT_COLOR: Record<CategoryKey, string> = {
  DERM: '#ff3df0',
  GEN: '#14ff00',
  MP: '#a82bff',
  MER: '#ff6a00',
};

// New mobile-only screen: "Metas/Vendas" — store-wide realized/meta/saldo
// metrics, then the same shape for the collaborator's own individual goals,
// then their sales extract. Distinct from CollaboratorRankingPage (which is
// about standing vs peers, not goal tracking).
//
// Plano de Ação Tartaruga: this used to call useSales() unconditionally —
// the store's entire sales history — on every cold open, since this is the
// collaborator's default landing route. Every number here (store-wide and
// "my own") is a plain sum per collaborator/categoria within a date range,
// which mobile_category_totals() already computes server-side — so unlike
// Tela Início's card do campeão (needs day-by-day detail), this screen
// never needs a single item-level sale row.
export function MetasVendasPage() {
  const { profile } = useAuth();
  const categoryLabels = useCategoryLabelMap();
  const { data: collaborators } = useCollaborators();
  const { data: goals } = useGoals();
  const { data: storeSettings } = useStoreSettings();
  const { dashFrom, dashTo, modoGeral } = useDateRange();
  const { data: dermGoals } = useIndividualGoals('DERM');
  const { data: genGoals } = useIndividualGoals('GEN');
  const { data: mpGoals } = useIndividualGoals('MP');
  const { data: merGoals } = useIndividualGoals('MER');

  const me = collaborators?.find((c) => c.id === profile?.collaborator_id);

  const modoDia = dashFrom === dashTo;
  const mode = modoDia ? 'dia' : 'mes';
  const proration = goalProration(dashFrom, dashTo, modoGeral);
  const dias = diasRestantesNoMes();
  const now = new Date();
  const monthFirstStr = monthFirstISO(now.getFullYear(), now.getMonth());
  const todayISOStr = todayISO();

  const { data: categoryTotals } = useMobileCategoryTotals(dashFrom, dashTo);
  // Always needed (not gated behind autoRedistribuir like Tela Início) —
  // both the store's meta diária redistribution AND every row's "Vendido
  // este mês"/"Meta diária" column below read from this month-to-date
  // window regardless of goal settings.
  const { data: monthToDateTotals } = useMobileCategoryTotals(monthFirstStr, todayISOStr);

  if (!collaborators || !categoryTotals || !monthToDateTotals || !goals || !storeSettings || !dermGoals || !genGoals || !mpGoals || !merGoals) {
    return <div style={{ padding: 24, fontSize: 12, color: 'var(--mv2-texto-2)' }}>Carregando…</div>;
  }

  // ---- Store-wide metrics ----
  const storeRanking = summaryFromCategoryTotals(categoryTotals, collaborators, 'ALL');
  const storeValor = storeRanking.reduce((a, r) => a + r.valor, 0);
  const storeItens = storeRanking.reduce((a, r) => a + r.itens, 0);

  const storeMeta = effectiveMetaGeralFromTotals(goals, mode, monthToDateTotals, collaborators, storeSettings.meta_geral_fallback, proration);
  const storeSuper = getSuperMetaFromTotals(goals.MER, mode, monthToDateTotals, collaborators, proration);
  const storeSaldo = storeValor - storeMeta;
  const storeAtingimento = storeMeta > 0 ? Math.min(999, (storeValor / storeMeta) * 100) : null;
  const storeFalta = Math.max(0, (storeSuper > storeMeta ? storeSuper : storeMeta) - storeValor);

  // ---- Individual metrics: aggregate across categories where I participate ----
  const meMatricula = me?.matricula;
  const goalsByCategoria: Record<CategoryKey, typeof dermGoals> = { DERM: dermGoals, GEN: genGoals, MP: mpGoals, MER: merGoals };
  let myValor = 0;
  let myItens = 0;
  let myMeta = 0;
  let mySuper = 0;
  CAT_KEYS.forEach((k) => {
    const row = goalsByCategoria[k]?.find((r) => r.collaborator_id === me?.id);
    const t = sumCategoryTotals(categoryTotals, k, meMatricula);
    myValor += t.valor;
    myItens += t.qtd;
    if (row?.participa) {
      myMeta += Number(row.valor_meta) || 0;
      mySuper += Number(row.valor_super) || 0;
    }
  });
  const mySaldo = myValor - myMeta;
  const myAtingimento = myMeta > 0 ? Math.min(999, (myValor / myMeta) * 100) : null;
  const myFalta = Math.max(0, (mySuper > myMeta ? mySuper : myMeta) - myValor);

  return (
    <div>
      <div className="mv2-screen-title" style={{ ['--mv2-accent' as string]: '#00f0ff' }}>
        METAS/VENDAS
      </div>

      <MobileDateFilter />

      <div className="mv2-two-col">
        <Section title="🏪 Valores da loja" color="#00f0ff">
          <MetricsGrid
            realizado={storeValor}
            itens={storeItens}
            meta={storeMeta}
            superMeta={storeSuper}
            saldo={storeSaldo}
            atingimento={storeAtingimento}
            diasRestantes={dias}
            falta={storeFalta}
          />
        </Section>

        <Section title="🙋 Meus valores" color="#a82bff">
          <MetricsGrid
            realizado={myValor}
            itens={myItens}
            meta={myMeta}
            superMeta={mySuper}
            saldo={mySaldo}
            atingimento={myAtingimento}
            diasRestantes={dias}
            falta={myFalta}
          />
        </Section>
      </div>

      <div className="mv2-card">
        <div className="mv2-card-title">Minhas metas por categoria</div>
        <table className="mv2-data-table">
          <thead>
            <tr>
              <th>Categoria</th>
              <th>Vendido</th>
              <th>Minha meta</th>
              <th>Meta diária</th>
              <th>Atingim.</th>
            </tr>
          </thead>
          <tbody>
            {CAT_KEYS.map((k) => {
              const row = goalsByCategoria[k]?.find((r) => r.collaborator_id === me?.id);
              // Mercadoria Geral is my grand total, not its own exclusive
              // bucket — this row reflects everything I sold, not just what
              // got tagged MER (myValor is already my sum across every
              // category, computed above). The other rows keep their normal
              // exclusive per-category total.
              const t = k === 'MER' ? { valor: myValor, qtd: myItens } : sumCategoryTotals(categoryTotals, k, meMatricula);
              const metaIndividual = row?.participa ? Number(row.valor_meta) || 0 : 0;
              const pct = metaIndividual > 0 ? Math.min(999, (t.valor / metaIndividual) * 100) : null;
              const realizadoMes = sumCategoryTotals(monthToDateTotals, k === 'MER' ? 'ALL' : k, meMatricula).valor;
              const metaDiaria = metaIndividual > 0 ? Math.max(0, metaIndividual - realizadoMes) / Math.max(1, dias) : 0;
              return (
                <tr key={k}>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: CAT_COLOR[k] }} />
                      {categoryLabels[k]}
                    </span>
                  </td>
                  <td className="mv2-valor">{fmtMoney(t.valor)}</td>
                  <td>{metaIndividual > 0 ? fmtMoney(metaIndividual) : '—'}</td>
                  <td>{metaIndividual > 0 ? fmtMoney(metaDiaria) : '—'}</td>
                  <td>{pct !== null ? `${pct.toFixed(0)}%` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="mv2-card">
      <div className="mv2-card-title" style={{ color }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function MetricsGrid({
  realizado,
  itens,
  meta,
  superMeta,
  saldo,
  atingimento,
  diasRestantes,
  falta,
}: {
  realizado: number;
  itens: number;
  meta: number;
  superMeta: number;
  saldo: number;
  atingimento: number | null;
  diasRestantes: number;
  falta: number;
}) {
  return (
    <div className="mv2-metrics-grid" style={{ margin: 0 }}>
      <Metric label="Realizado" value={fmtMoney(realizado)} color="#00f0ff" />
      <Metric label="Itens" value={`${itens} un.`} color="#a82bff" />
      <Metric label="Meta Geral" value={fmtMoney(meta)} color="#ffd700" />
      <Metric label="Super Meta" value={fmtMoney(superMeta)} color="#ff3df0" />
      {/* Sign hidden by design (visual only) — `saldo` itself stays negative for every calculation elsewhere. */}
      <Metric label="Saldo" value={fmtMoney(Math.abs(saldo))} color={saldo >= 0 ? '#14ff00' : '#ff3df0'} />
      <Metric label="Atingimento" value={atingimento !== null ? `${atingimento.toFixed(0)}%` : '—'} color="#00f0ff" />
      <Metric label="Dias restantes" value={`${diasRestantes} dia(s)`} color="#14ff00" />
      <Metric label="Valor restante" value={fmtMoney(falta)} color="#ff6a00" />
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: color }}>
      <div className="mv2-label">{label}</div>
      <div className="mv2-value">{value}</div>
    </div>
  );
}
