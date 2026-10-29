import { CircularGauge } from '../CircularGauge';

/** "Pele" visual compartilhada pelas quatro telas de importação (Importar
 * Vendas, DSM planilha, DSM imagem, UVC) — pedido do usuário (2026-10-29)
 * pra padronizar o visual num painel de 5 etapas numeradas + um contador
 * redondo de progresso, inspirado no layout de um app de diagnóstico que
 * ele mandou de referência (só o visual, nunca a função de áudio/câmera
 * original).
 *
 * Este componente é PURAMENTE visual: só recebe por fora (via `etapas` e
 * `progressoPct`) o que já aconteceu de verdade em cada tela — nunca decide
 * sozinho se algo terminou, nunca roda temporizador, nunca inventa
 * contagem. Cada tela continua dona da sua própria máquina de estado e das
 * suas próprias funções de leitura/gravação; aqui só se traduz esse estado
 * real num card bonito. Por isso ele não importa nada de lib/business,
 * lib/queries, lib/mutations nem Supabase — zero lógica de negócio. */
export type ImportStepStatus = 'aguardando' | 'andamento' | 'concluido' | 'atencao' | 'erro';

export interface ImportStepInfo {
  key: string;
  /** "01".."05" */
  numero: string;
  titulo: string;
  descricao: string;
  status: ImportStepStatus;
  /** Contador/resultado já calculado de verdade (ex.: "128 linhas", "3 abas"). Nunca um valor inventado. */
  resultado?: string;
  /** Mensagem de erro específica ou orientação — nunca genérica, nunca vazando detalhe interno do Supabase. */
  mensagem?: string;
}

const STATUS_STYLE: Record<ImportStepStatus, { dot: string; text: string; border: string }> = {
  aguardando: { dot: 'bg-slate-600', text: 'text-slate-500', border: 'border-slate-800' },
  andamento: { dot: 'bg-cyan-400 animate-pulse motion-reduce:animate-none', text: 'text-cyan-300', border: 'border-cyan-500/40' },
  concluido: { dot: 'bg-green-400', text: 'text-green-400', border: 'border-green-500/25' },
  atencao: { dot: 'bg-amber-400', text: 'text-amber-400', border: 'border-amber-500/30' },
  erro: { dot: 'bg-rose-400', text: 'text-rose-400', border: 'border-rose-500/30' },
};

function StepStatusIcon({ status }: { status: ImportStepStatus }) {
  const style = STATUS_STYLE[status];
  if (status === 'concluido') {
    return (
      <svg viewBox="0 0 16 16" width={14} height={14} className="shrink-0 text-green-400 mt-0.5" aria-hidden="true">
        <circle cx={8} cy={8} r={7} fill="none" stroke="currentColor" strokeWidth={1.4} opacity={0.4} />
        <path d="M4.5 8.3l2.2 2.2 4.8-4.8" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === 'erro' || status === 'atencao') {
    return (
      <svg viewBox="0 0 16 16" width={14} height={14} className={`shrink-0 mt-0.5 ${style.text}`} aria-hidden="true">
        <circle cx={8} cy={8} r={7} fill="none" stroke="currentColor" strokeWidth={1.4} opacity={0.4} />
        <path d="M8 4.5v4.3" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        <circle cx={8} cy={11.2} r={0.9} fill="currentColor" />
      </svg>
    );
  }
  return <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${style.dot}`} aria-hidden="true" />;
}

export function CentralImportacaoPanel({
  titulo = 'CENTRAL DE IMPORTAÇÃO',
  subtitulo = 'Análise, validação e gravação segura de vendas.',
  etapas,
  progressoPct,
  progressoLabel,
}: {
  titulo?: string;
  subtitulo?: string;
  etapas: ImportStepInfo[];
  progressoPct: number;
  progressoLabel?: string;
}) {
  const temErro = etapas.some((e) => e.status === 'erro');
  const temAtencao = etapas.some((e) => e.status === 'atencao');
  const gaugeColor = temErro ? '#fb7185' : temAtencao ? '#fbbf24' : '#00f0ff';

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0">
          <CircularGauge pct={progressoPct} color={gaugeColor} label={progressoLabel ?? `${Math.round(progressoPct)}%`} />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-xs sm:text-sm tracking-wide text-slate-100" translate="no">
            {titulo}
          </h3>
          <p className="text-[11px] sm:text-xs text-slate-500">{subtitulo}</p>
        </div>
      </div>
      <ol className="flex flex-col gap-1.5">
        {etapas.map((etapa) => {
          const style = STATUS_STYLE[etapa.status];
          return (
            <li key={etapa.key} className={`rounded-xl border ${style.border} bg-slate-950/40 px-3 py-2`}>
              <div className="flex items-start gap-2.5">
                <StepStatusIcon status={etapa.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-[10px] font-mono text-slate-600">{etapa.numero}</span>
                    <span className={`text-xs font-semibold ${style.text}`}>{etapa.titulo}</span>
                    {etapa.resultado && <span className="text-[11px] text-slate-400 font-mono">{etapa.resultado}</span>}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{etapa.descricao}</p>
                  {etapa.mensagem && <p className={`text-[11px] mt-1 ${style.text}`}>{etapa.mensagem}</p>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
