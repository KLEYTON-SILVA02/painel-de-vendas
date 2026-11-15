import { RankingCardGrid } from './RankingCardGrid';
import type { StaircaseRow } from './PodiumStaircase';

/** Lista de colocação das telas mobile (Ranking, Categoria, Bio, Mercadoria,
 * Unidade): os mesmos cards do ranking Premium (arco de progresso, foto, nome,
 * valor), sempre 2 por linha. O arco compara cada valor com o do 1º colocado. */
export function MobileRankingCards<T extends StaircaseRow>({
  rows,
  getValue,
  formatValue,
  getSecondaryValue,
  formatSecondaryValue,
}: {
  rows: T[];
  getValue: (r: T) => number;
  formatValue: (v: number) => string;
  getSecondaryValue?: (r: T) => number;
  formatSecondaryValue?: (v: number) => string;
}) {
  const slots = rows.map((row, i) => ({ row, pos: i + 1 }));
  const leaderValue = rows.reduce((max, r) => Math.max(max, getValue(r)), 0);
  return (
    <RankingCardGrid
      slots={slots}
      leaderValue={leaderValue}
      getValue={getValue}
      formatValue={formatValue}
      getSecondaryValue={getSecondaryValue}
      formatSecondaryValue={formatSecondaryValue}
      fixedColumns={2}
    />
  );
}
