import { useId, useLayoutEffect, useRef, useState } from 'react';
import { TrendArrow } from '../TrendArrow';
import type { StaircaseRow } from './PodiumStaircase';
import { CARDS_PER_PAGE, cardProgress, cardsPerPage, columnsForWidth, fitFontCqw, pageCount, type CardLayout } from './rankingCard';
import './RankingCardGrid.css';

// Geometria do arco, medida no modelo SVG do usuário (viewBox 214,68 × 269):
// sobe pela lateral esquerda, curva por cima da foto (centro 107,34/110,70)
// e desce até a altura do centro, no lado direito. Gradiente vertical FIXO
// (vermelho embaixo → verde em cima) — o arco só "revela" mais ou menos dele.
const VIEW_W = 214.68;
const VIEW_H = 269;
const ARC_STROKE = 25.33;

export interface RankingCardSlot<T> {
  row: T;
  pos: number;
  /** 'unassigned' = card especial "sem código/vendedor" (Biosintética): soma das
   * vendas que não pertencem a nenhum colaborador cadastrado. Sem número de
   * posição, sem foto e sem seta de tendência. */
  kind?: 'unassigned';
  /** Nome exibido no card especial (ex.: "SEM CÓDIGO"). */
  label?: string;
}

/** Tamanho (px) de um elemento, acompanhando mudanças (ResizeObserver). Só mede
 * quando `enabled`. */
function useElementSize<E extends HTMLElement>(enabled: boolean) {
  const ref = useRef<E>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const read = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [enabled]);
  return [ref, size] as const;
}

// Card baixo = viewBox 214,68 × 269. No card comprido a mesma largura (214,68)
// ganha altura extra: só a parte reta da lateral esquerda cresce — o arco por
// cima da foto e o raio dos cantos continuam idênticos (nada é esticado).
function Gauge({ progress, height = VIEW_H }: { progress: number; height?: number }) {
  // useId devolve ":r1:" — os dois pontos atrapalham url(#...) em alguns navegadores.
  const uid = useId().replace(/:/g, '');
  const gradId = `rcg-${uid}`;
  const clipId = `rcc-${uid}`;
  const bottom = height - 7.44;
  const arcPath = `M 18.355 ${bottom} V 110.7 A 88.985 88.985 0 0 1 196.325 110.7`;
  return (
    <svg className="rc-gauge" viewBox={`0 0 ${VIEW_W} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1="88.28" y1={bottom - 0.01} x2="88.28" y2="9.05">
          <stop offset="0" stopColor="#DE0000" />
          <stop offset="0.188235" stopColor="#EE6F1D" />
          <stop offset="0.34902" stopColor="#FFDE3B" />
          <stop offset="0.678431" stopColor="#1AE20F" />
          <stop offset="1" stopColor="#00FF11" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect x="5.69" y="0" width="203.3" height={bottom} rx="16.41" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`} fill="none" strokeWidth={ARC_STROKE}>
        <path d={arcPath} pathLength={1} stroke="#1B2133" />
        {progress > 0 && <path d={arcPath} pathLength={1} stroke={`url(#${gradId})`} strokeDasharray={`${progress} 1`} />}
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
  layout,
}: {
  slot: RankingCardSlot<T>;
  layout: CardLayout;
  leaderValue: number;
  getValue: (r: T) => number;
  formatValue: (v: number) => string;
  getSecondaryValue?: (r: T) => number;
  formatSecondaryValue?: (v: number) => string;
  getPreviousValue?: (r: T) => number | null | undefined;
}) {
  const { row, pos } = slot;
  const unassigned = slot.kind === 'unassigned';
  const tall = layout === 'tall';
  const value = getValue(row);
  const valueText = formatValue(value);
  const name = unassigned ? (slot.label ?? 'SEM CÓDIGO') : row.apelido || row.nome;
  const secondaryText = getSecondaryValue && formatSecondaryValue ? formatSecondaryValue(getSecondaryValue(row)) : null;
  const hasTrend = Boolean(getPreviousValue) && !unassigned;
  const className = [
    'rc-card',
    tall ? 'rc-card--tall' : '',
    unassigned ? 'rc-card--unassigned' : '',
    secondaryText ? 'rc-card--sec' : '',
    hasTrend ? '' : 'rc-card--no-trend',
  ]
    .filter(Boolean)
    .join(' ');
  // Card comprido: a altura vem da grade (= altura do pódio), então o desenho do
  // arco e o raio dos cantos são recalculados a partir do tamanho real.
  const [ref, size] = useElementSize<HTMLDivElement>(tall);
  const gaugeHeight = size && size.w > 0 ? Math.max(VIEW_H, (VIEW_W * size.h) / size.w) : VIEW_H;
  const radius = tall && size ? { borderRadius: size.w * 0.1055 } : undefined;
  return (
    <div
      ref={ref}
      className={className}
      style={radius}
      title={unassigned ? `${name} · ${valueText}` : `${pos}º · ${name} · ${valueText}`}
    >
      <Gauge progress={cardProgress(value, leaderValue)} height={tall ? gaugeHeight : VIEW_H} />
      {!unassigned && <span className="rc-pos">{pos}</span>}
      <div className="rc-photo">
        {unassigned ? <span className="rc-photo-empty">?</span> : row.foto && <img src={row.foto} alt="" loading="lazy" />}
      </div>
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

/** Colocações 4+ do ranking "Premium" como cards retangulares em grade,
 * paginados. Cada arco mostra o valor do colaborador em relação ao 1º
 * colocado (`leaderValue`).
 *
 * `layout` 'grid' (padrão): 2 linhas de cards baixos. 'tall': 1 linha de cards
 * compridos, da altura do pódio ao lado (Biosintética).
 *
 * Quantas colunas cabem vem da largura real da área (ver `columnsForWidth`):
 * com o menu lateral aberto a área fica mais estreita, então cabem menos
 * colunas e os cards que sobram vão para a página seguinte — o tamanho de cada
 * card não muda. */
export function RankingCardGrid<T extends StaircaseRow>({
  slots,
  leaderValue,
  getValue,
  formatValue,
  getSecondaryValue,
  formatSecondaryValue,
  getPreviousValue,
  reservePagerRow,
  fixedColumns,
  layout = 'grid',
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
  /** Fixa o número de cards por linha (a versão mobile usa 2). Sem isso a grade
   * escolhe sozinha pela largura da área. */
  fixedColumns?: 2;
  layout?: CardLayout;
}) {
  const [page, setPage] = useState(0);
  const [wrapRef, wrapSize] = useElementSize<HTMLDivElement>(!fixedColumns);
  const columns = fixedColumns ?? columnsForWidth(wrapSize?.w ?? 0, layout);
  const perPage = fixedColumns ? CARDS_PER_PAGE : cardsPerPage(columns, layout);
  const pages = pageCount(slots.length, perPage);
  const current = Math.min(page, pages - 1);
  const visible = slots.slice(current * perPage, (current + 1) * perPage);

  return (
    <div ref={wrapRef} className={`rc-wrap${layout === 'tall' ? ' rc-wrap--tall' : ''}`}>
      <div
        className={`rc-grid${fixedColumns ? ` rc-grid--cols-${fixedColumns}` : ''}${layout === 'tall' ? ' rc-grid--tall' : ''}`}
        style={fixedColumns ? undefined : { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {visible.map((slot) => (
          <RankingCard
            key={slot.kind === 'unassigned' ? '__unassigned__' : slot.row.matricula}
            slot={slot}
            layout={layout}
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
