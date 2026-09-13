import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { PageLoading } from '../../components/PageLoading';
import { normalize } from '../../lib/business/normalize';
import { useMarkTutorialDone } from '../../lib/mutations';
import { useTutorialProgress, useTutorials } from '../../lib/queries';
import type { Tables } from '../../types/database';

type Tutorial = Tables<'tutorials'>;
type TutorialStep = { texto: string; imagem_url?: string | null };

// Ordem de exibição das abas — grupos que não tiverem nenhum tutorial ainda
// simplesmente não aparecem (evita aba vazia enquanto o conteúdo cresce aos
// poucos). Rótulos e conteúdo adaptados ao sistema ATUAL, não copiados do
// documento do sistema antigo (que citava telas que não existem mais aqui,
// como "Super Troco"/"Relatórios avançados"/"Dermo Settings"/IA).
const GRUPO_LABELS: Record<string, string> = {
  primeiros_passos: '🚀 Primeiros Passos',
  gestao_de_vendas: '📈 Gestão de Vendas',
  categorias_e_metas: '🎯 Categorias e Metas',
  administracao: '🛠️ Administração',
  relatorios_e_imagens: '🖼️ Relatórios e Imagens',
  configuracoes_e_seguranca: '🔒 Configurações e Segurança',
};
const GRUPO_ORDEM = Object.keys(GRUPO_LABELS);

const NIVEL_LABELS: Record<string, string> = { iniciante: 'Iniciante', intermediario: 'Intermediário', avancado: 'Avançado' };
const NIVEL_COLORS: Record<string, string> = {
  iniciante: 'bg-green-500/20 text-green-400',
  intermediario: 'bg-amber-500/20 text-amber-400',
  avancado: 'bg-rose-500/20 text-rose-400',
};

function tutorialSteps(t: Tutorial): TutorialStep[] {
  return Array.isArray(t.passos) ? (t.passos as unknown as TutorialStep[]) : [];
}

