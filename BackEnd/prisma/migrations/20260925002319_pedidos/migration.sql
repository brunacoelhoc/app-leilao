-- CreateEnum
CREATE TYPE "PedidoStatus" AS ENUM ('AGUARDANDO_PAGAMENTO', 'PAGO', 'FINALIZADO');

-- CreateEnum
CREATE TYPE "FormaPagamento" AS ENUM ('PIX', 'CARTAO', 'BOLETO');

-- CreateEnum
CREATE TYPE "TipoEntrega" AS ENUM ('RETIRADA', 'ENTREGA');

-- CreateTable
CREATE TABLE "Pedido" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "compradorId" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "status" "PedidoStatus" NOT NULL DEFAULT 'AGUARDANDO_PAGAMENTO',
    "formaPagamento" "FormaPagamento",
    "pagoEm" TIMESTAMP(3),
    "tipoEntrega" "TipoEntrega",
    "enderecoEntrega" TEXT,
    "codigoRetirada" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_itemId_key" ON "Pedido"("itemId");

-- CreateIndex
CREATE INDEX "Pedido_compradorId_idx" ON "Pedido"("compradorId");

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "AuctionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_compradorId_fkey" FOREIGN KEY ("compradorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
