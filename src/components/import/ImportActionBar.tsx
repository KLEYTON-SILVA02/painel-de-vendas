import { Children, type ReactNode } from 'react';
import type { ImportAcaoBotoes } from './CentralImportacaoPanel';

/** Barra de ações fixa no rodapé da tela — pedido explícito do usuário,
 * 2026-10-31: "as barras que mencionei[os botões de Importar/Cancelar/
 * Analisar/Voltar/Salvar] devem ficar de forma fixa na parte inferior, na
 * mesma altura do botão de Importar Vendas do menu lateral". Reaproveita as
 * MESMAS variáveis CSS que já posicionam `.app-content` (--sb-w/
 * --sb-w-collapsed, definidas em `.app-shell` — ver Sidebar.css) pra nunca
 * ficar por baixo da barra lateral, recolhida ou não, e soma `env(safe-area-
 * inset-bottom)` pra não ficar colada atrás da barra de gestos em celular.
 *
 * Pedido explícito do usuário, 2026-10-31: "quando se tratar de um botão...
 * e quando forem dois botões deverá ser tamanhos iguais centralizados em
 * baixo das três colunas, indo de um lado ao outro do espaço da página" —
 * cada botão filho vira uma célula flex de largura igual (`flex-1`) que
 * preenche a largura toda da barra; com 1 filho isso já o estica de ponta a
 * ponta sozinho, sem precisar de um caso especial.
 *
 * Pedido explícito do usuário, 2026-10-31 (nova rodada): a barra "não
 * precisa ficar esticada até onde é exibido a lista de planilhas já
 * importadas" — a partir de `lg` (quando o painel de histórico deixa de
 * empilhar embaixo e passa a ficar do lado, `lg:w-80` + `gap-4` no
 * container das 3 colunas em ImportarPage.tsx/DsmImportHistoryPanel/
 * ClientServiceImportSection), a barra para antes dele em vez de continuar
 * até a borda direita da tela. Abaixo de `lg` o histórico empilha embaixo
 * (sem concorrer horizontalmente), então a barra volta a ir de ponta a
 * ponta. Puramente posicional — não contém nenhuma lógica, só embrulha e
 * redimensiona os botões que cada tela já desenha. */
export function ImportActionBar({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <>
      {/* Reserva o espaço que a barra fixa ocupa, pra ela não cobrir o
          último conteúdo da página (pedido de "única visualização sem
          scroll" continua valendo pro resto — isso só evita que a barra
          sobreponha algo por cima). */}
      <div className="h-20 shrink-0" aria-hidden="true" />
      <div className="import-action-bar">
        <div className="flex items-stretch gap-3 w-full">
          {items.map((child, i) => (
            <div key={i} className="flex-1 min-w-0 [&>*]:w-full [&>*]:h-full">
              {child}
            </div>
          ))}
        </div>
      </div>
      <style>{`
        .import-action-bar {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 40;
          padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
          background: rgba(2, 6, 23, .94);
          backdrop-filter: blur(6px);
          border-top: 1px solid #212948;
        }
        @media (min-width: 641px) {
          .import-action-bar { left: var(--sb-w, 220px); transition: left .22s ease; }
          .app-shell.is-collapsed .import-action-bar { left: var(--sb-w-collapsed, 68px); }
        }
        @media (min-width: 1024px) {
          .import-action-bar { right: calc(320px + 1rem); }
        }
      `}</style>
    </>
  );
}

const NEON_CYAN = '#00f0ff';
const NEON_PURPLE = '#a82bff';

/** Desenha a `ImportActionBar` certa a partir de um `ImportAcaoBotoes`
 * reportado por um sub-fluxo de importação (DSM planilha/imagem, UVC) —
 * pedido explícito do usuário, 2026-10-31: generaliza pra esses sub-fluxos o
 * mesmo padrão de botões (fixo, largura igual, limitado à área das 3
 * colunas) já usado em Importar Vendas, sem repetir o JSX em cada tela.
 * `onVoltar`/`onConfirmar` são os métodos que o próprio sub-componente expõe
 * no seu ref (`voltar`/`confirmar`) — este componente não decide nenhuma
 * lógica de negócio, só traduz o `acao` recebido em botões. */
export function ImportAcaoBotoesBar({
  acao,
  onVoltar,
  onConfirmar,
}: {
  acao: ImportAcaoBotoes;
  onVoltar: () => void;
  onConfirmar: () => void;
}) {
  if (acao.tipo === 'nenhuma') return null;
  if (acao.tipo === 'resultado') {
    return (
      <ImportActionBar>
        <button onClick={onVoltar} className="rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm">
          {acao.label}
        </button>
      </ImportActionBar>
    );
  }
  return (
    <ImportActionBar>
      <button onClick={onVoltar} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">
        {acao.voltarLabel}
      </button>
      <button
        onClick={onConfirmar}
        disabled={acao.confirmando}
        className="rounded-lg font-bold px-4 py-2 text-sm disabled:opacity-60 flex items-center justify-center gap-2"
        style={{
          background: `linear-gradient(90deg, ${NEON_CYAN}, ${NEON_PURPLE})`,
          color: '#04121a',
          textTransform: 'uppercase',
          letterSpacing: '.03em',
        }}
      >
        {acao.confirmarLabel}
      </button>
    </ImportActionBar>
  );
}
