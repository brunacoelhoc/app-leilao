-- Sessoes de login: uma por login. O access token (curto) carrega o id da sessao; o refresh token
-- (longo, so o HASH fica no banco) renova o acesso. Revogar a sessao derruba os tokens dela na hora.
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "refreshHash" TEXT NOT NULL,
    "refreshHashAnterior" TEXT,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "revogadaEm" TIMESTAMP(3),
    "ipOrigem" TEXT,
    "userAgent" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoUsoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Session_usuarioId_idx" ON "Session"("usuarioId");

-- Se a conta for removida (so contas sem historico), as sessoes vao junto
ALTER TABLE "Session" ADD CONSTRAINT "Session_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