export function TutoriaisPage() {
  const { profile } = useAuth();
  const { data: tutorials } = useTutorials();
  const { data: progress } = useTutorialProgress();
  const markDone = useMarkTutorialDone(profile?.id);

  const [busca, setBusca] = useState('');
  const [grupoAtivo, setGrupoAtivo] = useState<string | null>(null);
  const [aberto, setAberto] = useState<Tutorial | null>(null);

  if (!tutorials || !progress || !profile) return <PageLoading />;

  const doneIds = new Set(progress.map((p) => p.tutorial_id));

  // Cada tutorial só aparece para o perfil a que se destina — um colaborador
  // nunca vê os de Administração/Segurança, por exemplo (era um dos
  // problemas do sistema antigo: todos viam tudo, mesmo sem acesso).
  const visiveis = tutorials.filter((t) => t.perfil_alvo === 'ambos' || (profile.role === 'admin' ? t.perfil_alvo === 'admin' : t.perfil_alvo === 'colaborador'));

  const buscaNormalizada = normalize(busca.trim());
  const filtrados = buscaNormalizada
    ? visiveis.filter((t) => normalize(t.titulo).includes(buscaNormalizada) || normalize(t.resumo).includes(buscaNormalizada))
    : visiveis;

  const gruposComConteudo = GRUPO_ORDEM.filter((g) => visiveis.some((t) => t.grupo === g));
  const grupoAtual = grupoAtivo && gruposComConteudo.includes(grupoAtivo) ? grupoAtivo : gruposComConteudo[0];

  const listaExibida = buscaNormalizada ? filtrados : visiveis.filter((t) => t.grupo === grupoAtual);
  const primeiroPassos = visiveis.find((t) => t.grupo === 'primeiros_passos');

  const totalConcluidos = visiveis.filter((t) => doneIds.has(t.id)).length;
  const pct = visiveis.length > 0 ? Math.round((totalConcluidos / visiveis.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold text-sm mb-1">🎓 Central de Tutoriais</h3>
        <p className="text-xs text-slate-500 mb-3">Passo a passo de cada função do sistema, no seu ritmo.</p>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-slate-400 whitespace-nowrap">
            {totalConcluidos}/{visiveis.length} concluídos ({pct}%)
          </span>
        </div>
      </div>

      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por título ou descrição…"
        className="input w-full"
      />

      {primeiroPassos && !buscaNormalizada && (
        <button
          type="button"
          onClick={() => setAberto(primeiroPassos)}
          className="rounded-2xl border border-cyan-500/50 bg-cyan-500/10 p-4 text-left hover:bg-cyan-500/15"
        >
          <b className="text-sm text-cyan-400">👋 Novo por aqui?</b>
          <p className="text-xs text-slate-400 mt-1">Comece pelo treinamento "{primeiroPassos.titulo}".</p>
        </button>
      )}

      {!buscaNormalizada && (
        <div className="flex flex-wrap gap-1.5">
          {gruposComConteudo.map((g) => (
            <button
              key={g}
              onClick={() => setGrupoAtivo(g)}
              className={`rounded-lg px-3 py-1.5 text-sm ${grupoAtual === g ? 'bg-cyan-500 text-slate-950 font-medium' : 'border border-slate-700 text-slate-300'}`}
            >
              {GRUPO_LABELS[g] ?? g}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {listaExibida.length === 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-center text-sm text-slate-500">
            {buscaNormalizada ? 'Nenhum tutorial encontrado para essa busca.' : 'Nenhum tutorial disponível neste grupo ainda.'}
          </div>
        )}
        {listaExibida.map((t) => (
          <button
            key={t.id}
            onClick={() => setAberto(t)}
            className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-left hover:border-slate-700 flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <b className="text-sm">{t.titulo}</b>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${NIVEL_COLORS[t.nivel] ?? 'bg-slate-700 text-slate-300'}`}>
                  {NIVEL_LABELS[t.nivel] ?? t.nivel}
                </span>
                <span className="text-[10px] text-slate-500">{t.duracao_min} min</span>
                {doneIds.has(t.id) && <span className="text-[10px] text-green-400">✓ Concluído</span>}
              </div>
              <p className="text-xs text-slate-500 mt-1 truncate">{t.resumo}</p>
            </div>
            <span className="shrink-0 rounded-lg bg-cyan-500 text-slate-950 font-medium text-xs px-3 py-1.5">Começar</span>
          </button>
        ))}
      </div>

      <FaqBlock />

      {aberto && (
        <TutorialViewer
          tutorial={aberto}
          done={doneIds.has(aberto.id)}
          onClose={() => setAberto(null)}
          onMarkDone={() => markDone.mutate(aberto.id)}
          marking={markDone.isPending}
        />
      )}
    </div>
  );
}

function FaqBlock() {
  const faqs = [
    { q: 'Preciso concluir os tutoriais em ordem?', a: 'Não — comece pelo que precisar agora. "Primeiros Passos" é só uma sugestão para quem está começando do zero.' },
    { q: 'O progresso fica salvo se eu trocar de computador?', a: 'Sim — fica na sua conta, não no aparelho, então continua de onde parou em qualquer computador em que você fizer login.' },
    { q: 'Os balões de ajuda ("?") nas telas são a mesma coisa?', a: 'São complementares: os balões dão uma explicação rápida ali na hora; aqui você encontra o passo a passo completo de cada função.' },
  ];
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="font-semibold text-sm mb-3">Dúvidas frequentes</h3>
      <div className="flex flex-col gap-3">
        {faqs.map((f, i) => (
          <div key={i}>
            <p className="text-xs font-semibold text-slate-300">{f.q}</p>
            <p className="text-xs text-slate-500 mt-0.5">{f.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TutorialViewer({
  tutorial,
  done,
  onClose,
  onMarkDone,
  marking,
}: {
  tutorial: Tutorial;
  done: boolean;
  onClose: () => void;
  onMarkDone: () => void;
  marking: boolean;
}) {
  const steps = tutorialSteps(tutorial);
  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[stepIdx];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 p-5 flex flex-col md:flex-row gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-base">{tutorial.titulo}</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-sm">
              ✕
            </button>
          </div>
          <div className="flex items-center gap-2 mt-1 mb-3">
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${NIVEL_COLORS[tutorial.nivel] ?? 'bg-slate-700 text-slate-300'}`}>
              {NIVEL_LABELS[tutorial.nivel] ?? tutorial.nivel}
            </span>
            <span className="text-[10px] text-slate-500">{tutorial.duracao_min} min</span>
          </div>
          {tutorial.descricao && <p className="text-xs text-slate-400 mb-3">{tutorial.descricao}</p>}

          {steps.length > 0 && (
            <ol className="flex flex-col gap-2 mb-4">
              {steps.map((s, i) => (
                <li
                  key={i}
                  onClick={() => setStepIdx(i)}
                  className={`text-xs rounded-lg px-3 py-2 cursor-pointer flex gap-2 ${i === stepIdx ? 'bg-cyan-500/15 border border-cyan-500/50 text-cyan-300' : 'border border-slate-800 text-slate-400'}`}
                >
                  <b>{i + 1}.</b>
                  <span>{s.texto}</span>
                </li>
              ))}
            </ol>
          )}

          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={done} disabled={done || marking} onChange={onMarkDone} className="h-4 w-4" />
            {done ? 'Concluído' : 'Marcar como concluído'}
          </label>
        </div>

        <div className="w-full md:w-64 shrink-0 flex flex-col gap-2">
          {step?.imagem_url ? (
            <img src={step.imagem_url} alt={`Passo ${stepIdx + 1}`} className="rounded-xl border border-slate-800 w-full" />
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 aspect-video flex items-center justify-center text-xs text-slate-600 text-center p-3">
              Imagem deste passo ainda não cadastrada
            </div>
          )}
          {steps.length > 1 && (
            <div className="flex items-center justify-between">
              <button
                type="button"
                disabled={stepIdx === 0}
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                className="text-xs rounded-lg border border-slate-700 px-2.5 py-1 text-slate-300 disabled:opacity-30"
              >
                ← Anterior
              </button>
              <span className="text-[10px] text-slate-500">
                {stepIdx + 1}/{steps.length}
              </span>
              <button
                type="button"
                disabled={stepIdx === steps.length - 1}
                onClick={() => setStepIdx((i) => Math.min(steps.length - 1, i + 1))}
                className="text-xs rounded-lg border border-slate-700 px-2.5 py-1 text-slate-300 disabled:opacity-30"
              >
                Próximo →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
