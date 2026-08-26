import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { monthFirstISO, monthLastISO } from '../lib/dateRange';

export type RankFilter = 'ALL' | 'DERM' | 'GEN' | 'MP' | 'MER' | 'LEVMEL' | 'CHIP' | `DIN:${string}`;

interface DateRangeState {
  refYear: number;
  refMonth: number; // 0-indexed
  dashFrom: string;
  dashTo: string;
  /** Whole-month filter active (legacy `_modoGeral`) — when true, no single
   * day/range is "selected" in the calendar even though dashFrom/dashTo span
   * the month. */
  modoGeral: boolean;
  /** "Busca período" toggle — when on, day-cell clicks build a from/to range
   * (first click = anchor, second click = range) instead of picking a single day. */
  buscaPeriodoOpen: boolean;
  rankFilter: RankFilter;
  setModoGeral: () => void;
  setDay: (iso: string) => void;
  setRange: (from: string, to: string) => void;
  goToMonth: (year: number, month: number) => void;
  /** Month-grid button click (legacy `data-quickmonth`): sets refMonth, then
   * applies setModoGeral() semantics for that month within the current refYear. */
  quickMonth: (month: number) => void;
  /** Day-cell click, respecting `buscaPeriodoOpen` (single day vs range-anchor). */
  pickDay: (iso: string) => void;
  toggleBuscaPeriodo: () => void;
  setRankFilter: (f: RankFilter) => void;
}

const DateRangeContext = createContext<DateRangeState | undefined>(undefined);

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const today = new Date();
  const [refYear, setRefYear] = useState(today.getFullYear());
  const [refMonth, setRefMonth] = useState(today.getMonth());
  const [dashFrom, setDashFrom] = useState(monthFirstISO(refYear, refMonth));
  const [dashTo, setDashTo] = useState(monthLastISO(refYear, refMonth));
  const [modoGeral, setModoGeralFlag] = useState(true);
  const [buscaPeriodoOpen, setBuscaPeriodoOpen] = useState(false);
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const [rankFilter, setRankFilterState] = useState<RankFilter>('ALL');

  const value = useMemo<DateRangeState>(
    () => ({
      refYear,
      refMonth,
      dashFrom,
      dashTo,
      modoGeral,
      buscaPeriodoOpen,
      rankFilter,
      setModoGeral: () => {
        setDashFrom(monthFirstISO(refYear, refMonth));
        setDashTo(monthLastISO(refYear, refMonth));
        setModoGeralFlag(true);
      },
      setDay: (iso: string) => {
        setDashFrom(iso);
        setDashTo(iso);
        setModoGeralFlag(false);
      },
      setRange: (from: string, to: string) => {
        setDashFrom(from);
        setDashTo(to);
        setModoGeralFlag(false);
      },
      goToMonth: (year: number, month: number) => {
        setRefYear(year);
        setRefMonth(month);
        setDashFrom(monthFirstISO(year, month));
        setDashTo(monthLastISO(year, month));
      },
      quickMonth: (month: number) => {
        setRefMonth(month);
        setDashFrom(monthFirstISO(refYear, month));
        setDashTo(monthLastISO(refYear, month));
        setModoGeralFlag(true);
      },
      pickDay: (iso: string) => {
        if (buscaPeriodoOpen) {
          if (!rangeAnchor) {
            setRangeAnchor(iso);
            setDashFrom(iso);
            setDashTo(iso);
          } else {
            const a = rangeAnchor;
            const b = iso;
            setDashFrom(a < b ? a : b);
            setDashTo(a < b ? b : a);
            setRangeAnchor(null);
          }
        } else {
          setDashFrom(iso);
          setDashTo(iso);
        }
        setModoGeralFlag(false);
      },
      toggleBuscaPeriodo: () => {
        setBuscaPeriodoOpen((v) => !v);
        setRangeAnchor(null);
      },
      setRankFilter: setRankFilterState,
    }),
    [refYear, refMonth, dashFrom, dashTo, modoGeral, buscaPeriodoOpen, rangeAnchor, rankFilter],
  );

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>;
}

export function useDateRange(): DateRangeState {
  const ctx = useContext(DateRangeContext);
  if (!ctx) throw new Error('useDateRange must be used within a DateRangeProvider');
  return ctx;
}
