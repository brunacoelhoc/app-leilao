-- Leilões já cancelados deixaram itens "AVAILABLE"; agora ficam indisponíveis (UNSOLD)
UPDATE "AuctionItem" AS i
SET "status" = 'UNSOLD'
FROM "Auction" AS a
WHERE i."leilaoId" = a."id" AND a."status" = 'CANCELED' AND i."status" = 'AVAILABLE';
