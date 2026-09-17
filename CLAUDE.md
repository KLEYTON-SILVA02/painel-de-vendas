# Notas para o Claude neste repositório

## Publicação / Deploy

- Este projeto está conectado a três deploys automáticos a partir de `main`: **Vercel** e dois sites Netlify (`gestaodevendasks`, `painel-de-vendas-kms`).
- **A Vercel é a plataforma prioritária.** É nela que o usuário roda a versão em produção que ele efetivamente usa no dia a dia. Sempre que o usuário pedir para "publicar", trate o deploy da Vercel como o que importa de verdade — confirme que o check da Vercel passou antes de considerar a publicação concluída, mesmo que os checks do Netlify ainda estejam processando ou tenham falhado por algo não relacionado à mudança.
- Fluxo padrão de publicação (estabelecido nesta sessão): commit → rebase em `origin/main` → validar (`tsc --noEmit`, `vitest run`, `npm run build`) → push → abrir PR → aguardar checks (priorizando o da Vercel) → squash-merge.
- O usuário pediu que, a partir de um certo ponto desta sessão, toda tarefa finalizada seja publicada automaticamente (commit/push/PR/merge) sem precisar perguntar, desde que validação (tsc/vitest/build) passe limpa.

## Organização de novas funções administrativas: Área de Suporte vs. novo item no menu ADM

O usuário quer evitar que funções de conta/configuração fiquem espalhadas pelo sistema. Isso **não é uma regra fixa** para aplicar automaticamente — é um critério de julgamento: quando eu for propor ou construir uma função nova que seja de **alta importância** e de natureza parecida com o que já vive na Área de Suporte (`src/routes/admin/SuportePage.tsx` — hoje: troca de senha, e-mail de recuperação, transferência de administração, Acesso Construtor), devo **sugerir ao usuário** colocá-la como um novo card dentro da Área de Suporte, em vez de criar automaticamente um item novo separado no menu/grid do ADM (`AdminLandingPage.tsx`). A decisão final de onde a função vai morar é sempre do usuário — eu só levanto a sugestão quando fizer sentido pelo critério acima.

## Nomes oficiais dos sistemas

- **Gestão de Vendas** — este projeto (o painel web).
- **Gestão de Vendas Mobile** — a versão empacotada para celular (Capacitor/APK) deste mesmo projeto.
- **Monitoramento de Lojas** — sistema novo, ainda não iniciado (ver seção abaixo).

## PLANO B (MONITORAMENTO DE LOJAS) — Fase 1 iniciada neste projeto

Palavra-chave para retomar este assunto em qualquer sessão futura: **"PLANO B(MONITORAMENTO DE LOJAS)"**.

O usuário quer, no futuro, um sistema independente de supervisão interna (não é uma tela dentro do Gestão de Vendas, é outro projeto): monitorar as lojas cadastradas, supervisionar listas de vendas e produtos classificados de todas as lojas, acompanhar o fluxo de dados, gerenciar senhas/acessos, e receber notificações de bugs/falhas. A única escrita que esse sistema faria de volta seria a reclassificação em massa de produtos — mas sobre uma tabela de produtos nova e compartilhada entre lojas (não sobre o catálogo por-loja que já existe).

**Decisão já tomada com o usuário: Opção B** — projeto e banco de dados Supabase **totalmente separados** deste (Gestão de Vendas), com uma rotina de sincronização somente-leitura trazendo para lá o que for necessário (lojas, vendas, produtos classificados, erros). **Zero alteração de schema/RLS neste projeto** para viabilizar o Monitoramento de Lojas — a rejeitada foi a Opção A (objetos aditivos no mesmo projeto Supabase), justamente para não haver nenhum caminho de escrita nem risco de dano ao sistema principal.

Quando o usuário pedir para seguir com isso (usando a palavra-chave acima), o trabalho aqui é: fornecer tudo que o novo projeto vai precisar para se conectar a este sistema — sem modificar nada neste repositório/projeto além do estritamente necessário para expor os dados de forma segura e somente-leitura. Nesse momento, ler de novo esta seção e a análise completa feita na sessão que a originou (branch `claude/vendas-panel-react-supabase-gnpsym`) para relembrar o raciocínio.

**Modelo de propagação decidido (mesma sessão que registrou a Opção B acima):** os dois fluxos são de mão única e sempre puxados por quem recebe o dado (nunca empurrados por quem o possui), para que nenhum dos dois projetos precise segurar uma credencial de escrita no outro:
- **Gestão de Vendas → Monitoramento** (sincronização somente-leitura): o Monitoramento puxa periodicamente lojas, contagens de colaboradores (nunca senha — senha nunca é legível em lugar nenhum, nem aqui, o Supabase Auth só guarda hash), métricas de injeção de vendas (contagem/horário por lote, não a venda financeira em si), `client_error_reports` agregado entre lojas, e o catálogo (nome do produto + categoria, sem preço).
- **Monitoramento → Gestão de Vendas** (pull de correções, único fluxo de volta): uma função agendada (mesmo padrão de `pg_cron` já usado pelas notificações) dentro deste projeto busca correções pendentes de categoria de produto numa tabela compartilhada do lado do Monitoramento, e aplica cada uma localmente por loja reaproveitando a mesma rotina de reclassificação que o ADM já usa em Auditoria (`useReclassifyProdutos`) — corrige catálogo e retroage sobre vendas já importadas, sem lógica financeira nova.

