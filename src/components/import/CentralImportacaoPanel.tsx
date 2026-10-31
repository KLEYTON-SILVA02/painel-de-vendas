import type { CSSProperties, ReactNode } from 'react';
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

/** Pacote com tudo que `CentralImportacaoPanel` precisa pra se desenhar —
 * usado por telas que têm mais de um "sub-fluxo" de entrada (ex.: DSM
 * planilha vs. DSM imagem, dentro do mesmo modo "Inserir DSM") pra reportar
 * seu estado pro componente pai, que decide ali fora qual delas mostrar.
 * Pedido explícito do usuário, 2026-10-29: a tela de DSM estava mostrando
 * DOIS velocímetros (um de cada sub-fluxo) ao mesmo tempo — só pode haver
 * UM painel visível por vez, mesmo quando a tela tem mais de uma forma de
 * lançar os dados. */
export interface CentralImportacaoData {
  titulo: string;
  subtitulo: string;
  etapas: ImportStepInfo[];
  pct: number;
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

// Quantos quadradinhos por barra de etapa — só visual, não representa uma
// contagem real (a maioria das etapas não tem um número de sub-progresso
// próprio, ex. "identificação de colunas") — só o status real (aguardando/
// andamento/concluído/atenção/erro) decide o preenchimento.
const ETAPA_SQUARES = 14;

/** Barra de quadradinhos por etapa — pedido explícito do usuário,
 * 2026-10-31: "quadrados que exemplificam uma barra de processamento... vai
 * de zero quadrados cheios a 100% quadrados cheios... exibido em loop até
 * que a etapa seja concluída, onde ela deverá ficar completamente cheia".
 * Nunca finge uma porcentagem que não existe: "aguardando" fica vazia,
 * "andamento" faz uma onda em loop (comunica "trabalhando", não um número
 * inventado), "concluído"/"atenção"/"erro" ficam estáticas e cheias na cor
 * do status — sempre derivado do `status` real já computado por cada tela,
 * nunca um timer. */
function EtapaSquareBar({ status }: { status: ImportStepStatus }) {
  const style = STATUS_STYLE[status];
  const squares = Array.from({ length: ETAPA_SQUARES });
  return (
    <div className="flex gap-[3px] mt-1.5" aria-hidden="true">
      {squares.map((_, i) =>
        status === 'andamento' ? (
          <span
            key={i}
            className="h-1.5 flex-1 rounded-sm central-importacao-square-loop"
            style={{ '--i': i } as CSSProperties}
          />
        ) : (
          <span key={i} className={`h-1.5 flex-1 rounded-sm ${status === 'aguardando' ? 'bg-slate-800' : style.dot}`} />
        ),
      )}
    </div>
  );
}

/** Barra de quadradinhos "grande", com preenchimento PROPORCIONAL a um %
 * real (ex.: gravação em lote — inserted/total) — diferente da
 * `EtapaSquareBar` acima (que é só indeterminada/loop): aqui o número de
 * quadrados cheios é sempre `pct` de verdade, nunca uma animação solta.
 * Reaproveitada pelas telas que precisam mostrar esse tipo de progresso
 * (ex.: ImportarPage.tsx na gravação de vendas) em vez de um 2º velocímetro
 * (pedido explícito do usuário, 2026-10-29: só um velocímetro por tela). */
export function ImportSquareProgressBar({
  pct,
  label,
  color = '#00f0ff',
  count = 30,
}: {
  pct: number;
  label?: string;
  color?: string;
  count?: number;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * count);
  return (
    <div>
      {label && <p className="text-xs text-slate-400 mb-1.5">{label}</p>}
      <div className="flex gap-[3px]">
        {Array.from({ length: count }).map((_, i) => (
          <span
            key={i}
            className="h-3 flex-1 rounded-sm transition-colors duration-200"
            style={{ background: i < filled ? color : '#1e293b' }}
          />
        ))}
      </div>
    </div>
  );
}

export function CentralImportacaoPanel({
  titulo = 'CENTRAL DE IMPORTAÇÃO',
  subtitulo = 'Análise, validação e gravação segura de vendas.',
  etapas,
  progressoPct,
  progressoLabel,
  conteudoAcimaEtapas,
  conteudoAbaixoEtapas,
  terceiraColuna,
}: {
  titulo?: string;
  subtitulo?: string;
  etapas: ImportStepInfo[];
  progressoPct: number;
  progressoLabel?: string;
  /** Conteúdo extra opcional dentro da MESMA coluna das etapas (2ª coluna),
   * antes/depois da lista — ex.: resumo/estatísticas acima, ou um bloco de
   * opções abaixo (pedido explícito do usuário, 2026-10-31, pro layout da
   * etapa de mapeamento de Importar Vendas). */
  conteudoAcimaEtapas?: ReactNode;
  conteudoAbaixoEtapas?: ReactNode;
  /** 3ª coluna opcional — hoje usada pelo conteúdo de verdade de cada etapa
   * (seletor/área de arquivo, prévia, texto extraído, tabela de conferência,
   * "funções de relatórios" etc. — pedido explícito do usuário, 2026-10-29:
   * "serão 3 colunas", com a 3ª "variável" conforme o que a tela estiver
   * fazendo). Sem essa prop o painel continua com 2 colunas (velocímetro |
   * etapas). `titulo` é opcional — quando o próprio conteúdo já tem seu
   * título (ex.: um card de upload com `<h3>` próprio), não precisa de outro
   * por cima. `semMoldura` evita desenhar a borda/fundo padrão da 3ª coluna
   * quando o conteúdo já traz a própria (ex.: os cards de step que cada tela
   * já tinha, reaproveitados aqui dentro em vez de reescritos). */
  terceiraColuna?: { titulo?: string; children: ReactNode; semMoldura?: boolean };
}) {
  const temErro = etapas.some((e) => e.status === 'erro');
  const temAtencao = etapas.some((e) => e.status === 'atencao');
  const gaugeColor = temErro ? '#fb7185' : temAtencao ? '#fbbf24' : '#00f0ff';
  // Brilho neon proporcional ao preenchimento real do velocímetro (pedido
  // explícito do usuário, 2026-10-29: "insira neon com efeitos de luz ao
  // encher") — nunca um valor fixo, sempre amarrado ao mesmo `progressoPct`
  // que já vem de fora (ver comentário do componente acima: zero progresso
  // inventado). drop-shadow em vez de box-shadow porque o CircularGauge é
  // um <svg> com fundo transparente — box-shadow desenharia um quadrado ao
  // redor do SVG em vez de contornar o anel.
  const clampedPct = Math.max(0, Math.min(100, progressoPct));
  const glowBlur = 10 + (clampedPct / 100) * 22;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      {/* Grid de 2 ou 3 colunas (velocímetro | etapas | [conteúdo da etapa
          atual]) a partir de lg; empilha em 1 coluna abaixo disso — pedido
          explícito do usuário, 2026-10-29. A 3ª coluna é a que EXPANDE
          (1fr) — é ela que carrega o conteúdo de verdade (área de arquivo,
          prévia, texto, tabela de conferência); velocímetro e etapas têm
          largura fixa, já que só precisam caber o próprio conteúdo. Sempre
          responsivo, "tudo numa única visualização". */}
      <div
        className={`grid grid-cols-1 gap-4 lg:gap-6 items-start ${
          terceiraColuna ? 'lg:grid-cols-[minmax(0,13rem)_minmax(0,18rem)_1fr]' : 'lg:grid-cols-[minmax(0,15rem)_1fr]'
        }`}
      >
        <div className="flex flex-row lg:flex-col items-center gap-4 lg:gap-3 lg:text-center lg:sticky lg:top-4">
          <div
            className="w-24 h-24 sm:w-32 sm:h-32 lg:w-48 lg:h-48 shrink-0 central-importacao-gauge-glow"
            style={{ '--glow-color': gaugeColor, '--glow-blur': `${glowBlur}px` } as CSSProperties}
          >
            <CircularGauge pct={progressoPct} color={gaugeColor} label={progressoLabel ?? `${Math.round(progressoPct)}%`} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-xs sm:text-sm tracking-wide text-slate-100" translate="no">
              {titulo}
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-500">{subtitulo}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 min-w-0">
          {conteudoAcimaEtapas}
          <ol className="flex flex-col gap-1.5 min-w-0">
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
                      <EtapaSquareBar status={etapa.status} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {conteudoAbaixoEtapas}
        </div>

        {terceiraColuna &&
          (terceiraColuna.semMoldura ? (
            <div className="min-w-0 flex flex-col gap-3">{terceiraColuna.children}</div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 min-w-0">
              {terceiraColuna.titulo && <p className="text-xs text-slate-400 mb-2">{terceiraColuna.titulo}</p>}
              {terceiraColuna.children}
            </div>
          ))}
      </div>
      <style>{`
        .central-importacao-gauge-glow {
          filter: drop-shadow(0 0 var(--glow-blur) var(--glow-color)) drop-shadow(0 0 calc(var(--glow-blur) / 2.2) var(--glow-color));
          animation: central-importacao-glow-pulse 2.4s ease-in-out infinite;
        }
        @keyframes central-importacao-glow-pulse {
          0%, 100% { filter: drop-shadow(0 0 var(--glow-blur) var(--glow-color)) drop-shadow(0 0 calc(var(--glow-blur) / 2.2) var(--glow-color)); }
          50% { filter: drop-shadow(0 0 calc(var(--glow-blur) * 1.35)) drop-shadow(0 0 calc(var(--glow-blur) * 1.35) var(--glow-color)) drop-shadow(0 0 calc(var(--glow-blur) / 1.8) var(--glow-color)); }
        }
        @media (prefers-reduced-motion: reduce) {
          .central-importacao-gauge-glow { animation: none; }
        }
        .central-importacao-square-loop {
          animation: central-importacao-square-pulse 1.2s ease-in-out infinite;
          animation-delay: calc(var(--i) * 0.07s);
        }
        @keyframes central-importacao-square-pulse {
          0%, 100% { background: #1e293b; }
          40% { background: #22d3ee; }
        }
        @media (prefers-reduced-motion: reduce) {
          .central-importacao-square-loop { animation: none; background: #164e63; }
        }
      `}</style>
    </div>
  );
}
