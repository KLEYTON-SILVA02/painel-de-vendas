import { PodiumStaircase, type StaircaseRow } from '../ranking/PodiumStaircase';

// Mobile ranking layout: top 3 side by side as the real medal-color podium
// capsules (escadinha variant, undecorated — passing getSub would switch it
// to the simpler BIOSINTÉTICA card style), the rest as full-width horizontal
// bars stacked below (the existing 'lista' variant already renders that way).
export function MobileRankingBoard<T extends StaircaseRow>({
  ranking,
  getValue,
  formatValue,
  getSub,
}: {
  ranking: T[];
  getValue: (r: T) => number;
  formatValue: (v: number) => string;
  getSub?: (r: T) => string;
}) {
  if (!ranking.length) {
    return <div className="text-sm text-slate-500 py-6 text-center">Sem vendas para este período.</div>;
  }

  const top3 = ranking.slice(0, 3);
  const rest = ranking.slice(3);

  return (
    <div className="flex flex-col gap-3">
      <PodiumStaircase ranking={top3} getValue={getValue} formatValue={formatValue} variant="escadinha" />
      {rest.length > 0 && <PodiumStaircase ranking={rest} getValue={getValue} formatValue={formatValue} variant="lista" getSub={getSub} />}
    </div>
  );
}
