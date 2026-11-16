import type { ReactNode } from 'react';
import './ImportFileButton.css';

/** Botão que abre o seletor de arquivos nas telas de importação. Só o visual
 * (3D + halo neon, ver ImportFileButton.css): o `onClick` é o de cada tela,
 * normalmente `() => inputRef.current?.click()`. `size="sm"` é a versão menor,
 * para botões dentro de cards. */
export function ImportFileButton({
  children,
  onClick,
  icon,
  size = 'md',
  disabled,
  title,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  icon?: ReactNode;
  size?: 'md' | 'sm';
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={['gv-import-btn', size === 'sm' ? 'gv-import-btn--sm' : '', className ?? ''].filter(Boolean).join(' ')}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
