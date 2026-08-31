-- Per-template logo override (falls back to the store's own logo when
-- null) and tier-text font family, for the card editor's new controls.
alter table public.conquista_card_templates add column logo_url text;
alter table public.conquista_card_templates add column text_font_family text;
