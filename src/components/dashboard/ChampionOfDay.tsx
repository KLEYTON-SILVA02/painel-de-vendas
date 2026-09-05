import { useEffect, useMemo, useRef, useState } from 'react';
import { TrophyIcon } from '../icons/NavIcons';
import { computeChampionStars, type ChampionStar } from '../../lib/business/champion';
import type { CategoryKey } from '../../lib/business/classification';
import { computeSummary } from '../../lib/business/summary';
import type { SummaryRow } from '../../lib/business/types';
import { generateChampionCardBlob } from '../../lib/championImage';
import { monthFirstISO, monthLastISO } from '../../lib/dateRange';
import { fmtMoney, monthName } from '../../lib/format';
import { tryCopyImage } from '../../lib/rankingImage';
import { useCollaborators, useSales, useSpecialLists, useStore } from '../../lib/queries';
import { useDateRange } from '../../routes/DateRangeContext';
import { RankingImageModal } from '../ranking/RankingImageModal';

const CHAMPION_CAT_LABEL: Record<CategoryKey | 'LEVMEL' | 'CHIP', string> = {
  DERM: 'Dermo',
  GEN: 'Gen/Sim',
  MP: 'Marcas Excl.',
  MER: 'Merc. Geral',
  LEVMEL: 'Levmel',
  CHIP: 'Chip',
};

// Same "campeão do dia" pick DashboardPage's ranking already drove (follows
// its rankFilter, from the shared DateRangeContext) — lives here now so
// ChampionHeaderButton can render it from AppShell's top bar, on every admin
// screen, without depending on DashboardPage being mounted.
function useChampionOfDay() {
  const { data: sales } = useSales();
  const { data: collaborators } = useCollaborators();
  const { data: specialLists } = useSpecialLists();
  const { data: store } = useStore();
  const { dashFrom, dashTo, refYear, refMonth, rankFilter } = useDateRange();

  const salesData = sales ?? [];
  const collaboratorsData = collaborators ?? [];
  const modoDia = dashFrom === dashTo;
  const monthFirst = monthFirstISO(refYear, refMonth);
  const monthLast = monthLastISO(refYear, refMonth);
  const campeaoFrom = modoDia ? dashFrom : monthFirst;
  const campeaoTo = modoDia ? dashTo : monthLast;
  const isUnitChampionCat = rankFilter === 'LEVMEL' || rankFilter === 'CHIP';
  const championCatFilter = rankFilter === 'ALL' || rankFilter.startsWith('DIN:') ? undefined : (rankFilter as CategoryKey | 'LEVMEL' | 'CHIP');

  const campeaoSource = useMemo(
    () => computeSummary(salesData, collaboratorsData, campeaoFrom, campeaoTo, championCatFilter, specialLists),
    [salesData, collaboratorsData, campeaoFrom, campeaoTo, championCatFilter, specialLists],
  );
  const campeao =
    campeaoSource.length && (isUnitChampionCat ? campeaoSource[0].itens > 0 : campeaoSource[0].valor > 0) ? campeaoSource[0] : null;
  // computeChampionStars scores 5 categories, each scanning `sales` day by
  // day across the whole campeaoFrom..campeaoTo range — memoized so it only
  // re-runs when the underlying data/period actually changes, not on every
  // render of every admin screen (this hook now runs from the shared header).
  const campeaoMatricula = campeao?.matricula;
  const campeaoStars = useMemo(
    () =>
      campeaoMatricula
        ? computeChampionStars(campeaoMatricula, salesData, collaboratorsData, specialLists, campeaoFrom, campeaoTo)
        : null,
    [campeaoMatricula, salesData, collaboratorsData, specialLists, campeaoFrom, campeaoTo],
  );

  const campeaoBase = modoDia ? `Campeão do dia — ${dashFrom.split('-').reverse().join('/')}` : `Campeão — ${monthName(refMonth)}/${refYear}`;
  const campeaoLabel = championCatFilter ? `${campeaoBase} · ${CHAMPION_CAT_LABEL[championCatFilter]}` : campeaoBase;

  return { campeao, campeaoLabel, campeaoStars, storeName: store?.nome_loja };
}

