-- Auditoria de segurança (item 7, prioridade BAIXA): funções de trigger/event trigger
-- que apareciam como RPC chamável por qualquer visitante (/rest/v1/rpc/...). Nenhuma é
-- chamada pelo site nem pelo app — só pelos próprios gatilhos do banco, que não
-- dependem de EXECUTE na hora de disparar. Mesmo padrão de 0104: revoga também de
-- PUBLIC, senão anon/authenticated continuam com acesso por serem membros dele.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.notify_admin_client_error() from public, anon, authenticated;
revoke execute on function public.notify_admin_password_request() from public, anon, authenticated;
revoke execute on function public.enforce_password_request_rate_limit() from public, anon, authenticated;
revoke execute on function public.propagate_catalog_shared_library() from public, anon, authenticated;
revoke execute on function public.sync_sales_category_totals_daily_row() from public, anon, authenticated;

-- _rate_limit_client_ip só é usada por dentro das funções de login (que rodam como
-- dono); não há motivo para ser chamável direto.
revoke execute on function public._rate_limit_client_ip() from public, anon, authenticated;

-- Revisão das demais SECURITY DEFINER abertas para anon: sobram resolve_admin_email,
-- resolve_collaborator_email (tela de login do site) e as pvapp_* (o app de celular
-- chama TODAS com a chave anon — a sessão dele é o p_token conferido dentro de cada
-- função, não um login do Supabase —, então revogar anon delas derrubaria o app).
