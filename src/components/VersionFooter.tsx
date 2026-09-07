import { APP_VERSION } from '../lib/version';

/** Identificação discreta da versão do sistema, fixa no rodapé, abaixo de
 * todas as funções — não deve chamar atenção nem interferir na navegação. */
export function VersionFooter() {
  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        textAlign: 'center',
        fontSize: 10,
        color: '#4a5178',
        opacity: 0.6,
        padding: '2px 0',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {APP_VERSION}
    </div>
  );
}
