-- AlterTable
ALTER TABLE "AuctionItem" ADD COLUMN     "autor" TEXT,
ADD COLUMN     "conservacao" TEXT,
ADD COLUMN     "dimensoes" TEXT,
ADD COLUMN     "periodo" TEXT,
ADD COLUMN     "procedencia" TEXT,
ADD COLUMN     "tecnica" TEXT;

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "leilaoId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatMessage_leilaoId_criadoEm_idx" ON "ChatMessage"("leilaoId", "criadoEm");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_leilaoId_fkey" FOREIGN KEY ("leilaoId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
