-- Indices que faltavam: a chave estrangeira do chat e a ordenacao das listagens (mais novo primeiro).
CREATE INDEX "Auction_criadoEm_idx" ON "Auction"("criadoEm");
CREATE INDEX "AuctionItem_criadoEm_idx" ON "AuctionItem"("criadoEm");
CREATE INDEX "ChatMessage_autorId_idx" ON "ChatMessage"("autorId");
