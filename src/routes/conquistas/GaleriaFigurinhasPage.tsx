import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageLoading } from '../../components/PageLoading';
import { computeCollaboratorDayAchievements, conquistaCalendarTotals } from '../../lib/business/conquistas';
import { generateConquistaCalendarJpgBlob, generateConquistaCalendarPdfBlob } from '../../lib/conquistaCalendarExport';
import { renderConquistaCalendar } from '../../lib/conquistaCalendarImage';
import { monthFirstISO, monthLastISO } from '../../lib/dateRange';
import { tryCopyImage } from '../../lib/rankingImage';
import { shareImageToWhatsApp } from '../../lib/whatsapp';
import { useCollaborators, useSales, useSpecialLists, useStore } from '../../lib/queries';

const MONTH_NAMES_FULL = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
];

// Galeria de Figurinhas — a monthly calendar of ONE collaborator's daily
// achievements (Galeria de Conquistas, but laid out day-by-day instead of
// as a top-10 grid): every day they reached a tier in any of the 5
// categories gets a mini card with their photo and a 5-star row (one star
// per category reached that day, filled left-to-right). Reuses the same
// canvas-drawing approach as every other image export in the app — the
// on-screen preview IS the export canvas, not a separate HTML rendering.
export function GaleriaFigurinhasPage() {
  const { data: collaborators } = useCollaborators();
  const { data: sales } = useSales();
  const { data: specialLists } = useSpecialLists();
  const { data: store } = useStore();
  const now = new Date();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mes, setMes] = useState(now.getMonth());
  const [ano] = useState(now.getFullYear());
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle');
  const [whatsappState, setWhatsappState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const collaboratorsData = collaborators ?? [];
  const salesData = sales ?? [];
  const filteredCollaborators = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return collaboratorsData;
    return collaboratorsData.filter((c) => (c.apelido || c.nome).toLowerCase().includes(q));
  }, [collaboratorsData, search]);
  const selected = collaboratorsData.find((c) => c.id === selectedId) ?? null;

  const fromDate = monthFirstISO(ano, mes);
  const toDate = monthLastISO(ano, mes);
  const achievements = useMemo(
    () => (selected ? computeCollaboratorDayAchievements(salesData, collaboratorsData, selected.matricula, fromDate, toDate, specialLists) : []),
    [selected, salesData, collaboratorsData, fromDate, toDate, specialLists],
  );
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const { totalEstrelas, percentual } = conquistaCalendarTotals(achievements, diasNoMes);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    renderConquistaCalendar({
      nome: selected.apelido || selected.nome,
      matricula: selected.matricula,
      foto: selected.fotoConquista || selected.foto,
      ano,
      mes,
      mesLabel: MONTH_NAMES_FULL[mes],
      achievements,
      totalEstrelas,
      percentual,
      storeName: store?.nome_loja,
    }).then((rendered) => {
      if (!active) return;
      const target = canvasRef.current;
      if (!target) return;
      target.width = rendered.width;
      target.height = rendered.height;
      target.getContext('2d')?.drawImage(rendered, 0, 0);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, mes, ano, achievements, store?.nome_loja]);

  if (!collaborators || !sales || !specialLists) {
    return <PageLoading />;
  }

  function calendarData() {
    if (!selected) return null;
    return {
      nome: selected.apelido || selected.nome,
      matricula: selected.matricula,
      foto: selected.fotoConquista || selected.foto,
      ano,
      mes,
      mesLabel: MONTH_NAMES_FULL[mes],
      achievements,
      totalEstrelas,
      percentual,
      storeName: store?.nome_loja,
    };
  }

  async function handleCopy() {
    const data = calendarData();
    if (!data) return;
    setCopyState('copying');
    try {
      const blob = await generateConquistaCalendarJpgBlob(data);
      const ok = blob ? await tryCopyImage(blob) : false;
      setCopyState(ok ? 'copied' : 'failed');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('failed');
      setTimeout(() => setCopyState('idle'), 2000);
    }
  }

  async function handleDownloadJpg() {
    const data = calendarData();
    if (!data) return;
    const blob = await generateConquistaCalendarJpgBlob(data);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `figurinhas-${data.matricula}-${MONTH_NAMES_FULL[mes].toLowerCase()}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDownloadPdf() {
    const data = calendarData();
    if (!data) return;
    setDownloadingPdf(true);
    try {
      const blob = await generateConquistaCalendarPdfBlob(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `figurinhas-${data.matricula}-${MONTH_NAMES_FULL[mes].toLowerCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function handleWhatsApp() {
    const data = calendarData();
    if (!data) return;
    setWhatsappState('sending');
    try {
      const blob = await generateConquistaCalendarJpgBlob(data);
      if (!blob) throw new Error('sem imagem');
      const outcome = await shareImageToWhatsApp(blob, `figurinhas-${data.matricula}.jpg`, `Galeria de Figurinhas — ${data.nome}`, store?.whatsapp, store?.whatsapp_group_link);
      setWhatsappState(outcome === 'failed' ? 'failed' : 'sent');
      setTimeout(() => setWhatsappState('idle'), 2500);
    } catch {
      setWhatsappState('failed');
      setTimeout(() => setWhatsappState('idle'), 2500);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold" style={{ color: '#ffb700' }}>
            🖼️ Galeria de Figurinhas
          </h3>
          <Link to="/conquistas" className="text-sm text-slate-400 hover:text-slate-200">
            ← Voltar
          </Link>
        </div>

        <label className="block text-xs text-slate-400 mb-1">Colaborador</label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar colaborador pelo nome…"
          className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm mb-2"
        />
        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto mb-3">
          {filteredCollaborators.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className="text-xs rounded-full px-2.5 py-1"
              style={{
                background: selectedId === c.id ? '#ffb700' : '#0b0e1d',
                border: '1px solid #ffb700',
                color: selectedId === c.id ? '#231a02' : '#ffb700',
              }}
            >
              {c.apelido || c.nome}
            </button>
          ))}
        </div>

        <label className="block text-xs text-slate-400 mb-1">Mês</label>
        <div className="flex flex-wrap gap-2">
          {MONTH_NAMES_FULL.map((label, i) => (
            <button
              key={label}
              onClick={() => setMes(i)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{
                background: mes === i ? '#00f0ff' : 'transparent',
                border: '1px solid #00f0ff',
                color: mes === i ? '#04121a' : '#00f0ff',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        {!selected ? (
          <div className="text-sm text-slate-500 py-10 text-center">Selecione um colaborador para ver a galeria de figurinhas do mês.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <canvas ref={canvasRef} className="w-full h-auto block rounded-xl" style={{ maxWidth: 980, margin: '0 auto' }} />
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <button
                onClick={handleCopy}
                disabled={copyState === 'copying'}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                {copyState === 'copied' ? '✓ Copiado' : copyState === 'copying' ? 'Copiando…' : copyState === 'failed' ? 'Falhou — tentar de novo' : '📋 Copiar imagem'}
              </button>
              <button onClick={handleDownloadJpg} className="rounded-lg px-3 py-1.5 text-sm font-semibold" style={{ background: '#ffb700', color: '#231a02' }}>
                ⬇ Baixar JPG
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                style={{ background: '#a82bff', color: '#fff' }}
              >
                {downloadingPdf ? 'Gerando PDF…' : '⬇ Baixar PDF'}
              </button>
              <button
                onClick={handleWhatsApp}
                disabled={whatsappState === 'sending'}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: '#25D366' }}
              >
                {whatsappState === 'sent' ? '✓ Enviado' : whatsappState === 'sending' ? 'Enviando…' : whatsappState === 'failed' ? 'Falhou — tentar de novo' : '📲 Compartilhar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
