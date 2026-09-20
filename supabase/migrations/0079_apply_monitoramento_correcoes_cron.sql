-- PLANO B (MONITORAMENTO DE LOJAS) — agenda a Edge Function
-- apply-monitoramento-correcoes a cada 6 horas (correção de categoria não
-- é tão sensível a tempo quanto notificação de venda — 4x ao dia é
-- suficiente e evita bater no Monitoramento sem necessidade). Mesmo padrão
-- de pg_net + anon key só para satisfazer o verify_jwt da plataforma já
-- usado por 0040_notifications_dispatch_cron.sql — ver o raciocínio
-- completo lá e em send-pending-notifications/index.ts. A função em si
-- retorna cedo, sem fazer nada, enquanto MONITORAMENTO_BASE_URL/
-- MONITORAMENTO_SYNC_SECRET não estiverem configurados nas Edge Function
-- secrets deste projeto — seguro deixar agendado antes do Monitoramento
-- existir de verdade.
select cron.schedule(
  'apply-monitoramento-correcoes',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := 'https://evpuqqjqbpoqxzaguinr.supabase.co/functions/v1/apply-monitoramento-correcoes',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2cHVxcWpxYnBvcXh6YWd1aW5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5OTEwMzMsImV4cCI6MjA5MjU2NzAzM30.ZCHY06bTB2meypOClrHwk2QPlDQ073uFAxwezgFmpY4',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
