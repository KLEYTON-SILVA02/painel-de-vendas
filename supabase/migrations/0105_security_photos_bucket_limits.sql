-- Achado V7 da auditoria de segurança (Fase 12): bucket 'photos' sem limite
-- de tamanho nem de tipo de arquivo. Limite de 15MB e só tipos de imagem
-- (image/*) — igual à regra accept="image/*" já aplicada nos seletores de
-- arquivo do próprio app, então não muda nada pra quem já usa normalmente.
-- Confirmado antes de aplicar: todo objeto já salvo hoje é image/webp,
-- image/jpeg, image/png ou image/svg+xml — todos dentro da nova regra.
update storage.buckets
set file_size_limit = 15728640,
    allowed_mime_types = array['image/*']
where id = 'photos';
