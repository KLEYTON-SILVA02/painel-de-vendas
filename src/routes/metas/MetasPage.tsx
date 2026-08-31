import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { CAT_KEYS, GOAL_UNIT_KEYS, type CategoryKey, type GoalCategoryKey } from '../../lib/business/classification';
import { computeMetaDiariaRedistribuida } from '../../lib/business/goals';
import { distributeIndividualGoalsAuto } from '../../lib/business/individualGoals';
import type { Goal } from '../../lib/business/types';
import { fmtMoney } from '../../lib/format';
import { useIndividualGoals, useUpdateCommissionRate, useUpdateGoal, useUpsertIndividualGoal } from '../../lib/mutations';
import { useCollaborators, useCommissionRates, useGoals, useSales } from '../../lib/queries';

// One editor per commission slot — Dermo/Genéricos keep a single slot (1),
// Marcas Exclusivas registers 3 independent commissions.
const COMMISSION_SLOTS: { categoria: 'DERM' | 'GEN' | 'MP'; slot: number; label: string }[] = [
  { categoria: 'DERM', slot: 1, label: 'Dermocosméticos' },
  { categoria: 'GEN', slot: 1, label: 'Genérico' },
  { categoria: 'MP', slot: 1, label: 'Marcas Exclusivas — Comissão 1' },
  { categoria: 'MP', slot: 2, label: 'Marcas Exclusivas — Comissão 2' },
  { categoria: 'MP', slot: 3, label: 'Marcas Exclusivas — Comissão 3' },
];

const CAT_LABEL: Record<CategoryKey, string> = {
  DERM: 'Dermocosméticos',
  GEN: 'Genérico',
  MP: 'Marcas Exclusivas',
  MER: 'Mercadoria Geral',
};
const UNIT_LABEL: Record<(typeof GOAL_UNIT_KEYS)[number], string> = { LEVMEL: 'Levmel', CHIP: 'Chip' };

type GoalEdit = Partial<Pick<Goal, 'metrica' | 'mensal' | 'autoRedistribuir' | 'superMeta' | 'superMetaAuto'>>;

function defaultGoal(categoria: GoalCategoryKey): Goal {
  return { categoria, mensal: 0, diaria: 0, metrica: 'valor', autoRedistribuir: false, superMeta: 0, superMetaAuto: false };
}

/** Guards against a store whose `goals` rows weren't seeded for every
 * category (only the initial bootstrap store is seeded today). */
function withGoalDefaults(goals: Partial<Record<CategoryKey, Goal>>): Record<CategoryKey, Goal> {
  const result = {} as Record<CategoryKey, Goal>;
  CAT_KEYS.forEach((k) => (result[k] = goals[k] ?? defaultGoal(k)));
  return result;
}

