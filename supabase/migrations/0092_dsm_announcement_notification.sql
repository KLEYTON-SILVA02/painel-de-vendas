-- Aviso único (não recorrente, sem pg_cron) informando o ADM de cada loja
-- sobre a nova categoria DSM (Desconto Só Meu), com um tutorial básico —
-- só preenche o sino/tela de notificações (audience='admin', ver
-- 0061_notifications_admin_audience.sql); sent_at fica null de propósito
-- (mesmo padrão de 0062_birthday_admin_notifications.sql) — o dispatcher de
-- push (send-pending-notifications) processa essa fila sem erro mesmo sem
-- push_tokens vinculados (collaborator_id null aqui), já que o sino do ADM
-- não depende de push pra mostrar a notificação.
insert into public.notifications (store_id, collaborator_id, audience, title, body, data)
select
  id,
  null,
  'admin',
  '🎟️ Nova função: DSM',
  'O DSM (Desconto Só Meu) é a nova categoria de vendas do sistema — acompanha, por colaborador, as conversões desse cupom.' || chr(10) || chr(10)
    || 'Como começar:' || chr(10)
    || '1. Importe os dados em Importar Vendas → botão "🎟️ Inserir DSM" (por planilha ou foto do relatório).' || chr(10)
    || '2. Veja o ranking do período em DSM, no menu lateral.' || chr(10)
    || '3. Cadastre a Meta Mensal e Diária em Metas → Sub-categorias.' || chr(10)
    || '4. As conquistas de DSM aparecem normalmente na Galeria de Conquistas.' || chr(10) || chr(10)
    || 'Para ocultar o DSM do menu, use ADM → Nomes das Categorias.',
  jsonb_build_object('kind', 'dsm_announcement')
from public.stores;
