# Coleção do Thunder Client

Duas requisições, uma por arquivo:

- `thunderclient-collection.json` — 35 requisições, organizadas em 8 pastas
  (uma por módulo), cobrindo todos os endpoints da API.
- `thunderclient-environment.json` — as variáveis usadas pelas requisições
  (`{{baseUrl}}`, `{{apiKey}}`, tokens, ids).

## Como importar

1. No VS Code, abra a extensão **Thunder Client**.
2. Aba **Collections** → botão **Menu (⋮)** → **Import** → selecione
   `thunderclient-collection.json`.
3. Aba **Env** → **Import** → selecione `thunderclient-environment.json`.
4. Selecione o ambiente **"Leiloes - Local"** no seletor de ambiente (canto
   superior direito) antes de rodar qualquer requisição.
5. Edite a variável `apiKey` no ambiente importado, colando o valor de
   `API_KEY` do seu `.env`.

> 💡 Se já rodou `npm run seed`, existem contas prontas (`admin@belleepoque.com` /
> `Admin@123!`, `vendedor@belleepoque.com` / `Vendedor@123!`,
> `comprador@belleepoque.com` / `Comprador@123!`) e um leilão de cada estado
> (`DRAFT`/`OPEN`/`CLOSED`) já no banco — pode pular os passos 1-6 abaixo e ir
> direto pro login com essas contas.

## Como usar (a API não guarda estado entre requisições por você)

O Thunder Client não encadeia requisições sozinho — depois de cada resposta,
copie o valor relevante para a variável de ambiente correspondente, na
aba **Env**:

1. **Auth → Registrar SELLER** e **Registrar BIDDER** (rodar uma vez cada).
2. Para testar rotas de `ADMIN`, promova um dos usuários direto no banco:
   `UPDATE "User" SET papel = 'ADMIN' WHERE email = 'seller.exemplo@teste.com';`
   (ou crie um terceiro usuário e promova-o) — não existe rota pública para
   virar `ADMIN`, de propósito.
3. **Auth → Login SELLER / BIDDER / ADMIN** → copie `accessToken` da
   resposta para `tokenSeller` / `tokenBidder` / `tokenAdmin`.
4. **Categories → Criar categoria** → copie `id` da resposta para
   `categoriaId`.
5. **Auctions → Criar leilão** → copie `id` para `leilaoId`.
6. **Auction Items → Criar item** (usa `leilaoId` e `categoriaId`) → copie
   `id` para `itemId`.
7. **Auctions → Mudar status → SCHEDULED**, depois **→ OPEN** (nessa ordem;
   a máquina de estados não deixa pular etapa).
8. **Bids → Dar lance** (usa `itemId`, autenticado como `tokenBidder`).
9. **Auctions → Mudar status → CLOSED** para fechar e ver o item virar
   `SOLD` com o vencedor.
10. **Documents → Enviar documento** — escolha um arquivo `.jpg`/`.png`/`.pdf`
    manualmente no campo `arquivo` (a exportação da coleção não carrega o
    arquivo em si) → copie `id` da resposta para `documentoId` e teste o
    download.
11. **Users → Desativar/Reativar** — preencha `userIdAlvo` com o `id` de
    outro usuário (nunca o do próprio `ADMIN` logado, que dá `409`).

Cada requisição tem uma nota (aba **Docs**, dentro do Thunder Client) com o
que ela espera e o que observar na resposta.

## Cenários de erro para demonstrar (sugestão)

Depois do fluxo feliz acima, vale repetir alguns requests trocando algo de
propósito, para mostrar os tratamentos de erro exigidos pelo enunciado:

- Remover o cabeçalho `Authorization` → `401`.
- Usar `tokenBidder` numa rota de `SELLER`/`ADMIN` → `403`.
- Usar um id de UUID válido mas inexistente (ex.:
  `24afe5fe-9857-44e7-866c-c814971433ea`) em qualquer rota `GET .../:id` →
  `404`.
- Dar um lance abaixo do mínimo, ou no próprio item (com o usuário do
  vendedor promovido a `BIDDER`) → `409`.
- Enviar `cep: "00000000"` ao criar um item (8 dígitos, mas não existe de
  verdade no ViaCEP) → `400`.
- Enviar um corpo com um campo a mais que o DTO não conhece (ex.:
  `"papel": "ADMIN"` no registro) → `400`.
