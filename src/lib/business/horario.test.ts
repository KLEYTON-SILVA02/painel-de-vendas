import { describe, expect, it } from 'vitest';
import { computeClosingClockState, type Horario } from './horario';

const baseHorario: Horario = {
  dom: { ativo: false, abre: '08:00', fecha: '18:00' },
  seg: { ativo: true, abre: '08:00', fecha: '18:00' },
  ter: { ativo: true, abre: '08:00', fecha: '18:00' },
  qua: { ativo: true, abre: '08:00', fecha: '18:00' },
  qui: { ativo: true, abre: '08:00', fecha: '18:00' },
  sex: { ativo: true, abre: '08:00', fecha: '18:00' },
  sab: { ativo: true, abre: '08:00', fecha: '18:00' },
  feriado: { abre: '08:00', fecha: '14:00' },
};

describe('computeClosingClockState', () => {
  it('counts down to closing time on a normal open weekday', () => {
    // 2026-08-24 is a Monday ('seg').
    const now = new Date('2026-08-24T17:30:00');
    const state = computeClosingClockState(baseHorario, [], now);
    expect(state.status).toBe('open');
    expect(state.label).toBe('FECHA EM 00:30:00');
  });

  it('reports closed outside business hours', () => {
    const now = new Date('2026-08-24T19:00:00');
    expect(computeClosingClockState(baseHorario, [], now).status).toBe('closed');
  });

  it('reports closed on an inactive weekday (Sunday)', () => {
    const now = new Date('2026-08-23T10:00:00'); // Sunday
    expect(computeClosingClockState(baseHorario, [], now).status).toBe('closed');
  });

  it('applies the feriado override and marks the label, even on an otherwise-inactive day', () => {
    const now = new Date('2026-08-23T09:00:00'); // Sunday, but marked feriado
    const state = computeClosingClockState(baseHorario, ['2026-08-23'], now);
    expect(state.status).toBe('open');
    expect(state.label).toBe('FECHA EM 05:00:00 (feriado)');
  });
});
