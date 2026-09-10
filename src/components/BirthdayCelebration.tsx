import { useEffect, useRef, useState } from 'react';
import { useCollaborators } from '../lib/queries';
import type { Collaborator } from '../lib/business/types';

const SEEN_KEY = 'aniversario_celebration_seen_v1';
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

/** `${collaboratorId}|${year}` — a birthday is a once-a-year event, so the
 * dedup key resets naturally every year instead of needing to be pruned. */
function birthdayKey(collaboratorId: string, year: number): string {
  return `${collaboratorId}|${year}`;
}

/** Detects a collaborator whose cadastro'd birthdate (month+day) matches
 * today, the same "diff against a localStorage baseline" approach as
 * ConquistaCelebration — first-ever run just baselines everything (so
 * installing the app on someone's birthday doesn't retroactively pop every
 * past year), later runs pop the first still-unseen match. */
function useBirthdayCelebration() {
  const { data: collaborators } = useCollaborators();
  const [candidate, setCandidate] = useState<Collaborator | null>(null);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (!collaborators) return;
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const year = now.getFullYear();

    const todays = collaborators.filter((c) => {
      if (!c.dataNascimento) return false;
      const [, mStr, dStr] = c.dataNascimento.split('-');
      return Number(mStr) === month && Number(dStr) === day;
    });

    const seen = loadSeen();
    const isFirstRun = !checkedRef.current && seen.size === 0 && localStorage.getItem(SEEN_KEY) === null;
    checkedRef.current = true;

    const allKeys = todays.map((c) => birthdayKey(c.id, year));
    if (isFirstRun) {
      saveSeen(new Set([...seen, ...allKeys]));
      return;
    }
    const toCelebrate = todays.find((c) => !seen.has(birthdayKey(c.id, year))) ?? null;
    saveSeen(new Set([...seen, ...allKeys]));
    if (toCelebrate) setCandidate(toCelebrate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collaborators]);

  return { candidate, dismiss: () => setCandidate(null) };
}

export function BirthdayCelebrationHost() {
  const { candidate, dismiss } = useBirthdayCelebration();
  if (!candidate) return null;
  return <BirthdayCelebrationOverlay collaborator={candidate} onClose={dismiss} />;
}

// Two particle layers on the same canvas, same falling-confetti mechanics
// as ConquistaCelebration — squares for confetti, 🎈 glyphs for the
// "chuva de balões" (balloon rain), simply drawn as emoji text instead of
// a hand-built balloon path, which renders identically well and needs no
// extra asset.
function BirthdayCelebrationOverlay({ collaborator, onClose }: { collaborator: Collaborator; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const timer = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collaborator.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf: number;
    const confettiColors = ['#ff3df0', '#ffb700', '#00f0ff', '#14ff00', '#a82bff'];
    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const confetti = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height,
      r: 4 + Math.random() * 5,
      vy: 2 + Math.random() * 3,
      vx: -1.5 + Math.random() * 3,
      rot: Math.random() * Math.PI * 2,
      vrot: -0.15 + Math.random() * 0.3,
      color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
    }));
    const balloons = Array.from({ length: 22 }, () => ({
      x: Math.random() * canvas.width,
      y: -40 - Math.random() * canvas.height,
      size: 22 + Math.random() * 20,
      vy: 0.8 + Math.random() * 1.4,
      vx: -0.6 + Math.random() * 1.2,
      sway: Math.random() * Math.PI * 2,
    }));

    function tick() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      confetti.forEach((p) => {
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
      ctx!.font = '28px sans-serif';
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'middle';
      balloons.forEach((b) => {
        b.sway += 0.02;
        b.x += b.vx + Math.sin(b.sway) * 0.6;
        b.y += b.vy;
        if (b.y > canvas!.height + 40) {
          b.y = -40;
          b.x = Math.random() * canvas!.width;
        }
        ctx!.save();
        ctx!.font = `${b.size}px sans-serif`;
        ctx!.fillText('🎈', b.x, b.y);
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

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <canvas ref={canvasRef} className="absolute inset-0" style={{ pointerEvents: 'none' }} />
      <div
        className="relative rounded-3xl p-6 flex flex-col items-center text-center gap-2 shadow-2xl"
        style={{
          width: 300,
          background: 'linear-gradient(160deg, #2b1230, #1d0e28)',
          border: '2px solid #ff3df0',
          boxShadow: '0 0 40px rgba(255,61,240,.45)',
          animation: 'birthday-pulse 2.6s ease-in-out infinite',
        }}
      >
        <button onClick={onClose} className="absolute top-3 right-3 text-slate-400 hover:text-slate-200">
          ✕
        </button>
        <div className="text-xs uppercase tracking-wide font-bold" style={{ color: '#ff3df0' }}>
          🎂 Aniversário hoje!
        </div>
        {collaborator.foto ? (
          <img src={collaborator.foto} alt="" className="w-20 h-20 rounded-full object-cover border-2" style={{ borderColor: '#ff3df0' }} />
        ) : (
          <div className="w-20 h-20 rounded-full bg-slate-700 border-2" style={{ borderColor: '#ff3df0' }} />
        )}
        <div className="text-lg font-bold">{collaborator.apelido || collaborator.nome}</div>
        <div className="text-sm" style={{ color: '#ffd6f7' }}>
          🎉 Parabéns pelo seu dia! Que venha um ano incrível.
        </div>
        <button
          onClick={onClose}
          className="mt-2 rounded-lg px-4 py-1.5 text-xs font-bold uppercase tracking-wide"
          style={{ background: '#ff3df0', color: '#2b0a26' }}
        >
          Fechar
        </button>
      </div>
      <style>{`
        @keyframes birthday-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.035); }
        }
      `}</style>
    </div>
  );
}