// Small yellow-bordered trophy button living in AppShell's top header, next
// to "Galeria de Conquistas" — opens the full celebration (confetti + stars)
// on click. Renders nothing until there's an actual champion for the current
// period/filter (no sales yet → no button).
export function ChampionHeaderButton() {
  const [open, setOpen] = useState(false);
  const { campeao, campeaoLabel, campeaoStars, storeName } = useChampionOfDay();

  if (!campeao) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Ver Campeão do dia"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 34,
          height: 34,
          background: '#0b0e1d',
          border: '1px solid #ffb700',
          boxShadow: '0 0 12px rgba(255,183,0,.35)',
          borderRadius: 10,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <TrophyIcon width={18} height={18} style={{ color: '#ffb700' }} />
      </button>
      {open && (
        <ChampionCelebrationModal
          campeao={campeao}
          campeaoLabel={campeaoLabel}
          campeaoStars={campeaoStars}
          storeName={storeName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// Full-screen celebration opened from ChampionHeaderButton — same confetti
// particle animation as ConquistaCelebrationOverlay (components/
// ConquistaCelebration.tsx), kept as a separate self-contained copy since
// this one centers on the champion's stars/image-generation flow instead of
// a single conquista tier. Stars fill left-to-right naturally: campeaoStars
// is already ordered that way (computeChampionStars), so `.map()` renders
// them in that order with no extra sorting needed.
function ChampionCelebrationModal({
  campeao,
  campeaoLabel,
  campeaoStars,
  storeName,
  onClose,
}: {
  campeao: SummaryRow;
  campeaoLabel: string;
  campeaoStars: ChampionStar[] | null;
  storeName: string | undefined;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [generating, setGenerating] = useState(false);
  const [imageModal, setImageModal] = useState<{ url: string; copied: boolean } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf: number;
    const colors = ['#00f0ff', '#a82bff', '#ffb700', '#14ff00', '#ff3df0'];
    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const particles = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height,
      r: 4 + Math.random() * 5,
      vy: 2 + Math.random() * 3,
      vx: -1.5 + Math.random() * 3,
      rot: Math.random() * Math.PI * 2,
      vrot: -0.15 + Math.random() * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    function tick() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        if (p.y > canvas!.height + 20) {
          p.y = -20;
          p.x = Math.random() * canvas!.width;
        }
        ctx!.save();
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.rot);
        ctx!.fillStyle = p.color;
        ctx!.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
        ctx!.restore();
      });
      raf = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  async function handleGenerateImage() {
    setGenerating(true);
    try {
      const blob = await generateChampionCardBlob({
        nome: campeao.apelido || campeao.nome,
        label: campeaoLabel,
        valorLabel: fmtMoney(campeao.valor),
        itensLabel: `${campeao.itens} it.`,
        foto: campeao.foto,
        stars: campeaoStars ?? [],
        storeName,
      });
      if (!blob) return;
      const wasCopied = await tryCopyImage(blob);
      setImageModal({ url: URL.createObjectURL(blob), copied: wasCopied });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <canvas ref={canvasRef} className="absolute inset-0" style={{ pointerEvents: 'none' }} />
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,.6)' }} onClick={onClose} />
      <div
        className="relative rounded-3xl p-6 flex flex-col items-center text-center gap-2 shadow-2xl"
        style={{
          width: 320,
          background: 'linear-gradient(160deg, #12142b, #0b0e1d)',
          border: '2px solid #ffb700',
          boxShadow: '0 0 40px rgba(255,183,0,.45)',
        }}
      >
        <button onClick={onClose} className="absolute top-3 right-3 text-slate-400 hover:text-slate-200">
          ✕
        </button>
        <div className="text-xs uppercase tracking-wide font-bold" style={{ color: '#ffb700' }}>
          👑 {campeaoLabel}
        </div>
        {campeao.foto ? (
          <img src={campeao.foto} alt="" className="w-20 h-20 rounded-full object-cover border-2" style={{ borderColor: '#ffb700' }} />
        ) : (
          <div className="w-20 h-20 rounded-full bg-slate-700 border-2" style={{ borderColor: '#ffb700' }} />
        )}
        <div className="text-lg font-bold">{campeao.apelido || campeao.nome}</div>
        <div className="font-mono text-sm" style={{ color: '#14ff00' }}>
          {fmtMoney(campeao.valor)} · {campeao.itens} it.
        </div>
        {campeaoStars && (
          <div title={campeaoStars.map((s) => `${s.achieved ? '✓' : '✗'} ${s.label}`).join(' · ')}>
            {campeaoStars.map((s) => (
              <span key={s.key} style={{ fontSize: 22, color: s.achieved ? '#ffb700' : '#2b3350' }}>
                ★
              </span>
            ))}
          </div>
        )}
        <button
          onClick={handleGenerateImage}
          disabled={generating}
          className="mt-2 rounded-lg px-4 py-1.5 text-xs font-bold uppercase tracking-wide disabled:opacity-50"
          style={{ background: '#ffb700', color: '#231a02' }}
        >
          {generating ? 'Gerando…' : '🖼️ Gerar imagem do card'}
        </button>
      </div>

      {imageModal && (
        <RankingImageModal
          url={imageModal.url}
          copied={imageModal.copied}
          onClose={() => setImageModal(null)}
          title={`Card de Campeão — ${campeao.apelido || campeao.nome}`}
          filename="card-campeao.png"
          alt="Card de campeão"
        />
      )}
    </div>
  );
}
