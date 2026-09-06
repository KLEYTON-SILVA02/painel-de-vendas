-- Módulo de Notificações — liga a Etapa 1b (que decide/grava o que
-- disparar) à Etapa 1c (a Edge Function que efetivamente envia via FCM):
-- um job pg_cron que dispara essa função a cada 2 minutos via pg_net,
-- mesmo padrão de agendamento server-side já usado por
-- archive_old_sales_cron/dispatch_sales_notifications.
--
-- A chave usada no cabeçalho Authorization é a chave "anon" pública do
-- projeto (a mesma já embutida no bundle do frontend) — só existe aqui
-- para satisfazer a checagem verify_jwt da própria plataforma Supabase ao
-- invocar a função; não concede nenhum privilégio além do que qualquer
-- visitante do site já tem. Ver o comentário no topo de
-- supabase/functions/send-pending-notifications/index.ts para o raciocínio
-- completo de por que isso é aceitável aqui.
create extension if not exists pg_net;

select cron.schedule(
  'send-pending-notifications',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://evpuqqjqbpoqxzaguinr.supabase.co/functions/v1/send-pending-notifications',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2cHVxcWpxYnBvcXh6YWd1aW5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5OTEwMzMsImV4cCI6MjA5MjU2NzAzM30.ZCHY06bTB2meypOClrHwk2QPlDQ073uFAxwezgFmpY4',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
