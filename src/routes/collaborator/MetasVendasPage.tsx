import { useAuth } from '../../auth/AuthContext';
import { MobileDateFilterBar } from '../../components/collaborator/MobileDateFilterBar';
import { CAT_KEYS, type CategoryKey } from '../../lib/business/classification';
import { diasRestantesNoMes, effectiveMetaGeral, getSuperMeta } from '../../lib/business/goals';
import { catTotals, computeSummary } from '../../lib/business/summary';
import { fmtDateBR, fmtMoney } from '../../lib/format';
import { useIndividualGoals } from '../../lib/mutations';
import { useCollaborators, useGoals, useSales, useStoreSettings } from '../../lib/queries';
import { useDateRange } from '../DateRangeContext';

const CAT_LABEL: Record<CategoryKey, string> = {
  DERM: 'Dermocosméticos',
  GEN: 'Genérico & Similar',
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
  const { dashFrom, dashTo } = useDateRange();
  const { data: dermGoals } = useIndividualGoals('DERM');
  const { data: genGoals } = useIndividualGoals('GEN');
  const { data: mpGoals } = useIndividualGoals('MP');
  const { data: merGoals } = useIndividualGoals('MER');

  const me = collaborators?.find((c) => c.id === profile?.collaborator_id);

  if (!collaborators || !sales || !goals || !storeSettings || !dermGoals || !genGoals || !mpGoals || !merGoals) {
    return <div className="text-sm text-slate-500 p-6 text-center">Carregando…</div>;
  }

  const modoDia = dashFrom === dashTo;
  const mode = modoDia ? 'dia' : 'mes';
  const dias = diasRestantesNoMes();

  // ---- Store-wide metrics ----
  const storeRanking = computeSummary(sales, collaborators, dashFrom, dashTo);
  const storeValor = storeRanking.reduce((a, r) => a + r.valor, 0);
  const storeItens = storeRanking.reduce((a, r) => a + r.itens, 0);
  const storeMeta = effectiveMetaGeral(goals, mode, sales, collaborators, storeSettings.meta_geral_fallback);
  const storeSuper = getSuperMeta(goals.MER, mode, sales, collaborators);
  const storeSaldo = storeValor - storeMeta;
  const storeAtingimento = storeMeta > 0 ? Math.min(999, (storeValor / storeMeta) * 100) : null;
  const storeFalta = Math.max(0, (storeSuper > storeMeta ? storeSuper : storeMeta) - storeValor);

  // ---- Individual metrics: aggregate across categories where I participate ----
  const goalsByCategoria: Record<CategoryKey, typeof dermGoals> = { DERM: dermGoals, GEN: genGoals, MP: mpGoals, MER: merGoals };
  const mySales = sales.filter((s) => !me || s.matricula === me.matricula);
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
    <div className="flex flex-col gap-3">
      <MobileDateFilterBar />

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

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold text-sm mb-3">Minhas metas por categoria</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-800">
              <th className="py-2 pr-3">Categoria</th>
              <th className="py-2 pr-3">Vendido</th>
              <th className="py-2 pr-3">Minha meta</th>
              <th className="py-2 pr-3">Atingim.</th>
            </tr>
          </thead>
          <tbody>
            {CAT_KEYS.map((k) => {
              const row = goalsByCategoria[k]?.find((r) => r.collaborator_id === me?.id);
              const t = catTotals(mySales, dashFrom, dashTo, k);
              const metaIndividual = row?.participa ? Number(row.valor_meta) || 0 : 0;
              const pct = metaIndividual > 0 ? Math.min(999, (t.valor / metaIndividual) * 100) : null;
              return (
                <tr key={k} className="border-b border-slate-900">
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: CAT_COLOR[k] }} />
                      {CAT_LABEL[k]}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono">{fmtMoney(t.valor)}</td>
                  <td className="py-2 pr-3 font-mono text-slate-400">{metaIndividual > 0 ? fmtMoney(metaIndividual) : '—'}</td>
                  <td className="py-2 pr-3 font-mono">{pct !== null ? `${pct.toFixed(0)}%` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold text-sm mb-3">Minhas vendas</h3>
        {extract.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">Nenhuma venda no período.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-800">
                  <th className="py-1.5 pr-3">Data</th>
                  <th className="py-1.5 pr-3">Produto</th>
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
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="font-semibold text-sm mb-3" style={{ color }}>
        {title}
      </h3>
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
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <Metric label="Realizado" value={fmtMoney(realizado)} color="#00f0ff" />
      <Metric label="Itens" value={`${itens} un.`} color="#a82bff" />
      <Metric label="Meta Geral" value={fmtMoney(meta)} color="#ffd700" />
      <Metric label="Super Meta" value={fmtMoney(superMeta)} color="#ff3df0" />
      <Metric label="Saldo" value={`${saldo >= 0 ? '' : '-'}${fmtMoney(Math.abs(saldo))}`} color={saldo >= 0 ? '#14ff00' : '#ff3df0'} />
      <Metric label="Atingimento" value={atingimento !== null ? `${atingimento.toFixed(0)}%` : '—'} color="#00f0ff" />
      <Metric label="Dias restantes" value={`${diasRestantes} dia(s)`} color="#14ff00" />
      <Metric label="Valor restante" value={fmtMoney(falta)} color="#ff6a00" />
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-sm font-mono font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
