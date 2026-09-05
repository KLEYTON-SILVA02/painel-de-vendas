import { useMemo } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { CAT_KEYS, type CategoryKey } from '../../lib/business/classification';
import { diasRestantesNoMes, effectiveMetaGeral, getSuperMeta, goalProration } from '../../lib/business/goals';
import { catTotals, computeSummary } from '../../lib/business/summary';
import { fmtDateBR, fmtMoney } from '../../lib/format';
import { useIndividualGoals } from '../../lib/mutations';
import { useCollaborators, useGoals, useSales, useStoreSettings } from '../../lib/queries';
import { MobileDateFilter } from '../admin-mobile/MobileDateFilter';
import { useDateRange } from '../DateRangeContext';

const CAT_LABEL: Record<CategoryKey, string> = {
  DERM: 'Dermocosméticos',
  GEN: 'Genérico',
  MP: 'Marcas Exclusivas',
  MER: 'Mercadoria Geral',
};
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
export function MetasVendasPage() {
  const { profile } = useAuth();
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: goals } = useGoals();
  const { data: storeSettings } = useStoreSettings();
  const { dashFrom, dashTo, modoGeral } = useDateRange();
  const { data: dermGoals } = useIndividualGoals('DERM');
  const { data: genGoals } = useIndividualGoals('GEN');
  const { data: mpGoals } = useIndividualGoals('MP');
  const { data: merGoals } = useIndividualGoals('MER');

  const me = collaborators?.find((c) => c.id === profile?.collaborator_id);

  // Safe stand-ins so the useMemo calls below always run in the same order
  // (Rules of Hooks) whether or not every query has resolved yet — the
  // "Carregando…" guard comes after them, not before. This is the
  // collaborator's own landing screen, almost always opened on a phone, so
  // the cost of a full `sales` scan on every unrelated render (a tab
  // switch, a toast) is exactly the kind of thing that reads as "freezing"
  // on weaker mobile CPUs.
  const salesData = sales ?? [];
  const collaboratorsData = collaborators ?? [];

  const modoDia = dashFrom === dashTo;
  const mode = modoDia ? 'dia' : 'mes';
  const proration = goalProration(dashFrom, dashTo, modoGeral);
  const dias = diasRestantesNoMes();

  // ---- Store-wide metrics ----
  const storeRanking = useMemo(
    () => computeSummary(salesData, collaboratorsData, dashFrom, dashTo),
    [salesData, collaboratorsData, dashFrom, dashTo],
  );
  const storeValor = storeRanking.reduce((a, r) => a + r.valor, 0);
  const storeItens = storeRanking.reduce((a, r) => a + r.itens, 0);

  const meMatricula = me?.matricula;
  const mySales = useMemo(() => salesData.filter((s) => !meMatricula || s.matricula === meMatricula), [salesData, meMatricula]);

  if (!collaborators || !sales || !goals || !storeSettings || !dermGoals || !genGoals || !mpGoals || !merGoals) {
    return <div style={{ padding: 24, fontSize: 12, color: 'var(--mv2-texto-2)' }}>Carregando…</div>;
  }

  const storeMeta = effectiveMetaGeral(goals, mode, sales, collaborators, storeSettings.meta_geral_fallback, proration);
  const storeSuper = getSuperMeta(goals.MER, mode, sales, collaborators, proration);
  const storeSaldo = storeValor - storeMeta;
  const storeAtingimento = storeMeta > 0 ? Math.min(999, (storeValor / storeMeta) * 100) : null;
  const storeFalta = Math.max(0, (storeSuper > storeMeta ? storeSuper : storeMeta) - storeValor);

  // ---- Individual metrics: aggregate across categories where I participate ----
  const goalsByCategoria: Record<CategoryKey, typeof dermGoals> = { DERM: dermGoals, GEN: genGoals, MP: mpGoals, MER: merGoals };
  let myValor = 0;
  let myItens = 0;
  let myMeta = 0;
  let mySuper = 0;
  CAT_KEYS.forEach((k) => {
    const row = goalsByCategoria[k]?.find((r) => r.collaborator_id === me?.id);
    const t = catTotals(mySales, dashFrom, dashTo, k);
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

  const extract = mySales
    .filter((s) => !s.dataISO || (s.dataISO >= dashFrom && s.dataISO <= dashTo))
    .slice()
    .sort((a, b) => (b.dataISO || '').localeCompare(a.dataISO || ''));

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
              const t = k === 'MER' ? { valor: myValor, qtd: myItens } : catTotals(mySales, dashFrom, dashTo, k);
              const metaIndividual = row?.participa ? Number(row.valor_meta) || 0 : 0;
              const pct = metaIndividual > 0 ? Math.min(999, (t.valor / metaIndividual) * 100) : null;
              return (
                <tr key={k}>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: CAT_COLOR[k] }} />
                      {CAT_LABEL[k]}
                    </span>
                  </td>
                  <td className="mv2-valor">{fmtMoney(t.valor)}</td>
                  <td>{metaIndividual > 0 ? fmtMoney(metaIndividual) : '—'}</td>
                  <td>{pct !== null ? `${pct.toFixed(0)}%` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mv2-card">
        <div className="mv2-card-title">Minhas vendas</div>
        {extract.length === 0 ? (
          <div style={{ fontSize: 10, color: 'var(--mv2-texto-2)', padding: '8px 0', textAlign: 'center' }}>Nenhuma venda no período.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="mv2-data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Produto</th>
                  <th>Qtd</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {extract.map((s) => (
                  <tr key={s.id}>
                    <td>{fmtDateBR(s.dataISO)}</td>
                    <td>{s.produto}</td>
                    <td>{s.qtd}</td>
                    <td className="mv2-valor">{fmtMoney(s.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
