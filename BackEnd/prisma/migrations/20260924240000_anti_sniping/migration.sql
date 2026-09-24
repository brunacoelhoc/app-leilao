-- Anti-sniping: quantas vezes o prazo do leilao foi estendido por lances nos ultimos minutos
ALTER TABLE "Auction" ADD COLUMN "prorrogacoes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_prorrogacoes_check" CHECK ("prorrogacoes" >= 0);
