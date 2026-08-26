import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { monthFirstISO, monthLastISO } from '../lib/dateRange';

export type RankFilter = 'ALL' | 'DERM' | 'GEN' | 'MP' | 'MER' | 'LEVMEL' | 'CHIP' | `DIN:${string}`;

interface DateRangeState {
  refYear: number;
  refMonth: number; // 0-indexed
  dashFrom: string;
  dashTo: string;
  rankFilter: RankFilter;
  setModoGeral: () => void;
  setDay: (iso: string) => void;
  setRange: (from: string, to: string) => void;
  goToMonth: (year: number, month: number) => void;
  setRankFilter: (f: RankFilter) => void;
}

const DateRangeContext = createContext<DateRangeState | undefined>(undefined);

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const today = new Date();
  const [refYear, setRefYear] = useState(today.getFullYear());
  const [refMonth, setRefMonth] = useState(today.getMonth());
  const [dashFrom, setDashFrom] = useState(monthFirstISO(refYear, refMonth));
  const [dashTo, setDashTo] = useState(monthLastISO(refYear, refMonth));
  const [rankFilter, setRankFilterState] = useState<RankFilter>('ALL');

  const value = useMemo<DateRangeState>(
    () => ({
      refYear,
      refMonth,
      dashFrom,
      dashTo,
      rankFilter,
      setModoGeral: () => {
        setDashFrom(monthFirstISO(refYear, refMonth));
        setDashTo(monthLastISO(refYear, refMonth));
      },
      setDay: (iso: string) => {
        setDashFrom(iso);
        setDashTo(iso);
      },
      setRange: (from: string, to: string) => {
        setDashFrom(from);
        setDashTo(to);
      },
      goToMonth: (year: number, month: number) => {
        setRefYear(year);
        setRefMonth(month);
        setDashFrom(monthFirstISO(year, month));
        setDashTo(monthLastISO(year, month));
      },
      setRankFilter: setRankFilterState,
    }),
    [refYear, refMonth, dashFrom, dashTo, rankFilter],
  );

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>;
}

export function useDateRange(): DateRangeState {
  const ctx = useContext(DateRangeContext);
  if (!ctx) throw new Error('useDateRange must be used within a DateRangeProvider');
  return ctx;
}
