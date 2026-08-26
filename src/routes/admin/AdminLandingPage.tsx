import { Link } from 'react-router-dom';

const ADMIN_CARDS = [
  { to: '/admin/colaboradores', label: 'Colaboradores', icon: '👥', group: 'Equipe e Acessos' },
  { to: '/admin/produtos', label: 'Produtos', icon: '📦', group: 'Produtos e Catálogo' },
  { to: '/metas', label: 'Metas', icon: '🎯', group: 'Metas e Desempenho' },
  { to: '/admin/importar', label: 'Importar', icon: '⬆️', group: 'Vendas e Dados' },
  { to: '/admin/auditoria', label: 'Auditoria', icon: '🔍', group: 'Vendas e Dados' },
  { to: '/admin/backup', label: 'Backup', icon: '⬇️', group: 'Vendas e Dados' },
  { to: '/admin/minha-loja', label: 'Minha Loja', icon: '🏬', group: 'Sistema' },
  { to: '/admin/configuracoes', label: 'Configurações', icon: '🎛️', group: 'Sistema' },
];

export function AdminLandingPage() {
  const groups = Array.from(new Set(ADMIN_CARDS.map((c) => c.group)));
  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group}>
          <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">{group}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {ADMIN_CARDS.filter((c) => c.group === group).map((c) => (
              <Link
                key={c.to}
                to={c.to}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col items-center gap-2 hover:border-cyan-500 hover:bg-slate-900 transition"
              >
                <span className="text-2xl">{c.icon}</span>
                <span className="text-sm font-medium">{c.label}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
