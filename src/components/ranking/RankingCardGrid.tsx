import { useId, useState } from 'react';
import { TrendArrow } from '../TrendArrow';
import type { StaircaseRow } from './PodiumStaircase';
import { CARDS_PER_PAGE, cardProgress, fitFontCqw, pageCount } from './rankingCard';
import './RankingCardGrid.css';

// Geometria do arco, medida no modelo SVG do usuário (viewBox 214,68 × 269):
// sobe pela lateral esquerda, curva por cima da foto (centro 107,34/110,70)
// e desce até a altura do centro, no lado direito. Gradiente vertical FIXO
// (vermelho embaixo → verde em cima) — o arco só "revela" mais ou menos dele.
const VIEW_W = 214.68;
const VIEW_H = 269;
const ARC_PATH = 'M 18.355 261.56 V 110.7 A 88.985 88.985 0 0 1 196.325 110.7';
const ARC_STROKE = 25.33;

export interface RankingCardSlot<T> {
  row: T;
  pos: number;
}

function Gauge({ progress }: { progress: number }) {
  // useId devolve ":r1:" — os dois pontos atrapalham url(#...) em alguns navegadores.
  const uid = useId().replace(/:/g, '');
  const gradId = `rcg-${uid}`;
  const clipId = `rcc-${uid}`;
  return (
    <svg className="rc-gauge" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1="88.28" y1="261.55" x2="88.28" y2="9.05">
          <stop offset="0" stopColor="#DE0000" />
          <stop offset="0.188235" stopColor="#EE6F1D" />
          <stop offset="0.34902" stopColor="#FFDE3B" />
          <stop offset="0.678431" stopColor="#1AE20F" />
          <stop offset="1" stopColor="#00FF11" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect x="5.69" y="0" width="203.3" height="261.56" rx="16.41" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`} fill="none" strokeWidth={ARC_STROKE}>
        <path d={ARC_PATH} pathLength={1} stroke="#1B2133" />
        {progress > 0 && <path d={ARC_PATH} pathLength={1} stroke={`url(#${gradId})`} strokeDasharray={`${progress} 1`} />}
      </g>
    </svg>
  );
}

function RankingCard<T extends StaircaseRow>({
  slot,
  leaderValue,
  getValue,
  formatValue,
  getSecondaryValue,
  formatSecondaryValue,
  getPreviousValue,
}: {
  slot: RankingCardSlot<T>;
  leaderValue: number;
  getValue: (r: T) => number;
  formatValue: (v: number) => string;
  getSecondaryValue?: (r: T) => number;
  formatSecondaryValue?: (v: number) => string;
  getPreviousValue?: (r: T) => number | null | undefined;
}) {
  const { row, pos } = slot;
  const value = getValue(row);
  const valueText = formatValue(value);
  const name = row.apelido || row.nome;
  const secondaryText = getSecondaryValue && formatSecondaryValue ? formatSecondaryValue(getSecondaryValue(row)) : null;
  const hasTrend = Boolean(getPreviousValue);
  const className = ['rc-card', secondaryText ? 'rc-card--sec' : '', hasTrend ? '' : 'rc-card--no-trend'].filter(Boolean).join(' ');
  return (
    <div className={className} title={`${pos}º · ${name} · ${valueText}`}>
      <Gauge progress={cardProgress(value, leaderValue)} />
      <span className="rc-pos">{pos}</span>
      <div className="rc-photo">{row.foto && <img src={row.foto} alt="" loading="lazy" />}</div>
      <span className="rc-name">{name}</span>
      {secondaryText && <span className="rc-sec">{secondaryText}</span>}
      <span className="rc-value" style={{ fontSize: `${fitFontCqw(valueText, 11.09, 71, 6)}cqw` }}>
        {valueText}
      </span>
      {getPreviousValue && (
        <span className="rc-trend">
          <TrendArrow current={value} previous={getPreviousValue(row)} size="11.5cqw" />
        </span>
      )}
    </div>
  );
}

/** Colocações 4+ do ranking "Premium" como cards retangulares em grade
 * (5 colunas × 2 linhas por página, paginados). Cada arco mostra o valor do
 * colaborador em relação ao 1º colocado (`leaderValue`). */
export function RankingCardGrid<T extends StaircaseRow>({
  slots,
  leaderValue,
  getValue,
  formatValue,
  getSecondaryValue,
  formatSecondaryValue,
  getPreviousValue,
  reservePagerRow,
}: {
  slots: RankingCardSlot<T>[];
  leaderValue: number;
  getValue: (r: T) => number;
  formatValue: (v: number) => string;
  getSecondaryValue?: (r: T) => number;
  formatSecondaryValue?: (v: number) => string;
  getPreviousValue?: (r: T) => number | null | undefined;
  /** Quando há botões embaixo do pódio (footer), reserva uma linha de mesma
   * altura sob a grade — assim a paginação fica alinhada com eles e a grade
   * termina junto com o quadro do pódio. */
  reservePagerRow?: boolean;
}) {
  const [page, setPage] = useState(0);
  const pages = pageCount(slots.length);
  const current = Math.min(page, pages - 1);
  const visible = slots.slice(current * CARDS_PER_PAGE, (current + 1) * CARDS_PER_PAGE);

  return (
    <div className="rc-wrap">
      <div className="rc-grid">
        {visible.map((slot) => (
          <RankingCard
            key={slot.row.matricula}
            slot={slot}
            leaderValue={leaderValue}
            getValue={getValue}
            formatValue={formatValue}
            getSecondaryValue={getSecondaryValue}
            formatSecondaryValue={formatSecondaryValue}
            getPreviousValue={getPreviousValue}
          />
        ))}
      </div>
      {(pages > 1 || reservePagerRow) && (
        <nav className={`rc-pager${reservePagerRow ? ' rc-pager--reserve' : ''}`} aria-label="Páginas do ranking">
          {pages > 1 &&
            Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Página ${i + 1}`}
                aria-current={i === current ? 'page' : undefined}
                onClick={() => setPage(i)}
              >
                {i + 1}
              </button>
            ))}
        </nav>
      )}
    </div>
  );
}
