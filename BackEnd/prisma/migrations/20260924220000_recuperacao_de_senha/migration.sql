-- Recuperacao de senha: pedido com o HASH do codigo (nunca o codigo), validade e limite de tentativas
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "codigoHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "usadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PasswordReset_tentativas_check" CHECK ("tentativas" >= 0)
);

CREATE INDEX "PasswordReset_usuarioId_criadoEm_idx" ON "PasswordReset"("usuarioId", "criadoEm");

-- Se a conta for removida (so contas sem historico), os pedidos de recuperacao vao junto
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
