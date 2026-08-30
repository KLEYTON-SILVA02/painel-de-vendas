-- Second, separate photo per collaborator specifically for the Galeria de
-- Conquistas card image (cropped/resized differently than the regular
-- avatar) — a distinct column so editing one never overwrites the other.
alter table public.collaborators add column foto_conquista_url text;
