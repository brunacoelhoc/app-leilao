-- CreateEnum
CREATE TYPE "Role" AS ENUM ('BIDDER', 'SELLER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('AVAILABLE', 'SOLD', 'UNSOLD');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PHOTO', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "papel" "Role" NOT NULL DEFAULT 'BIDDER',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "status" "AuctionStatus" NOT NULL DEFAULT 'DRAFT',
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionStatusHistory" (
    "id" TEXT NOT NULL,
    "leilaoId" TEXT NOT NULL,
    "statusAnterior" "AuctionStatus",
    "statusNovo" "AuctionStatus" NOT NULL,
    "alteradoPorId" TEXT NOT NULL,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionItem" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "status" "ItemStatus" NOT NULL DEFAULT 'AVAILABLE',
    "precoInicial" DECIMAL(12,2) NOT NULL,
    "incrementoMinimo" DECIMAL(12,2) NOT NULL,
    "lanceAtual" DECIMAL(12,2),
    "cep" TEXT NOT NULL,
    "logradouro" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "vencedorId" TEXT,
    "leilaoId" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuctionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "lanceAnterior" DECIMAL(12,2),
    "itemId" TEXT NOT NULL,
    "licitanteId" TEXT NOT NULL,
    "ipOrigem" TEXT,
    "userAgent" TEXT,
    "idRequisicao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "tipo" "DocumentType" NOT NULL,
    "nomeOriginal" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "enviadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "papel" "Role",
    "acao" TEXT NOT NULL,
    "entidade" TEXT,
    "entidadeId" TEXT,
    "resultado" "AuditResult" NOT NULL,
    "motivo" TEXT,
    "statusHttp" INTEGER,
    "ipOrigem" TEXT,
    "userAgent" TEXT,
    "idRequisicao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Category_nome_key" ON "Category"("nome");

-- CreateIndex
CREATE INDEX "Auction_vendedorId_idx" ON "Auction"("vendedorId");

-- CreateIndex
CREATE INDEX "Auction_status_dataFim_idx" ON "Auction"("status", "dataFim");

-- CreateIndex
CREATE INDEX "AuctionStatusHistory_leilaoId_criadoEm_idx" ON "AuctionStatusHistory"("leilaoId", "criadoEm");

-- CreateIndex
CREATE INDEX "AuctionStatusHistory_alteradoPorId_idx" ON "AuctionStatusHistory"("alteradoPorId");

-- CreateIndex
CREATE INDEX "AuctionItem_leilaoId_idx" ON "AuctionItem"("leilaoId");

-- CreateIndex
CREATE INDEX "AuctionItem_categoriaId_idx" ON "AuctionItem"("categoriaId");

-- CreateIndex
CREATE INDEX "AuctionItem_vencedorId_idx" ON "AuctionItem"("vencedorId");

-- CreateIndex
CREATE INDEX "Bid_licitanteId_criadoEm_idx" ON "Bid"("licitanteId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Bid_itemId_valor_key" ON "Bid"("itemId", "valor");

-- CreateIndex
CREATE UNIQUE INDEX "Document_nomeArquivo_key" ON "Document"("nomeArquivo");

-- CreateIndex
CREATE INDEX "Document_itemId_idx" ON "Document"("itemId");

-- CreateIndex
CREATE INDEX "Document_enviadoPorId_idx" ON "Document"("enviadoPorId");

-- CreateIndex
CREATE INDEX "AuditLog_usuarioId_idx" ON "AuditLog"("usuarioId");

-- CreateIndex
CREATE INDEX "AuditLog_entidade_entidadeId_idx" ON "AuditLog"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "AuditLog_criadoEm_idx" ON "AuditLog"("criadoEm");

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionStatusHistory" ADD CONSTRAINT "AuctionStatusHistory_leilaoId_fkey" FOREIGN KEY ("leilaoId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionStatusHistory" ADD CONSTRAINT "AuctionStatusHistory_alteradoPorId_fkey" FOREIGN KEY ("alteradoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionItem" ADD CONSTRAINT "AuctionItem_vencedorId_fkey" FOREIGN KEY ("vencedorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionItem" ADD CONSTRAINT "AuctionItem_leilaoId_fkey" FOREIGN KEY ("leilaoId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionItem" ADD CONSTRAINT "AuctionItem_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "AuctionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_licitanteId_fkey" FOREIGN KEY ("licitanteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "AuctionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Regras de integridade (o Prisma nao escreve estas; o banco passa a recusar dados invalidos)
-- ============================================================

-- O leilao precisa terminar depois de comecar
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_periodo_valido_check"
  CHECK ("dataFim" > "dataInicio");

-- Dinheiro sempre positivo
ALTER TABLE "AuctionItem" ADD CONSTRAINT "AuctionItem_precoInicial_positivo_check"
  CHECK ("precoInicial" > 0);
ALTER TABLE "AuctionItem" ADD CONSTRAINT "AuctionItem_incrementoMinimo_positivo_check"
  CHECK ("incrementoMinimo" > 0);
ALTER TABLE "AuctionItem" ADD CONSTRAINT "AuctionItem_lanceAtual_positivo_check"
  CHECK ("lanceAtual" IS NULL OR "lanceAtual" > 0);
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_valor_positivo_check"
  CHECK ("valor" > 0);

-- Item so tem vencedor se estiver vendido (e todo item vendido tem vencedor)
ALTER TABLE "AuctionItem" ADD CONSTRAINT "AuctionItem_vencedor_coerente_check"
  CHECK (("status" = 'SOLD') = ("vencedorId" IS NOT NULL));

-- CEP com 8 digitos e UF com 2 letras maiusculas
ALTER TABLE "AuctionItem" ADD CONSTRAINT "AuctionItem_cep_formato_check"
  CHECK ("cep" ~ '^[0-9]{8}$');
ALTER TABLE "AuctionItem" ADD CONSTRAINT "AuctionItem_uf_formato_check"
  CHECK ("uf" IS NULL OR "uf" ~ '^[A-Z]{2}$');

-- Arquivo nao pode ter tamanho zero
ALTER TABLE "Document" ADD CONSTRAINT "Document_tamanho_positivo_check"
  CHECK ("tamanho" > 0);

-- ============================================================
-- Imutabilidade: lances, auditoria e historico so podem ser inseridos, nunca editados ou apagados
-- ============================================================
CREATE FUNCTION impedir_alteracao_registro() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'A tabela "%" e somente de insercao: % nao e permitido', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Bid_imutavel" BEFORE UPDATE OR DELETE ON "Bid"
  FOR EACH ROW EXECUTE FUNCTION impedir_alteracao_registro();
CREATE TRIGGER "AuditLog_imutavel" BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION impedir_alteracao_registro();
CREATE TRIGGER "AuctionStatusHistory_imutavel" BEFORE UPDATE OR DELETE ON "AuctionStatusHistory"
  FOR EACH ROW EXECUTE FUNCTION impedir_alteracao_registro();
