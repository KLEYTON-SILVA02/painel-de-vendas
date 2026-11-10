-- Auditoria de segurança (item 8, prioridade BAIXA): search_path fixo nas funções
-- apontadas pelo advisor function_search_path_mutable. "public, extensions" é o mesmo
-- caminho que elas já usavam por padrão, só que agora travado na própria função (não
-- muda o que cada uma enxerga). _rate_limit_client_ip já foi fixada em 0110; as duas
-- do esquema pvapp ficam no repositório do app (painel-de-vendas-app).
alter function public.classify_bio(text, uuid) set search_path = public, extensions;
alter function public.classify_bio_for_category(text, uuid) set search_path = public, extensions;
alter function public.classify_bio_for_category_batch(uuid, text[]) set search_path = public, extensions;
alter function public.archive_old_sales() set search_path = public, extensions;
alter function public.format_money_brl(numeric) set search_path = public, extensions;
alter function public.dispatch_sales_notification_for_collaborator(uuid, uuid, text, text[], text[], date) set search_path = public, extensions;
alter function public.dispatch_sales_notifications_for_schedule(public.notification_schedules) set search_path = public, extensions;
alter function public.dispatch_sales_notifications() set search_path = public, extensions;
alter function public.sector_base_categories(text) set search_path = public, extensions;
alter function public.category_display_label(text) set search_path = public, extensions;
alter function public.category_display_order(text) set search_path = public, extensions;