export function MetasPage() {
  const [tab, setTab] = useState<'categoria' | 'individuais' | 'unidade' | 'comissoes'>('categoria');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1">
        <button
          onClick={() => setTab('categoria')}
          className={`rounded-lg px-3 py-1.5 text-sm ${tab === 'categoria' ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
        >
          Por Categoria
        </button>
        <button
          onClick={() => setTab('individuais')}
          className={`rounded-lg px-3 py-1.5 text-sm ${tab === 'individuais' ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
        >
          Metas Individuais
        </button>
        <button
          onClick={() => setTab('unidade')}
          className={`rounded-lg px-3 py-1.5 text-sm ${tab === 'unidade' ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
        >
          Levmel / Chip
        </button>
        <button
          onClick={() => setTab('comissoes')}
          className={`rounded-lg px-3 py-1.5 text-sm ${tab === 'comissoes' ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
        >
          Comissões
        </button>
      </div>
      {tab === 'categoria' ? (
        <MetasPorCategoria />
      ) : tab === 'individuais' ? (
        <MetasIndividuais />
      ) : tab === 'unidade' ? (
        <MetasUnidade />
      ) : (
        <MetasComissoes />
      )}
    </div>
  );
}

function MetasPorCategoria() {
  const { profile } = useAuth();
  const { data: goals } = useGoals();
  const { data: sales } = useSales();
  const { data: collaborators } = useCollaborators();
  const updateGoal = useUpdateGoal(profile?.store_id);
  const [edits, setEdits] = useState<Partial<Record<CategoryKey, GoalEdit>>>({});
  const [saving, setSaving] = useState(false);

  if (!goals || !sales || !collaborators) return <div className="text-sm text-slate-500 p-6">Carregando…</div>;
  const goalsSafe = withGoalDefaults(goals);

  function fieldValue<K extends keyof GoalEdit>(k: CategoryKey, field: K): Goal[K] {
    const edit = edits[k]?.[field];
    if (edit !== undefined) return edit as Goal[K];
    return goalsSafe[k][field] as Goal[K];
  }
  function setField<K extends keyof GoalEdit>(k: CategoryKey, field: K, value: Goal[K]) {
    setEdits((prev) => ({ ...prev, [k]: { ...prev[k], [field]: value } }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      for (const k of CAT_KEYS) {
        const patch = edits[k];
        if (!patch) continue;
        await updateGoal.mutateAsync({
          categoria: k,
          patch: {
            ...(patch.metrica !== undefined && { metrica: patch.metrica }),
            ...(patch.mensal !== undefined && { mensal: patch.mensal }),
            ...(patch.autoRedistribuir !== undefined && { auto_redistribuir: patch.autoRedistribuir }),
            ...(patch.superMeta !== undefined && { super_meta: patch.superMeta }),
            ...(patch.superMetaAuto !== undefined && { super_meta_auto: patch.superMetaAuto }),
          },
        });
      }
      setEdits({});
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-1">Metas por categoria</h3>
        <p className="text-xs text-slate-500 mb-4">
          Cada categoria tem sua própria Meta Geral e Super Meta, com métrica (R$ ou unidades) e redistribuição
          automática independentes. Com a redistribuição ativa, a meta diária é recalculada sozinha conforme o
          realizado e os dias restantes do mês.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-800">
                <th className="py-2 pr-3">Categoria</th>
                <th className="py-2 pr-3">Métrica</th>
                <th className="py-2 pr-3">Meta Geral (mensal)</th>
                <th className="py-2 pr-3">Redistrib. automática — Meta Geral</th>
                <th className="py-2 pr-3">Super Meta (mensal)</th>
                <th className="py-2 pr-3">Redistrib. automática — Super Meta</th>
              </tr>
            </thead>
            <tbody>
              {CAT_KEYS.map((k) => {
                const metrica = fieldValue(k, 'metrica');
                const autoRedistribuir = fieldValue(k, 'autoRedistribuir');
                const superMetaAuto = fieldValue(k, 'superMetaAuto');
                const goalForCalc = { ...goalsSafe[k], metrica, mensal: fieldValue(k, 'mensal'), superMeta: fieldValue(k, 'superMeta') };
                return (
                  <tr key={k} className="border-b border-slate-900">
                    <td className="py-2 pr-3 whitespace-nowrap">{CAT_LABEL[k]}</td>
                    <td className="py-2 pr-3">
                      <select
                        value={metrica}
                        onChange={(e) => setField(k, 'metrica', e.target.value as 'valor' | 'unidade')}
                        className="rounded-md bg-slate-800 border border-slate-700 px-2 py-1 text-xs"
                      >
                        <option value="valor">R$</option>
                        <option value="unidade">Unidade (un.)</option>
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        value={fieldValue(k, 'mensal')}
                        onChange={(e) => setField(k, 'mensal', Number(e.target.value))}
                        className="w-28 rounded-md bg-slate-800 border border-slate-700 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoRedistribuir}
                          onChange={(e) => setField(k, 'autoRedistribuir', e.target.checked)}
                        />
                        Ativa
                        {autoRedistribuir &&
                          ` · hoje: ${
                            metrica === 'unidade'
                              ? `${Math.round(computeMetaDiariaRedistribuida(goalForCalc, sales, collaborators, 'mensal'))} un.`
                              : fmtMoney(computeMetaDiariaRedistribuida(goalForCalc, sales, collaborators, 'mensal'))
                          }`}
                      </label>
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        value={fieldValue(k, 'superMeta')}
                        onChange={(e) => setField(k, 'superMeta', Number(e.target.value))}
                        className="w-28 rounded-md bg-slate-800 border border-slate-700 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={superMetaAuto}
                          onChange={(e) => setField(k, 'superMetaAuto', e.target.checked)}
                        />
                        Ativa
                        {superMetaAuto &&
                          ` · hoje: ${
                            metrica === 'unidade'
                              ? `${Math.round(computeMetaDiariaRedistribuida(goalForCalc, sales, collaborators, 'superMeta'))} un.`
                              : fmtMoney(computeMetaDiariaRedistribuida(goalForCalc, sales, collaborators, 'superMeta'))
                          }`}
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <button
        onClick={handleSave}
        disabled={saving || Object.keys(edits).length === 0}
        className="self-start rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm disabled:opacity-50"
      >
        {saving ? 'Salvando…' : 'Atualizar metas no sistema'}
      </button>
    </div>
  );
}

// Levmel/Chip aren't CategoryKeys (they're classified by keyword match, not
// sale.grupo — see classification.ts), so they get their own simpler section
// here instead of joining the CAT_KEYS table above: just Meta Mensal / Meta
// Diária in unidades, no super meta / redistribuição automática. Reuses the
// same `goals` table/mutation as the categories above (see useUpdateGoal).
function MetasUnidade() {
  const { profile } = useAuth();
  const { data: goals } = useGoals();
  const updateGoal = useUpdateGoal(profile?.store_id);
  const [edits, setEdits] = useState<Partial<Record<(typeof GOAL_UNIT_KEYS)[number], { mensal: number; diaria: number }>>>({});
  const [saving, setSaving] = useState(false);

  if (!goals) return <div className="text-sm text-slate-500 p-6">Carregando…</div>;

  function fieldValue(k: (typeof GOAL_UNIT_KEYS)[number], field: 'mensal' | 'diaria'): number {
    const edit = edits[k]?.[field];
    if (edit !== undefined) return edit;
    return goals![k]?.[field] ?? 0;
  }
  function setField(k: (typeof GOAL_UNIT_KEYS)[number], field: 'mensal' | 'diaria', value: number) {
    setEdits((prev) => ({ ...prev, [k]: { mensal: fieldValue(k, 'mensal'), diaria: fieldValue(k, 'diaria'), [field]: value } }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      for (const k of GOAL_UNIT_KEYS) {
        const patch = edits[k];
        if (!patch) continue;
        await updateGoal.mutateAsync({ categoria: k, patch: { mensal: patch.mensal, diaria: patch.diaria, metrica: 'unidade' } });
      }
      setEdits({});
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-1">Metas — Levmel / Chip</h3>
        <p className="text-xs text-slate-500 mb-4">
          Meta Mensal e Meta Diária independentes para Levmel e Chip, em unidades. Usadas nos cards, rankings e no
          cálculo de estrelas do card de campeão.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {GOAL_UNIT_KEYS.map((k) => (
            <div key={k} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="font-semibold text-sm mb-2">{UNIT_LABEL[k]}</div>
              <label className="block text-xs text-slate-400 mb-1">Meta Mensal (un.)</label>
              <input
                type="number"
                value={fieldValue(k, 'mensal')}
                onChange={(e) => setField(k, 'mensal', Number(e.target.value))}
                className="w-full rounded-md bg-slate-800 border border-slate-700 px-2 py-1.5 text-sm mb-2"
              />
              <label className="block text-xs text-slate-400 mb-1">Meta Diária (un.)</label>
              <input
                type="number"
                value={fieldValue(k, 'diaria')}
                onChange={(e) => setField(k, 'diaria', Number(e.target.value))}
                className="w-full rounded-md bg-slate-800 border border-slate-700 px-2 py-1.5 text-sm"
              />
            </div>
          ))}
        </div>
      </div>
      <button
        onClick={handleSave}
        disabled={saving || Object.keys(edits).length === 0}
        className="self-start rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm disabled:opacity-50"
      >
        {saving ? 'Salvando…' : 'Atualizar metas no sistema'}
      </button>
    </div>
  );
}

function MetasIndividuais() {
  const { profile } = useAuth();
  const { data: goals } = useGoals();
  const { data: sales } = useSales();
  const { data: collaborators } = useCollaborators();
  const [catKey, setCatKey] = useState<CategoryKey>('DERM');
  const [alvo, setAlvo] = useState<'meta' | 'super'>('meta');
  const { data: individualGoals } = useIndividualGoals(catKey);
  const upsert = useUpsertIndividualGoal(profile?.store_id);
  const [distributing, setDistributing] = useState(false);

  if (!goals || !sales || !collaborators || !individualGoals) {
    return <div className="text-sm text-slate-500 p-6">Carregando…</div>;
  }

  const goal = goals[catKey] ?? defaultGoal(catKey);
  const isUnidade = goal.metrica === 'unidade';
  const campo = alvo === 'meta' ? 'valor_meta' : 'valor_super';
  const byCollaborator = new Map(individualGoals.map((r) => [r.collaborator_id, r]));
  const participantes = collaborators.filter((c) => byCollaborator.get(c.id)?.participa);

  async function handleDistribuir() {
    setDistributing(true);
    try {
      const participantMatriculas = collaborators!
        .filter((c) => byCollaborator.get(c.id)?.participa)
        .map((c) => c.matricula);
      const result = distributeIndividualGoalsAuto(goal, alvo, participantMatriculas, sales!, collaborators!);
      for (const c of collaborators!) {
        if (result[c.matricula] === undefined) continue;
        await upsert.mutateAsync({
          categoria: catKey,
          collaboratorId: c.id,
          patch: { [campo]: result[c.matricula] },
        });
      }
    } finally {
      setDistributing(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="font-semibold mb-1">Metas individuais</h3>
      <p className="text-xs text-slate-500 mb-4">
        Escolha a categoria e o alvo (Meta Geral ou Super Meta), marque quem participa da divisão, e defina o valor
        manualmente ou distribua automaticamente entre os participantes marcados.
      </p>
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Categoria</label>
          <select
            value={catKey}
            onChange={(e) => setCatKey(e.target.value as CategoryKey)}
            className="rounded-md bg-slate-800 border border-slate-700 px-2 py-1.5 text-sm"
          >
            {CAT_KEYS.map((k) => (
              <option key={k} value={k}>
                {CAT_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Alvo</label>
          <select
            value={alvo}
            onChange={(e) => setAlvo(e.target.value as 'meta' | 'super')}
            className="rounded-md bg-slate-800 border border-slate-700 px-2 py-1.5 text-sm"
          >
            <option value="meta">Meta Geral</option>
            <option value="super">Super Meta</option>
          </select>
        </div>
        <button
          onClick={handleDistribuir}
          disabled={distributing}
          className="rounded-lg bg-cyan-500 text-slate-950 font-medium px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {distributing ? 'Distribuindo…' : 'Distribuir automaticamente entre participantes'}
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Métrica desta categoria: <b>{isUnidade ? 'Unidade (un.)' : 'R$'}</b> · Participantes marcados:{' '}
        <b>{participantes.length}</b>
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-800">
              <th className="py-2 pr-3">Participa</th>
              <th className="py-2 pr-3">Colaborador</th>
              <th className="py-2 pr-3">
                {alvo === 'meta' ? 'Meta Geral' : 'Super Meta'} individual ({isUnidade ? 'un.' : 'R$'})
              </th>
            </tr>
          </thead>
          <tbody>
            {collaborators.map((c) => {
              const row = byCollaborator.get(c.id);
              return (
                <tr key={c.id} className="border-b border-slate-900">
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      checked={row?.participa ?? false}
                      onChange={(e) =>
                        upsert.mutate({ categoria: catKey, collaboratorId: c.id, patch: { participa: e.target.checked } })
                      }
                    />
                  </td>
                  <td className="py-2 pr-3">{c.apelido || c.nome}</td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      defaultValue={campo === 'valor_meta' ? row?.valor_meta ?? 0 : row?.valor_super ?? 0}
                      key={`${c.id}-${catKey}-${alvo}-${campo === 'valor_meta' ? row?.valor_meta : row?.valor_super}`}
                      onBlur={(e) =>
                        upsert.mutate({ categoria: catKey, collaboratorId: c.id, patch: { [campo]: Number(e.target.value) } })
                      }
                      className="w-28 rounded-md bg-slate-800 border border-slate-700 px-2 py-1 text-xs"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Commission % per category — only Dermo/Genéricos/Marcas Exclusivas, as
// requested. Own table (commission_rates), separate from goals: a
// percentage applied to sales, not a sales target.
function MetasComissoes() {
  const { profile } = useAuth();
  const { data: rates } = useCommissionRates();
  const updateRate = useUpdateCommissionRate(profile?.store_id);
  const [edits, setEdits] = useState<Record<string, { percentual: number; ativo: boolean }>>({});
  const [saving, setSaving] = useState(false);

  if (!rates) return <div className="text-sm text-slate-500 p-6">Carregando…</div>;

  function slotKey(categoria: 'DERM' | 'GEN' | 'MP', slot: number) {
    return `${categoria}-${slot}`;
  }
  function fieldValue<K extends 'percentual' | 'ativo'>(categoria: 'DERM' | 'GEN' | 'MP', slot: number, field: K): { percentual: number; ativo: boolean }[K] {
    const key = slotKey(categoria, slot);
    const edit = edits[key]?.[field];
    if (edit !== undefined) return edit;
    const stored = rates![categoria].find((r) => r.slot === slot);
    return (stored?.[field] ?? (field === 'ativo' ? false : 0)) as { percentual: number; ativo: boolean }[K];
  }
  function setField(categoria: 'DERM' | 'GEN' | 'MP', slot: number, field: 'percentual' | 'ativo', value: number | boolean) {
    const key = slotKey(categoria, slot);
    setEdits((prev) => ({
      ...prev,
      [key]: { percentual: fieldValue(categoria, slot, 'percentual'), ativo: fieldValue(categoria, slot, 'ativo'), [field]: value },
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      for (const { categoria, slot } of COMMISSION_SLOTS) {
        const patch = edits[slotKey(categoria, slot)];
        if (!patch) continue;
        await updateRate.mutateAsync({ categoria, slot, patch: { percentual: patch.percentual, ativo: patch.ativo } });
      }
      setEdits({});
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-1">Comissões — Dermo / Genéricos / Marcas Exclusivas</h3>
        <p className="text-xs text-slate-500 mb-4">
          Percentual de comissão por categoria, aplicado sobre o valor de cada venda. Marcas Exclusivas aceita até 3
          comissões independentes. "Exibir comissão" liga o botão liga/desliga correspondente na tela de detalhamento
          da categoria — desligado, só o valor normal da venda aparece.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {COMMISSION_SLOTS.map(({ categoria, slot, label }) => (
            <div key={slotKey(categoria, slot)} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="font-semibold text-sm mb-2">{label}</div>
              <label className="block text-xs text-slate-400 mb-1">Percentual (%)</label>
              <input
                type="number"
                step="0.1"
                value={fieldValue(categoria, slot, 'percentual')}
                onChange={(e) => setField(categoria, slot, 'percentual', Number(e.target.value))}
                className="w-full rounded-md bg-slate-800 border border-slate-700 px-2 py-1.5 text-sm mb-2"
              />
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={fieldValue(categoria, slot, 'ativo')}
                  onChange={(e) => setField(categoria, slot, 'ativo', e.target.checked)}
                />
                Exibir comissão nesta categoria
              </label>
            </div>
          ))}
        </div>
      </div>
      <button
        onClick={handleSave}
        disabled={saving || Object.keys(edits).length === 0}
        className="self-start rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm disabled:opacity-50"
      >
        {saving ? 'Salvando…' : 'Atualizar comissões no sistema'}
      </button>
    </div>
  );
}
