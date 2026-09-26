-- 1) Imutabilidade tambem contra TRUNCATE: os triggers antigos so cobriam UPDATE e DELETE, entao "TRUNCATE" apagava
--    todos os lances/auditoria/historico de uma vez. A mesma funcao serve (ela so levanta a excecao).
CREATE TRIGGER "Bid_sem_truncate" BEFORE TRUNCATE ON "Bid"
  FOR EACH STATEMENT EXECUTE FUNCTION impedir_alteracao_registro();
CREATE TRIGGER "AuditLog_sem_truncate" BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION impedir_alteracao_registro();
CREATE TRIGGER "AuctionStatusHistory_sem_truncate" BEFORE TRUNCATE ON "AuctionStatusHistory"
  FOR EACH STATEMENT EXECUTE FUNCTION impedir_alteracao_registro();

-- 2) E-mail unico sem diferenciar maiuscula de minuscula: o UNIQUE normal do Prisma trata "Ana@x.com" e "ana@x.com"
--    como e-mails diferentes, e o login procura sempre em minuscula (quem ficasse com maiuscula nao conseguiria entrar).
--    A API agora grava sempre em minuscula; este indice e a ultima defesa, para qualquer caminho que escape dela.
CREATE UNIQUE INDEX "User_email_minusculo_key" ON "User" (lower("email"));
