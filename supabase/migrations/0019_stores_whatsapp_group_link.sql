-- Optional WhatsApp group invite link (e.g. "https://chat.whatsapp.com/XXXX...")
-- for the store. When set, the "Enviar por WhatsApp" button on generated
-- ranking/conquista/campeão images opens this group directly instead of a
-- chat with the store's own number — group invite links have no query-param
-- mechanism to pre-fill text the way wa.me/web.whatsapp.com "send" links do
-- for an individual chat, so the image is still copied to the clipboard
-- first (same as the number-based fallback) for the admin to paste in.
alter table public.stores add column whatsapp_group_link text not null default '';