Especificação completa (arquitetura, diagrama, exatamente o que cada lado precisa construir, fases sugeridas): **[artefato "Monitoramento de Lojas"](https://claude.ai/artifact/UQt41ZU1oPtSvSW4gaBu1V)**, produzido nesta sessão. Nada foi implementado ainda neste repositório — é só a especificação, para levar ao outro chat/projeto quando o usuário decidir começar.

**Gate de aprovação de novas lojas (implementado — migration `0076_store_approval_gate.sql`):** sistema privado, não público/gratuito — toda loja criada por auto-cadastro nasce com `stores.status = 'pending'` e fica **sem nenhum acesso** (RLS bloqueia toda tabela, via `current_store_id()` exigindo `status = 'active'`) até ser aprovada manualmente por mim. Lojas já existentes continuam `active` automaticamente. Quem cai numa loja pendente/rejeitada vê uma tela de bloqueio (`LockedStoreNotice`) em vez do painel.

Decisão explícita do usuário: **não construir nenhuma UI interina de aprovação neste projeto** — a aprovação só vai acontecer de dentro do Monitoramento de Lojas, quando ele existir. Ou seja, **todo cadastro novo a partir de agora fica travado sem nenhuma forma de liberar até o Monitoramento existir e a sincronização de aprovação estar funcionando** (nem um botão, nem uma tela — isso foi perguntado e confirmado explicitamente). Liberar uma loja específica antes disso só é possível manualmente via SQL direto no banco (`update stores set status = 'active' where id = ...`).

Quando o Monitoramento for implementado, a aprovação se encaixa no mesmo modelo de pull já descrito acima: uma fila de decisões pendentes (aprovar/rejeitar) do lado do Monitoramento, puxada por uma rotina agendada aqui dentro que aplica `status = 'active'`/`'rejected'` localmente — mesmo padrão da fila de correção de categoria de produto, terceiro tipo de fila no mesmo mecanismo.

Peças já identificadas neste projeto como reaproveitáveis para o Monitoramento de Lojas:
- `client_error_reports` (tabela) — já captura erros JS não tratados por loja (`src/lib/reportClientError.ts`); hoje só alimenta o sino de notificação do próprio ADM da loja. Para o Monitoramento de Lojas, precisaria ser agregado entre lojas (via a sincronização somente-leitura da Opção B).
- Edge Functions `grant-collaborator-login` e `reset-collaborator-login` — já isoladas, usam service role, chamáveis de fora sem tocar direto no banco. Podem ser reutilizadas como estão para o gerenciamento de senhas/acessos do Monitoramento de Lojas.
- Motor de classificação (`src/lib/business/classification.ts`, `classifyProductTier`) e o padrão de `useReclassifyProdutos` (`src/lib/mutations.ts`) — servem de referência/base de código para a reclassificação em massa sobre a nova tabela de produtos compartilhada entre lojas (que ainda não existe e seria criada do zero, sem relação com `catalog`/`products` por-loja). Importante: `useReclassifyProdutos` é um hook client-side, rodando sob a sessão de um admin e as policies RLS de uma única loja — não é chamável diretamente por um job cross-loja; o que se reaproveita é a lógica (upsert em `catalog` + retroagir `sales.grupo`), portada para uma rotina server-side que itera loja a loja.

### Refinamento do catálogo compartilhado: casamento de produto por "modelo", não por nome cru entre todas as lojas

Problema identificado nesta sessão: `catalog`/`sales` são isolados por `store_id` e o casamento de produto é por `normalize(nome)` (ou um `codigo` que também é local à loja, não um EAN/barcode universal) — duas lojas nomeiam o mesmo produto físico de formas diferentes, então uma "biblioteca global" única de produtos, classificada uma vez e propagada para todas as lojas indiscriminadamente, falharia silenciosamente na maioria das lojas (a correção não encontra nada para casar, sem erro visível).

Solução decidida: agrupar lojas por **modelo de identificação de produto** — lojas da mesma rede/franquia (ex.: Extrafarma e Pague Menos) usam o mesmo padrão de nomenclatura, então o casamento por nome é confiável *dentro* de um grupo, mesmo sem ser confiável *entre* grupos. Implementado nesta sessão (branch `claude/monitoramento-lojas-83lksc`):
- `stores.modelo_catalogo` (migration `0076_catalog_shared_model.sql`) — coluna nova, nullable, com `check` restringindo aos valores da lista fixa. Nulo = loja independente, fora de qualquer sincronização de catálogo.
- Lista fixa de modelos em `src/lib/business/catalogModels.ts` (`CATALOG_MODELS`) — hoje só `rede_extrafarma_pague_menos`. Adicionar um grupo novo é deploy (mudar esse arquivo **e** o `check` da migration juntos), nunca uma ação de admin.
- Campo "Modelo de identificação de produtos" em **Minha Loja** (`MinhaLojaPage.tsx`, card "Identidade da loja") — cada admin só escolhe a própria chave, nunca vê quais outras lojas compartilham o mesmo grupo. Grava em `stores` via `useUpdateStore`, sob a policy `stores_update_admin` que já existia — zero RLS nova.
- Edge Function `export-catalogo-monitoramento` — o único ponto de saída de catálogo para o Monitoramento: somente-leitura, devolve `{ modelo_catalogo, nome, categoria }` só das lojas com `modelo_catalogo` preenchido (sem preço, sem identificar a loja de origem). Protegida por um segredo de aplicação (header `x-monitoramento-secret` comparado ao secret `MONITORAMENTO_SYNC_SECRET`, mesmo raciocínio de autenticação em duas camadas já documentado em `send-pending-notifications/index.ts`) — não é uma credencial de banco, não aparece em RLS, só abre essa leitura agregada.

**Pendente, fora do escopo deste repositório:** configurar o secret `MONITORAMENTO_SYNC_SECRET` nas Edge Function secrets deste projeto Supabase (dashboard ou `supabase secrets set`) e compartilhar o mesmo valor com o Monitoramento quando esse projeto existir — isso é operação de infraestrutura, não código.
