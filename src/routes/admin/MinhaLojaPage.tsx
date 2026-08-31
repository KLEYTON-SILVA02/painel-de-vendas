import { useState, type ReactNode } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { DIA_KEYS, DIA_LABELS, type DiaKey, type Horario } from '../../lib/business/horario';
import { fmtDateBR } from '../../lib/format';
import { useUpdateStore, useUpdateStoreSettings } from '../../lib/mutations';
import { useStore, useStoreSettings } from '../../lib/queries';
import { uploadPhoto } from '../../lib/storage';
import type { Json } from '../../types/database';
import { onlyDigits } from '../../lib/whatsapp';

const TEMAS = [
  { id: 'ciano', label: 'Ciano Padrão', cor: '#00f0ff' },
  { id: 'roxo', label: 'Roxo Neon', cor: '#a855f7' },
  { id: 'dourado', label: 'Dourado', cor: '#eab308' },
  { id: 'rosa', label: 'Rosa', cor: '#ff3df0' },
  { id: 'verde', label: 'Verde', cor: '#22c55e' },
];

export function MinhaLojaPage() {
  const { profile } = useAuth();
  const { data: store } = useStore();
  const { data: storeSettings } = useStoreSettings();
  const updateStore = useUpdateStore(profile?.store_id);
  const updateSettings = useUpdateStoreSettings(profile?.store_id);

  const [nomeLoja, setNomeLoja] = useState('');
  const [numeroLoja, setNumeroLoja] = useState('');
  const [nomeEquipe, setNomeEquipe] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [metaFallback, setMetaFallback] = useState(0);
  const [corDestaque, setCorDestaque] = useState('#00f0ff');
  const [brilho, setBrilho] = useState(100);
  const [modeloRanking, setModeloRanking] = useState<'escadinha' | 'lista'>('escadinha');
  const [horario, setHorario] = useState<Horario | null>(null);
  const [feriadoData, setFeriadoData] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!store || !storeSettings) return <div className="text-sm text-slate-500 p-6">Carregando…</div>;
  const settings = storeSettings;

  if (!initialized) {
    setNomeLoja(store.nome_loja);
    setNumeroLoja(store.numero_loja);
    setNomeEquipe(store.nome_equipe);
    setWhatsapp(store.whatsapp);
    setMetaFallback(storeSettings.meta_geral_fallback);
    setCorDestaque(storeSettings.cor_destaque);
    setBrilho(storeSettings.brilho);
    setModeloRanking(storeSettings.modelo_ranking as 'escadinha' | 'lista');
    setHorario(storeSettings.horario as unknown as Horario);
    setInitialized(true);
    return <div className="text-sm text-slate-500 p-6">Carregando…</div>;
  }
  if (!horario) return null;

  async function handleLogoChange(file: File) {
    if (!profile?.store_id) return;
    if (file.size > 2 * 1024 * 1024) return;
    const url = await uploadPhoto(profile.store_id, 'logo', file);
    updateStore.mutate({ logo_url: url });
  }

  function applyTema(temaId: string, cor: string) {
    setCorDestaque(cor);
    updateSettings.mutate({ tema: temaId, cor_destaque: cor });
  }

  function setDia(dia: DiaKey, patch: Partial<{ ativo: boolean; abre: string; fecha: string }>) {
    setHorario((prev) => (prev ? { ...prev, [dia]: { ...prev[dia], ...patch } } : prev));
  }

  function setFeriadoHorario(patch: Partial<{ abre: string; fecha: string }>) {
    setHorario((prev) => (prev ? { ...prev, feriado: { ...prev.feriado, ...patch } } : prev));
  }

  function addFeriado() {
    if (!feriadoData) return;
    const feriadosDatas = settings.feriados_datas.includes(feriadoData)
      ? settings.feriados_datas
      : [...settings.feriados_datas, feriadoData];
    updateSettings.mutate({ feriados_datas: feriadosDatas });
    setFeriadoData('');
  }

  function removeFeriado(dt: string) {
    updateSettings.mutate({ feriados_datas: settings.feriados_datas.filter((d) => d !== dt) });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateStore.mutateAsync({ nome_loja: nomeLoja, numero_loja: numeroLoja, nome_equipe: nomeEquipe, whatsapp: onlyDigits(whatsapp) });
      await updateSettings.mutateAsync({
        meta_geral_fallback: metaFallback,
        cor_destaque: corDestaque,
        brilho,
        modelo_ranking: modeloRanking,
        horario: horario as unknown as Json,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-cyan-400 font-semibold mb-3">🏬 Identidade da loja</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
          <Field label="Nome da loja">
            <input value={nomeLoja} onChange={(e) => setNomeLoja(e.target.value)} className="input" />
          </Field>
          <Field label="Número da loja">
            <input value={numeroLoja} onChange={(e) => setNumeroLoja(e.target.value)} placeholder="ex: 7152" className="input" />
          </Field>
          <Field label="Nome da equipe (saudação)">
            <input value={nomeEquipe} onChange={(e) => setNomeEquipe(e.target.value)} className="input" />
          </Field>
          <Field label="Meta Geral de reserva (R$)">
            <input type="number" value={metaFallback} onChange={(e) => setMetaFallback(Number(e.target.value))} className="input" />
          </Field>
          <Field label="WhatsApp da loja (com DDI e DDD)">
            <input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="ex: 5511999998888"
              className="input"
            />
          </Field>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Usado pelo botão "Enviar por WhatsApp" nas imagens de ranking, conquistas e card de campeão.
        </p>
        <div className="mt-4">
          <label className="block text-xs text-slate-400 mb-1">Logo do sistema (substitui o "GV" no menu lateral)</label>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
              {store.logo_url ? (
                <img src={store.logo_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs text-slate-500">GV</span>
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleLogoChange(e.target.files[0])}
              className="text-xs text-slate-400"
            />
            {store.logo_url && (
              <button onClick={() => updateStore.mutate({ logo_url: null })} className="text-slate-500 hover:text-rose-400 text-sm">
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-amber-400 font-semibold mb-1">🎨 Aparência</h3>
        <p className="text-xs text-slate-500 mb-3">
          Personalize a cor de destaque, o brilho geral da interface e o modelo visual dos rankings.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl mb-3">
          <Field label="Cor de destaque principal">
            <input type="color" value={corDestaque} onChange={(e) => setCorDestaque(e.target.value)} className="w-full h-9 rounded-md cursor-pointer" />
          </Field>
          <Field label={`Brilho (${brilho}%)`}>
            <input type="range" min={60} max={140} value={brilho} onChange={(e) => setBrilho(Number(e.target.value))} className="w-full" />
          </Field>
          <Field label="Modelo de Ranking">
            <select value={modeloRanking} onChange={(e) => setModeloRanking(e.target.value as 'escadinha' | 'lista')} className="input">
              <option value="escadinha">Pódio (cápsulas)</option>
              <option value="lista">Lista (linhas compactas)</option>
            </select>
          </Field>
        </div>
        <label className="block text-xs text-slate-400 mb-1">Temas rápidos</label>
        <div className="flex flex-wrap gap-2">
          {TEMAS.map((t) => (
            <button
              key={t.id}
              onClick={() => applyTema(t.id, t.cor)}
              className="flex items-center gap-1.5 text-xs rounded-full border px-2.5 py-1"
              style={{ borderColor: t.cor, background: storeSettings.tema === t.id ? `${t.cor}22` : undefined }}
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.cor }} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-amber-400 font-semibold mb-1">⚙️ Horário de Funcionamento</h3>
        <p className="text-xs text-slate-500 mb-3">
          Defina abertura e fechamento individuais de cada dia. Usado no relógio de contagem regressiva.
        </p>
        <div className="flex flex-col gap-2 max-w-lg">
          {DIA_KEYS.map((d) => (
            <div key={d} className="flex items-center gap-2 text-sm">
              <label className="flex items-center gap-1.5 min-w-[110px] text-xs">
                <input type="checkbox" checked={horario[d].ativo} onChange={(e) => setDia(d, { ativo: e.target.checked })} />
                {DIA_LABELS[d]}
              </label>
              <input type="time" value={horario[d].abre} onChange={(e) => setDia(d, { abre: e.target.value })} className="input w-28" />
              <span className="text-xs text-slate-500">até</span>
              <input type="time" value={horario[d].fecha} onChange={(e) => setDia(d, { fecha: e.target.value })} className="input w-28" />
            </div>
          ))}
        </div>

        <h3 className="text-purple-400 font-semibold mt-5 mb-1">🎉 Feriados</h3>
        <p className="text-xs text-slate-500 mb-2">
          Horário especial usado nas datas marcadas como feriado abaixo (sobrepõe o horário do dia da semana).
        </p>
        <div className="grid grid-cols-2 gap-3 max-w-xs mb-2">
          <Field label="Abre">
            <input type="time" value={horario.feriado.abre} onChange={(e) => setFeriadoHorario({ abre: e.target.value })} className="input" />
          </Field>
          <Field label="Fecha">
            <input type="time" value={horario.feriado.fecha} onChange={(e) => setFeriadoHorario({ fecha: e.target.value })} className="input" />
          </Field>
        </div>
        <div className="flex gap-2 mb-3 max-w-xs">
          <input type="date" value={feriadoData} onChange={(e) => setFeriadoData(e.target.value)} className="input" />
          <button onClick={addFeriado} className="rounded-md bg-cyan-500 text-slate-950 font-medium px-3 py-1.5 text-xs whitespace-nowrap">
            + Marcar feriado
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {storeSettings.feriados_datas.length === 0 ? (
            <span className="text-xs text-slate-500">Nenhum feriado cadastrado.</span>
          ) : (
            storeSettings.feriados_datas.map((dt) => (
              <span key={dt} className="text-xs bg-slate-800 rounded-full px-2 py-1 flex items-center gap-1.5">
                {fmtDateBR(dt)}
                <button onClick={() => removeFeriado(dt)} className="text-slate-500 hover:text-rose-400">
                  ✕
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="self-start rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm disabled:opacity-50"
      >
        {saving ? 'Salvando…' : 'Salvar Minha Loja'}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  );
}
