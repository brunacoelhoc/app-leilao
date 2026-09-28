-- Extensao do Postgres que remove acentos (ex.: unaccent('Leilão') = 'Leilao').
-- Usada pela busca por titulo/descricao do leilao, para "leilao" encontrar "Leilão".
CREATE EXTENSION IF NOT EXISTS unaccent;
