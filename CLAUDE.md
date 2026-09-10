# Notas para o Claude neste repositório

## Publicação / Deploy

- Este projeto está conectado a três deploys automáticos a partir de `main`: **Vercel** e dois sites Netlify (`gestaodevendasks`, `painel-de-vendas-kms`).
- **A Vercel é a plataforma prioritária.** É nela que o usuário roda a versão em produção que ele efetivamente usa no dia a dia. Sempre que o usuário pedir para "publicar", trate o deploy da Vercel como o que importa de verdade — confirme que o check da Vercel passou antes de considerar a publicação concluída, mesmo que os checks do Netlify ainda estejam processando ou tenham falhado por algo não relacionado à mudança.
- Fluxo padrão de publicação (estabelecido nesta sessão): commit → rebase em `origin/main` → validar (`tsc --noEmit`, `vitest run`, `npm run build`) → push → abrir PR → aguardar checks (priorizando o da Vercel) → squash-merge.
- O usuário pediu que, a partir de um certo ponto desta sessão, toda tarefa finalizada seja publicada automaticamente (commit/push/PR/merge) sem precisar perguntar, desde que validação (tsc/vitest/build) passe limpa.
