import { Link } from 'react-router-dom';

/** Rota que não existe (erro 404 dentro do app): antes a área de conteúdo ficava
 * em branco, sem nenhuma pista do que fazer. */
export function NotFoundPage() {
  return (
    <div className="flex items-center justify-center p-6">
      <div className="max-w-sm w-full rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
        <h2 className="text-base font-semibold mb-2 text-slate-100">Página não encontrada</h2>
        <p className="text-sm text-slate-400 mb-4">
          Este endereço não existe ou mudou de lugar. Volte ao início e abra a tela pelo menu.
        </p>
        <Link to="/" className="inline-block rounded-lg bg-cyan-500 text-slate-950 font-medium px-4 py-2 text-sm">
          Ir para o início
        </Link>
      </div>
    </div>
  );
}
