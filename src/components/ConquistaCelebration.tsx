import { useEffect, useRef, useState } from 'react';
import { celebrationKey, pickNewCelebration, type CelebrationCandidate } from '../lib/business/conquistaCelebration';
import { computeConquistas, conquistaTierLabel, isUnitConquista, type ConquistaCategoria } from '../lib/business/conquistas';
import { monthFirstISO, monthLastISO } from '../lib/dateRange';
import { fmtMoney } from '../lib/format';
import { useCollaborators, useCurrentMonthSales, useSpecialLists } from '../lib/queries';

const CONQUISTA_CATS: ConquistaCategoria[] = ['DERM', 'MP', 'GEN', 'LEVMEL', 'CHIP'];
const CAT_LABEL: Record<ConquistaCategoria, string> = {
  DERM: 'Dermocosméticos',
  MP: 'Marcas Exclusivas',
  GEN: 'Genérico',
  LEVMEL: 'Levmel',
  CHIP: 'Chip',
};
const SEEN_KEY = 'conquistas_celebration_seen_v1';
const AUTO_CLOSE_MS = 30000;

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}
function saveSeen(keys: Iterable<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(keys)));
  } catch {
    // localStorage unavailable (private mode, quota) — celebration just
    // won't be remembered across reloads, not worth surfacing an error for.
  }
}

/** Detects a newly-reached achievement (this month, across every conquista
 * category) by diffing against a localStorage baseline, and returns the one
 * to celebrate now. */
function useConquistaCelebration() {
  // Only this month's sales — this host is mounted globally (both admin
  // shells render it on every route, not just Ranking/Início), and it only
  // ever scores the current month anyway, so the full multi-thousand-row
  // useSales() history would be pure waste here.
  const { data: sales } = useCurrentMonthSales();
  const { data: collaborators } = useCollaborators();
  const { data: specialLists } = useSpecialLists();
  const [candidate, setCandidate] = useState<CelebrationCandidate | null>(null);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (!sales || !collaborators || !specialLists) return;
    const now = new Date();
    const from = monthFirstISO(now.getFullYear(), now.getMonth());
    const to = monthLastISO(now.getFullYear(), now.getMonth());
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const candidates: CelebrationCandidate[] = [];
    CONQUISTA_CATS.forEach((cat) => {
      computeConquistas(sales, collaborators, from, to, cat, specialLists).forEach((row) => {
        candidates.push({ key: celebrationKey(cat, row, monthKey), categoria: cat, row });
      });
    });

    const seen = loadSeen();
    const isFirstRun = !checkedRef.current && seen.size === 0 && localStorage.getItem(SEEN_KEY) === null;
    const { toCelebrate, allKeys } = pickNewCelebration(candidates, seen, isFirstRun);
    checkedRef.current = true;
    saveSeen(new Set([...seen, ...allKeys]));
    if (toCelebrate) setCandidate(toCelebrate);
    // Re-checks whenever sales change (e.g. after a header refresh or a new import) —
    // that's the only signal available without a backend push channel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, collaborators, specialLists]);

  return { candidate, dismiss: () => setCandidate(null) };
}

export function ConquistaCelebrationHost() {
  const { candidate, dismiss } = useConquistaCelebration();
  if (!candidate) return null;
  return <ConquistaCelebrationOverlay candidate={candidate} onClose={dismiss} />;
}

function ConquistaCelebrationOverlay({ candidate, onClose }: { candidate: CelebrationCandidate; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const timer = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate.key]);

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

  const { row, categoria } = candidate;
  const tierText = `🏆 ${conquistaTierLabel(categoria, row.tier)}`;
  const isUnit = isUnitConquista(categoria);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <canvas ref={canvasRef} className="absolute inset-0" style={{ pointerEvents: 'none' }} />
      <div
        className="relative rounded-3xl p-6 flex flex-col items-center text-center gap-2 shadow-2xl"
        style={{
          width: 300,
          background: 'linear-gradient(160deg, #12142b, #0b0e1d)',
          border: '2px solid #ffb700',
          boxShadow: '0 0 40px rgba(255,183,0,.45)',
          animation: 'conquista-pulse 2.6s ease-in-out infinite',
        }}
      >
        <button onClick={onClose} className="absolute top-3 right-3 text-slate-400 hover:text-slate-200">
          ✕
        </button>
        <div className="text-xs uppercase tracking-wide font-bold" style={{ color: '#ffb700' }}>
          🎉 Nova conquista!
        </div>
        {row.foto ? (
          <img src={row.foto} alt="" className="w-20 h-20 rounded-full object-cover border-2" style={{ borderColor: '#ffb700' }} />
        ) : (
          <div className="w-20 h-20 rounded-full bg-slate-700 border-2" style={{ borderColor: '#ffb700' }} />
        )}
        <div className="text-lg font-bold">{row.apelido || row.nome}</div>
        <div className="text-xs text-slate-400">{CAT_LABEL[categoria]}</div>
        <div className="text-sm font-bold" style={{ color: '#ffb700' }}>
          {tierText}
        </div>
        <div className="font-mono text-sm" style={{ color: '#14ff00' }}>
          {isUnit ? `${row.itens} un.` : fmtMoney(row.valor)}
        </div>
        <button
          onClick={onClose}
          className="mt-2 rounded-lg px-4 py-1.5 text-xs font-bold uppercase tracking-wide"
          style={{ background: '#ffb700', color: '#231a02' }}
        >
          Fechar
        </button>
      </div>
      <style>{`
        @keyframes conquista-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.035); }
        }
      `}</style>
    </div>
  );
}
