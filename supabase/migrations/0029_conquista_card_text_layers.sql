-- Multi-text-layer card editor: up to 3 independent text layers (position,
-- optional background-plate shape, font, solid or 2-color gradient fill
-- each) replace the single hardcoded tier-text zone. `texto` becomes
-- optional so new templates (saved with `text_layers` only) don't need to
-- populate the legacy column; `renderConquistaCard` falls back to the old
-- single-zone rendering for any template that still only has `texto`.
alter table public.conquista_card_templates
  alter column texto drop not null,
  add column text_layers jsonb,
  add column logo_scale numeric;
