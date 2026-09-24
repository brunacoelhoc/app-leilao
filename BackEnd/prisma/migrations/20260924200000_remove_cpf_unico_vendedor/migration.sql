-- Trocar de modo (comprador <-> vendedor) nao exige mais perfil completo, entao o CPF
-- deixa de ser barreira. A protecao contra lance no proprio leilao continua no servidor.
DROP INDEX IF EXISTS "User_cpf_vendedor_key";
