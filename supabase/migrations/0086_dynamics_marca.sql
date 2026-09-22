-- Dinâmicas: campo opcional para o nome da marca/laboratório associada à
-- campanha (ex.: "La Roche-Posay", "EMS") — escolhido de uma lista
-- sugerida no ADM (DYNAMIC_BRANDS em src/lib/business/dynamics.ts), mas
-- gravado como texto livre (mesmo padrão já adotado para setor_alvo na
-- migration 0085) para não travar a loja numa lista fixa caso precise de
-- um nome fora dela. Quando preenchido, substitui o rótulo genérico
-- "🎯 DINÂMICA" no botão de filtro da tela Início.
alter table public.dynamics add column marca text;
