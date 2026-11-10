-- Auditoria de segurança (item 6, prioridade MÉDIA): send-pending-notifications e
-- apply-monitoramento-correcoes só checavam o JWT da própria plataforma Supabase
-- (verify_jwt), satisfeito por qualquer chamada com a chave "anon" pública — ou seja,
-- qualquer um com essa chave (que já roda embutida no site) conseguia disparar essas
-- duas funções diretamente, fora do horário do pg_cron.
--
-- Correção: um segredo próprio ("cron_secret"), gerado aqui e guardado no Supabase
-- Vault (nunca em texto puro nesta migration nem em nenhum arquivo do repositório),
-- comparado pela função contra a env var CRON_SECRET (cadastrada nas Edge Function
-- secrets) — mesmo raciocínio de autenticação em duas camadas já documentado em
-- supabase/functions/_shared/monitoramentoAuth.ts: o JWT da plataforma só abre a
-- porta de entrada do Supabase; o controle de acesso real é este segredo.
--
-- Os dois jobs pg_cron (0040_notifications_dispatch_cron.sql e
-- 0079_apply_monitoramento_correcoes_cron.sql) são re-agendados aqui — não editados
-- nos arquivos antigos — para mandar o cabeçalho x-cron-secret, lendo o valor do
-- Vault em tempo de execução (nunca hardcoded): se o segredo for rotacionado depois,
-- basta trocar o valor no Vault e na env var — nenhuma migration nova é necessária.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'cron_secret',
      'Header x-cron-secret enviado pelos jobs pg_cron (send-pending-notifications, apply-monitoramento-correcoes) para as próprias Edge Functions internas. Mesmo valor precisa estar cadastrado como CRON_SECRET nas Edge Function secrets deste projeto.'
    );
  end if;
end $$;

select cron.schedule(
  'send-pending-notifications',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://evpuqqjqbpoqxzaguinr.supabase.co/functions/v1/send-pending-notifications',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2cHVxcWpxYnBvcXh6YWd1aW5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5OTEwMzMsImV4cCI6MjA5MjU2NzAzM30.ZCHY06bTB2meypOClrHwk2QPlDQ073uFAxwezgFmpY4',
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'apply-monitoramento-correcoes',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := 'https://evpuqqjqbpoqxzaguinr.supabase.co/functions/v1/apply-monitoramento-correcoes',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2cHVxcWpxYnBvcXh6YWd1aW5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5OTEwMzMsImV4cCI6MjA5MjU2NzAzM30.ZCHY06bTB2meypOClrHwk2QPlDQ073uFAxwezgFmpY4',
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
