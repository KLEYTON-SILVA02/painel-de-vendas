# Notas para o Claude neste repositório

## Publicação / Deploy

- Este projeto está conectado a três deploys automáticos a partir de `main`: **Vercel** e dois sites Netlify (`gestaodevendasks`, `painel-de-vendas-kms`).
- **A Vercel é a plataforma prioritária.** É nela que o usuário roda a versão em produção que ele efetivamente usa no dia a dia. Sempre que o usuário pedir para "publicar", trate o deploy da Vercel como o que importa de verdade — confirme que o check da Vercel passou antes de considerar a publicação concluída, mesmo que os checks do Netlify ainda estejam processando ou tenham falhado por algo não relacionado à mudança.
- Fluxo padrão de publicação (estabelecido nesta sessão): commit → rebase em `origin/main` → validar (`tsc --noEmit`, `vitest run`, `npm run build`) → push → abrir PR → aguardar checks (priorizando o da Vercel) → squash-merge.
- O usuário pediu que, a partir de um certo ponto desta sessão, toda tarefa finalizada seja publicada automaticamente (commit/push/PR/merge) sem precisar perguntar, desde que validação (tsc/vitest/build) passe limpa.

## Nomes oficiais dos sistemas

- **Gestão de Vendas** — este projeto (o painel web).
- **Gestão de Vendas Mobile** — a versão empacotada para celular (Capacitor/APK) deste mesmo projeto.
- **Monitoramento de Lojas** — sistema novo, ainda não iniciado (ver seção abaixo).

## PLANO B (MONITORAMENTO DE LOJAS) — decisão registrada, aguardando início

Palavra-chave para retomar este assunto em qualquer sessão futura: **"PLANO B(MONITORAMENTO DE LOJAS)"**.

O usuário quer, no futuro, um sistema independente de supervisão interna (não é uma tela dentro do Gestão de Vendas, é outro projeto): monitorar as lojas cadastradas, supervisionar listas de vendas e produtos classificados de todas as lojas, acompanhar o fluxo de dados, gerenciar senhas/acessos, e receber notificações de bugs/falhas. A única escrita que esse sistema faria de volta seria a reclassificação em massa de produtos — mas sobre uma tabela de produtos nova e compartilhada entre lojas (não sobre o catálogo por-loja que já existe).

**Decisão já tomada com o usuário: Opção B** — projeto e banco de dados Supabase **totalmente separados** deste (Gestão de Vendas), com uma rotina de sincronização somente-leitura trazendo para lá o que for necessário (lojas, vendas, produtos classificados, erros). **Zero alteração de schema/RLS neste projeto** para viabilizar o Monitoramento de Lojas — a rejeitada foi a Opção A (objetos aditivos no mesmo projeto Supabase), justamente para não haver nenhum caminho de escrita nem risco de dano ao sistema principal.

Quando o usuário pedir para seguir com isso (usando a palavra-chave acima), o trabalho aqui é: fornecer tudo que o novo projeto vai precisar para se conectar a este sistema — sem modificar nada neste repositório/projeto além do estritamente necessário para expor os dados de forma segura e somente-leitura. Nesse momento, ler de novo esta seção e a análise completa feita na sessão que a originou (branch `claude/vendas-panel-react-supabase-gnpsym`) para relembrar o raciocínio.

Peças já identificadas neste projeto como reaproveitáveis para o Monitoramento de Lojas:
- `client_error_reports` (tabela) — já captura erros JS não tratados por loja (`src/lib/reportClientError.ts`); hoje só alimenta o sino de notificação do próprio ADM da loja. Para o Monitoramento de Lojas, precisaria ser agregado entre lojas (via a sincronização somente-leitura da Opção B).
- Edge Functions `grant-collaborator-login` e `reset-collaborator-login` — já isoladas, usam service role, chamáveis de fora sem tocar direto no banco. Podem ser reutilizadas como estão para o gerenciamento de senhas/acessos do Monitoramento de Lojas.
- Motor de classificação (`src/lib/business/classification.ts`, `classifyProductTier`) e o padrão de `useReclassifyProdutos` (`src/lib/mutations.ts`) — servem de referência/base de código para a reclassificação em massa sobre a nova tabela de produtos compartilhada entre lojas (que ainda não existe e seria criada do zero, sem relação com `catalog`/`products` por-loja).
