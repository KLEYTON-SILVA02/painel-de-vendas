import type { ReactNode } from 'react';

/** Barra de ações fixa no rodapé da tela — pedido explícito do usuário,
 * 2026-10-31: "as barras que mencionei[os botões de Importar/Cancelar/
 * Analisar/Voltar/Salvar] devem ficar de forma fixa na parte inferior, na
 * mesma altura do botão de Importar Vendas do menu lateral". Reaproveita as
 * MESMAS variáveis CSS que já posicionam `.app-content` (--sb-w/
 * --sb-w-collapsed, definidas em `.app-shell` — ver Sidebar.css) pra nunca
 * ficar por baixo da barra lateral, recolhida ou não, e soma `env(safe-area-
 * inset-bottom)` pra não ficar colada atrás da barra de gestos em celular.
 * Puramente posicional — não contém nenhuma lógica, só embrulha os botões
 * que cada tela já desenha. */
export function ImportActionBar({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Reserva o espaço que a barra fixa ocupa, pra ela não cobrir o
          último conteúdo da página (pedido de "única visualização sem
          scroll" continua valendo pro resto — isso só evita que a barra
          sobreponha algo por cima). */}
      <div className="h-20 shrink-0" aria-hidden="true" />
      <div className="import-action-bar">
        <div className="flex items-center justify-center gap-2 flex-wrap max-w-5xl mx-auto">{children}</div>
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
      `}</style>
    </>
  );
}
