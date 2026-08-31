-- WhatsApp contact number for the store, digits only with country+area code
-- (e.g. "5511999998888") — used to build wa.me / web.whatsapp.com "send"
-- links for the "Enviar por WhatsApp" buttons on generated ranking/card
-- images, so they open a chat with the store's own number pre-filled.
alter table public.stores add column whatsapp text not null default '';
