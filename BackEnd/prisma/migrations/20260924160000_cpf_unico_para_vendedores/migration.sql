-- Cada CPF pode pertencer a no maximo UMA conta de vendedor (SELLER).
-- Indice unico PARCIAL: compradores e contas sem CPF nao entram na regra.
-- Evita a mesma pessoa com varias contas de vendedor para inflar o proprio leilao.
CREATE UNIQUE INDEX "User_cpf_vendedor_key" ON "User"("cpf") WHERE "papel" = 'SELLER' AND "cpf" IS NOT NULL;
