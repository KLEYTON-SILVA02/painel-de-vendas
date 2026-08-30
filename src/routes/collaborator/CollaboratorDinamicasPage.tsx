import { useAuth } from '../../auth/AuthContext';
import { computeDinamicaProgresso, dynamicAllowsCollaborator, dynamicStatus } from '../../lib/business/dynamics';
import { normalize } from '../../lib/business/normalize';
import type { Collaborator, Dynamic } from '../../lib/business/types';
import { fmtDateBR, fmtMoney } from '../../lib/format';
import { useCollaborators, useDynamics, useSales } from '../../lib/queries';

const todayISO = () => new Date().toISOString().slice(0, 10);

// Collaborators see only their own standing within each dynamic — never the
// full participant ranking — so this never reuses PodiumStaircase/admin's
// DinamicaCard, which show everyone.
export function CollaboratorDinamicasPage() {
  const { profile } = useAuth();
  const { data: dynamics } = useDynamics();
  const { data: sales } = useSales();
  const { data: collaborators } = useCollaborators();

  const me = collaborators?.find((c) => c.id === profile?.collaborator_id);

  if (!dynamics || !sales || !collaborators) {
    return <div className="text-sm text-slate-500 p-6 text-center">Carregando…</div>;
  }

  const minhas = dynamics.filter(
    (d) => (d.participantes.length === 0 || (me && d.participantes.includes(me.matricula))) && (!me || dynamicAllowsCollaborator(d, me)),
  );
  const today = todayISO();
  const ativas = minhas.filter((d) => dynamicStatus(d, today) !== 'encerrada').sort((a, b) => a.dataFim.localeCompare(b.dataFim));
  const encerradas = minhas.filter((d) => dynamicStatus(d, today) === 'encerrada').sort((a, b) => b.dataFim.localeCompare(a.dataFim));

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-purple-400 font-semibold text-sm">🎯 Dinâmicas Comerciais</h3>
        <p className="text-xs text-slate-500 mt-1">Suas metas e resultados em campanhas ativas, agendadas e encerradas.</p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold text-sm mb-3">Ativas / Agendadas ({ativas.length})</h3>
        {ativas.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">Nenhuma dinâmica ativa ou agendada.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {ativas.map((d) => (
              <MyDinamicaCard key={d.id} d={d} status={dynamicStatus(d, today)} sales={sales} collaborators={collaborators} matricula={me?.matricula} />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold text-sm mb-1">🖼️ Minha galeria de dinâmicas ({encerradas.length})</h3>
        <p className="text-xs text-slate-500 mb-3">Seus resultados em dinâmicas já encerradas.</p>
        {encerradas.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">Nenhuma dinâmica encerrada ainda.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {encerradas.map((d) => (
              <MyDinamicaCard key={d.id} d={d} status="encerrada" sales={sales} collaborators={collaborators} matricula={me?.matricula} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const STATUS_PILL: Record<string, string> = {
  ativa: 'bg-green-500/20 text-green-400',
  encerrada: 'bg-slate-700 text-slate-300',
  agendada: 'bg-orange-500/20 text-orange-400',
};
const STATUS_LABEL: Record<string, string> = { ativa: 'Ativa', encerrada: 'Encerrada', agendada: 'Agendada' };

function MyDinamicaCard({
  d,
  status,
  sales,
  collaborators,
  matricula,
}: {
  d: Dynamic;
  status: 'ativa' | 'agendada' | 'encerrada';
  sales: ReturnType<typeof useSales>['data'];
  collaborators: Collaborator[];
  matricula: string | undefined;
}) {
  const isUnidade = d.metrica === 'unidade';
  const realizadoLoja = computeDinamicaProgresso(d, sales ?? [], collaborators);
  const pct = d.metaValor > 0 ? Math.min(100, (realizadoLoja / d.metaValor) * 100) : null;

  const produtosSet = d.produtos.length ? new Set(d.produtos.map((p) => normalize(p))) : null;
  let myValor = 0;
  let myItens = 0;
  (sales ?? []).forEach((s) => {
    if (!matricula || s.matricula !== matricula) return;
    if (!s.dataISO || s.dataISO < d.dataInicio || s.dataISO > d.dataFim) return;
    if (produtosSet && !produtosSet.has(normalize(s.produto))) return;
    myValor += Number(s.valor) || 0;
    myItens += Number(s.qtd) || 0;
  });

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="flex items-center justify-between">
        <b className="text-sm">{d.titulo}</b>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_PILL[status]}`}>{STATUS_LABEL[status]}</span>
      </div>
      <div className="text-xs text-slate-400 mt-1.5">
        {fmtDateBR(d.dataInicio)} → {fmtDateBR(d.dataFim)}
        {d.metaValor > 0 && ` · meta ${isUnidade ? `${d.metaValor} un.` : fmtMoney(d.metaValor)}`}
      </div>
      {d.descricao && <div className="text-xs text-slate-400 mt-1">{d.descricao}</div>}

      <div className="text-xs font-mono text-green-400 mt-2">
        Minhas vendas: {isUnidade ? `${myItens} un.` : fmtMoney(myValor)}
      </div>
      {pct !== null && (
        <>
          <div className="text-[11px] text-slate-500 mt-1">Progresso da loja: {pct.toFixed(0)}% da meta</div>
          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden mt-1">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500" style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
    </div>
  );
}
