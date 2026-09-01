import { useState } from 'react';

function formatReais(v: number): string {
  const cents = Math.round((Number(v) || 0) * 100);
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseDigitsToReais(raw: string): number {
  const digits = raw.replace(/\D/g, '');
  return digits ? parseInt(digits, 10) / 100 : 0;
}

/** A text input that live-formats a money value with pt-BR thousand
 * separators and 2 decimal places as the user types, treating the last two
 * typed digits as centavos (the standard Brazilian currency-mask UX) — so
 * typing "120000000" reads back as "1.200.000,00", matching how `fmtMoney`
 * already displays saved values elsewhere. `onChange` receives the parsed
 * value in reais (a plain number), so callers don't need to change how they
 * store it.
 *
 * `commitOn="blur"` defers the `onChange` call to blur instead of firing on
 * every keystroke — for callers whose onChange directly triggers a network
 * mutation, where a per-keystroke commit would spam requests and fight the
 * input's own display with a query-refetch racing the user's typing.
 */
export function MoneyInput({
  value,
  onChange,
  commitOn = 'change',
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  commitOn?: 'change' | 'blur';
  className?: string;
}) {
  const [text, setText] = useState(() => formatReais(value));

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={(e) => {
        const next = parseDigitsToReais(e.target.value);
        setText(formatReais(next));
        if (commitOn === 'change') onChange(next);
      }}
      onBlur={(e) => {
        if (commitOn === 'blur') onChange(parseDigitsToReais(e.target.value));
      }}
      className={className}
    />
  );
}
