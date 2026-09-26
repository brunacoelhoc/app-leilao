-- Limpeza de dados antigos: contas desativadas antes da correcao ainda tinham sessao "viva" no banco.
-- (O acesso ja era cortado, porque o token confere "ativo" a cada requisicao; isto so arruma o registro.)
UPDATE "Session" SET "revogadaEm" = now()
WHERE "revogadaEm" IS NULL AND "usuarioId" IN (SELECT id FROM "User" WHERE NOT "ativo");
