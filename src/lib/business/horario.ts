export const DIA_KEYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const;
export type DiaKey = (typeof DIA_KEYS)[number];
export const DIA_LABELS: Record<DiaKey, string> = {
  dom: 'Domingo',
  seg: 'Segunda',
  ter: 'Terça',
  qua: 'Quarta',
  qui: 'Quinta',
  sex: 'Sexta',
  sab: 'Sábado',
};

export interface DiaHorario {
  ativo: boolean;
  abre: string;
  fecha: string;
}

export type Horario = Record<DiaKey, DiaHorario> & {
  feriado: { abre: string; fecha: string };
};

export interface ClosingClockState {
  status: 'open' | 'closed';
  label: string;
}

/** Ported 1:1 from legacy/index-original.html's updateClosingClock() — the
 * header bar's live "closes in HH:MM:SS" countdown, with a feriado (holiday)
 * override that replaces the weekday's hours when today is in feriadosDatas. */
export function computeClosingClockState(horario: Horario, feriadosDatas: string[], now: Date): ClosingClockState {
  const hojeISO = now.toISOString().slice(0, 10);
  const isFeriado = feriadosDatas.includes(hojeISO);
  const diaHoje = DIA_KEYS[now.getDay()];
  const cfg = isFeriado ? { ativo: true, ...horario.feriado } : horario[diaHoje] || { ativo: false, abre: '08:00', fecha: '18:00' };
  const abertoHoje = !!cfg.ativo;
  const [abreH, abreM] = (cfg.abre || '08:00').split(':').map(Number);
  const [fechaH, fechaM] = (cfg.fecha || '18:00').split(':').map(Number);
  const abreDate = new Date(now);
  abreDate.setHours(abreH || 0, abreM || 0, 0, 0);
  const fechaDate = new Date(now);
  fechaDate.setHours(fechaH || 0, fechaM || 0, 0, 0);

  if (abertoHoje && now >= abreDate && now < fechaDate) {
    const diffMs = fechaDate.getTime() - now.getTime();
    const hh = String(Math.floor(diffMs / 3600000)).padStart(2, '0');
    const mm = String(Math.floor((diffMs % 3600000) / 60000)).padStart(2, '0');
    const ss = String(Math.floor((diffMs % 60000) / 1000)).padStart(2, '0');
    return { status: 'open', label: `FECHA EM ${hh}:${mm}:${ss}${isFeriado ? ' (feriado)' : ''}` };
  }
  return { status: 'closed', label: 'FECHADO' };
}
