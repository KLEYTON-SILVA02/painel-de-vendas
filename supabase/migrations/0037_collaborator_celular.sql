-- Adds an optional phone number field to collaborators. Nullable and with
-- no default, so every existing collaborator row (created before this
-- column existed) simply reads back as null instead of breaking — the app
-- already treats every other optional profile field (apelido, foto,
-- data_nascimento) the same way.
alter table public.collaborators
  add column if not exists celular text;
