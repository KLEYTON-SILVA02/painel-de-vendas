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
