-- Quando a pessoa aceitou os termos de uso (gravado pelo servidor no cadastro)
ALTER TABLE "User" ADD COLUMN "termosAceitosEm" TIMESTAMP(3);
