import { useAuth } from '../../auth/AuthContext';
import { DateRangeControls } from '../../components/DateRangeControls';
import { CAT_KEYS, type CategoryKey } from '../../lib/business/classification';
import { catTotals } from '../../lib/business/summary';
import { fmtDateBR, fmtMoney } from '../../lib/format';
import { useCollaborators, useGoals, useSales } from '../../lib/queries';
import { useIndividualGoals } from '../../lib/mutations';
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

function useMyCategoryGoal(categoria: CategoryKey, collaboratorId: string | undefined) {
  const { data } = useIndividualGoals(categoria);
  return data?.find((r) => r.collaborator_id === collaboratorId);
}

function CategoryRow({ categoria, mySales, collaboratorId }: { categoria: CategoryKey; mySales: ReturnType<typeof useSales>['data']; collaboratorId: string | undefined }) {
  const { dashFrom, dashTo } = useDateRange();
  const { data: goals } = useGoals();
  const myGoal = useMyCategoryGoal(categoria, collaboratorId);
  const t = catTotals(mySales ?? [], dashFrom, dashTo, categoria);
  const isUnidade = goals?.[categoria]?.metrica === 'unidade';
  const valorRef = isUnidade ? t.qtd : t.valor;
  const metaIndividual = myGoal?.participa ? myGoal.valor_meta : 0;
  const pct = metaIndividual > 0 ? Math.min(999, (valorRef / metaIndividual) * 100) : null;

  return (
    <tr className="border-b border-slate-900">
      <td className="py-2 pr-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: CAT_COLOR[categoria] }} />
          {CAT_LABEL[categoria]}
        </span>
      </td>
      <td className="py-2 pr-3 font-mono">{isUnidade ? `${t.qtd} un.` : fmtMoney(t.valor)}</td>
      <td className="py-2 pr-3 font-mono text-slate-400">{metaIndividual > 0 ? (isUnidade ? `${metaIndividual} un.` : fmtMoney(metaIndividual)) : '—'}</td>
      <td className="py-2 pr-3 font-mono">{pct !== null ? `${pct.toFixed(0)}%` : '—'}</td>
    </tr>
  );
}

export function CollaboratorHomePage() {
  const { profile, signOut } = useAuth();
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { dashFrom, dashTo } = useDateRange();

  const me = collaborators?.find((c) => c.id === profile?.collaborator_id);

  if (!collaborators || !sales) {
    return <div className="min-h-screen bg-slate-950 text-slate-400 text-sm p-6">Carregando…</div>;
  }

  const mySales = sales.filter((s) => !me || s.matricula === me.matricula);
  const inRange = mySales.filter((s) => (!s.dataISO || (s.dataISO >= dashFrom && s.dataISO <= dashTo)));
  const totalValor = inRange.reduce((a, s) => a + s.valor, 0);
  const totalItens = inRange.reduce((a, s) => a + s.qtd, 0);
  const extract = inRange.slice().sort((a, b) => (b.dataISO || '').localeCompare(a.dataISO || ''));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {me?.foto ? (
            <img src={me.foto} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-slate-700" />
          )}
          <div>
            <h1 className="text-lg font-semibold">{me?.apelido || me?.nome || 'Minhas vendas'}</h1>
            <p className="text-xs text-slate-400">
              Colaborador{me?.setor ? ` · ${me.setor}` : ''}
            </p>
          </div>
        </div>
        <button onClick={() => signOut()} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
          Sair
        </button>
      </header>

      <main className="p-6 flex flex-col gap-4 max-w-4xl mx-auto">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-cyan-400 font-semibold text-sm">Meu período</h3>
          <DateRangeControls />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs text-slate-400 mb-1">Total vendido</div>
            <div className="text-2xl font-mono font-semibold">{fmtMoney(totalValor)}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs text-slate-400 mb-1">Itens vendidos</div>
            <div className="text-2xl font-mono font-semibold">{totalItens} un.</div>
          </div>
        </div>

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
              {CAT_KEYS.map((k) => (
                <CategoryRow key={k} categoria={k} mySales={mySales} collaboratorId={me?.id} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-semibold text-sm mb-3">Meu extrato de vendas</h3>
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
      </main>
    </div>
  );
}
