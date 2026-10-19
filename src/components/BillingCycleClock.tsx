import { useState } from 'react';
import { BILLING_WARNING_DAYS, daysRemaining, type BillingCycleRow } from '../lib/business/billingCycle';
import { todayISO } from '../lib/dateRange';

// Ícone informativo de ciclo de uso — mesmo estilo visual do ClosingClock,
// mas contando dias (não horas) até o fim do ciclo de uso da loja. Só
// aparece quando faltam BILLING_WARNING_DAYS dias ou menos; nunca aparece
// para uma loja sem nenhum ciclo cadastrado (nada a avisar ainda). Pode ser
// recolhido a só o ícone — a própria loja nunca vê as outras, isto é
// puramente informativo sobre o próprio ciclo.
export function BillingCycleClock({ cycle }: { cycle: BillingCycleRow }) {
  const [collapsed, setCollapsed] = useState(false);
  const remaining = daysRemaining(cycle.ends_at, todayISO());

  if (remaining > BILLING_WARNING_DAYS) return null;

  const urgent = remaining <= 3;
  const color = urgent ? '#ff3df0' : '#ffb700';
  const label =
    remaining < 0
      ? `Ciclo vencido há ${Math.abs(remaining)} dia(s)`
      : remaining === 0
        ? 'Ciclo termina hoje'
        : `${remaining} dia(s) p/ regularizar`;

  return (
    <button
      type="button"
      onClick={() => setCollapsed((v) => !v)}
      title={`${label} — clique para ${collapsed ? 'expandir' : 'recolher'}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: '#04120c',
        border: `1px solid ${color}`,
        borderRadius: 10,
        padding: collapsed ? '5px 8px' : '5px 10px',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
        color,
        textShadow: `0 0 6px ${color}99`,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 13 }}>🕒</span>
      {!collapsed && label}
    </button>
  );
}
