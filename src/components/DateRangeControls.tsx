import { todayISO } from '../lib/dateRange';
import { monthName } from '../lib/format';
import { useDateRange } from '../routes/DateRangeContext';

export function DateRangeControls() {
  const { refYear, refMonth, dashFrom, dashTo, goToMonth, setModoGeral, setDay } = useDateRange();
  const isMonthMode = dashFrom !== dashTo;
  const today = todayISO();

  function prevMonth() {
    const m = refMonth === 0 ? 11 : refMonth - 1;
    const y = refMonth === 0 ? refYear - 1 : refYear;
    goToMonth(y, m);
  }
  function nextMonth() {
    const m = refMonth === 11 ? 0 : refMonth + 1;
    const y = refMonth === 11 ? refYear + 1 : refYear;
    goToMonth(y, m);
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <button onClick={prevMonth} className="rounded-md border border-slate-700 px-2 py-1 hover:bg-slate-800">
        ‹
      </button>
      <div className="w-28 text-center font-medium">
        {monthName(refMonth)}/{refYear}
      </div>
      <button onClick={nextMonth} className="rounded-md border border-slate-700 px-2 py-1 hover:bg-slate-800">
        ›
      </button>
      <button
        onClick={setModoGeral}
        className={`rounded-md border px-3 py-1 ${isMonthMode ? 'border-cyan-500 text-cyan-400' : 'border-slate-700 text-slate-400'}`}
      >
        Mês inteiro
      </button>
      <button
        onClick={() => setDay(today)}
        className={`rounded-md border px-3 py-1 ${!isMonthMode ? 'border-cyan-500 text-cyan-400' : 'border-slate-700 text-slate-400'}`}
      >
        Hoje
      </button>
    </div>
  );
}
