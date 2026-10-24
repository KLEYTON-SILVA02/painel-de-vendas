-- Achado V3 da auditoria de segurança (Fase 12): notify_admin_birthdays() só
-- deveria ser chamada pelo pg_cron (roda como "postgres", não afetado por
-- este revoke), mas qualquer usuário anon/authenticated podia chamá-la via
-- RPC direto. Não expõe dado (RETURNS void), mas não há motivo pra ficar
-- aberta.
revoke execute on function public.notify_admin_birthdays() from anon, authenticated;

-- Complemento: o revoke acima não bastou isolado porque toda função nova
-- recebe EXECUTE para PUBLIC por padrão no Postgres, e anon/authenticated
-- são membros de PUBLIC — então o acesso continuava liberado por essa via.
-- Revogando de PUBLIC também. postgres é superuser e ignora ACL, então o
-- pg_cron continua funcionando normalmente.
revoke execute on function public.notify_admin_birthdays() from public;
