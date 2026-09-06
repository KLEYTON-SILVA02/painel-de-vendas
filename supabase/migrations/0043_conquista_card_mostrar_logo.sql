-- Novo controle no editor de card da Galeria de Conquistas: liga/desliga a
-- exibição da logo da empresa no template. Ao desligar, o motor de render
-- (renderConquistaCard) pula a zona da logo inteira — imagem e a
-- máscara/moldura de recorte junto, já que não faz sentido desenhar uma
-- moldura vazia sem nada dentro. Default true preserva o comportamento
-- atual de todo template já salvo.
alter table public.conquista_card_templates
  add column if not exists mostrar_logo boolean not null default true;
