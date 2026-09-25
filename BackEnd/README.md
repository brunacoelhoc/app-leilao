# Belle Époque Leilões — API

Backend de uma plataforma de leilões online: cadastro/autenticação, categorias,
leilões, itens, lances (com concorrência segura), upload de fotos/documentos e
integração real com o ViaCEP. Feito em NestJS + Prisma + PostgreSQL para a
avaliação **AV-08 — Plataforma de Leilões**.

## Sumário

- [Stack](#stack)
- [Requisitos](#requisitos)
- [Documentação interativa (Swagger)](#documentação-interativa-swagger)
- [Instalação](#instalação)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Banco de dados e migrations](#banco-de-dados-e-migrations)
- [Rodando a aplicação](#rodando-a-aplicação)
- [Rodando com Docker](#rodando-com-docker)
- [Testes](#testes)
- [Autenticação e segurança](#autenticação-e-segurança)
- [Matriz de permissões](#matriz-de-permissões)
- [Endpoints](#endpoints)
- [Tempo real (WebSocket)](#tempo-real-websocket)
- [Exemplos de requisição](#exemplos-de-requisição)
- [Formato de erro padrão](#formato-de-erro-padrão)
- [Interceptor de log](#interceptor-de-log)
- [Decisões de arquitetura](#decisões-de-arquitetura)
- [Estrutura de pastas](#estrutura-de-pastas)

## Stack

- **NestJS 12** + **TypeScript** (strict, CommonJS)
- **PostgreSQL 18**
- **Prisma 7.10.0** (versão travada, driver adapter `@prisma/adapter-pg`)
- `class-validator` / `class-transformer` (DTOs e serialização)
- **JWT** (`@nestjs/jwt` + `passport-jwt`) para autenticação
- **Helmet**, **compression**, **`@nestjs/throttler`** (rate limiting)
- **`@nestjs/axios`** (integração externa com o ViaCEP)
- **Multer** (upload de arquivos)
- **Jest** (testes unitários e e2e)
- **`@nestjs/swagger`** (documentação interativa da API)

## Requisitos

- Node.js 20+ (testado com Node 24)
- PostgreSQL 18 (ou compatível) rodando localmente ou acessível pela rede
- npm

## Documentação interativa (Swagger)

Com a API rodando, abra **`http://localhost:<PORT>/docs`** no navegador
(fora do prefixo `/api`, de propósito — ver abaixo). É possível testar
qualquer rota direto pela página:

1. Clique em **Authorize** (canto superior direito).
2. Em **api-key**, cole o valor de `API_KEY` do seu `.env`.
3. Em **jwt**, cole o `accessToken` obtido em `POST /auth/login` (sem o
   prefixo `Bearer`, o Swagger adiciona sozinho).
4. Clique em **Authorize** e depois **Close**. A partir daí, todo "Try it
   out" já sai com os dois cabeçalhos certos.

🔎 **Por que `/docs` funciona sem enviar o `X-API-KEY`, se o guard é
global e sem exceções?** Porque o Swagger UI é montado direto no Express
(fora do pipeline de rotas/guards do Nest) — a página de documentação nunca
passa pelo `ApiKeyGuard`. **Nenhuma rota de negócio real ganhou exceção**:
o guard continua exatamente como estava, sem nenhum `if` novo; é uma
característica de como o `@nestjs/swagger` se monta, não uma abertura que
escrevemos. Provado em `test/swagger.e2e-spec.ts`: `/docs` responde `200`
sem cabeçalho nenhum, e `/api/saude` continua respondendo `401` sem a
chave, no mesmo teste.

## Instalação

```bash
cd BackEnd
npm install
cp .env.example .env
# edite o .env com as suas credenciais (ver seção abaixo)
```

## Variáveis de ambiente

Todas são obrigatórias e validadas na inicialização (a API não sobe se
alguma estiver ausente ou em formato inválido — ver `src/config/variaveis-ambiente.ts`).

| Variável              | Descrição                                                              | Exemplo                                          |
| --------------------- | ------------------------------------------------------------------------ | ------------------------------------------------- |
| `DATABASE_URL`        | String de conexão do PostgreSQL                                          | `postgresql://postgres:senha@localhost:5432/leiloes` |
| `JWT_SECRET`          | Segredo para assinar o JWT (mínimo 32 caracteres, não pode ser o exemplo) | um valor longo e aleatório                        |
| `JWT_EXPIRES_IN`      | Validade do **access token** (curto; a renovação é pelo refresh token)  | `15m`                                             |
| `PORT`                | Porta HTTP da API                                                       | `3000`                                            |
| `CEP_API_URL`         | URL base do ViaCEP (integração externa, seção 7 do enunciado)           | `https://viacep.com.br/ws`                        |
| `CEP_API_TIMEOUT_MS`  | Timeout da chamada ao ViaCEP                                            | `5000`                                            |
| `DATABASE_URL_TESTE`  | Banco separado só para os testes e2e (apagado e recriado a cada execução; o nome precisa conter `test`) | `postgresql://postgres:senha@localhost:5432/leiloes_teste` |
| `UPLOAD_MAX_SIZE_MB`  | Tamanho máximo de arquivo aceito no upload                              | `5`                                               |
| `FRONTEND_URL`        | Origem liberada no CORS                                                 | `http://localhost:4200`                           |
| `API_KEY`             | Chave exigida no cabeçalho `X-API-KEY` em **toda** requisição            | um valor longo e aleatório                        |
| `RATE_LIMIT_MAX`      | Máximo de requisições por IP dentro da janela                          | `100`                                             |
| `RATE_LIMIT_JANELA_MS`| Duração da janela de rate limit, em ms                                  | `60000`                                           |

`JWT_SECRET` e `API_KEY` nunca podem ser o texto de exemplo do
`.env.example` — a validação recusa a inicialização se forem.

## Banco de dados e migrations

O schema (`prisma/schema.prisma`) e as migrations (`prisma/migrations/`) já
estão versionados no repositório. A migration inicial inclui, além das
tabelas, `CHECK` constraints (datas, valores positivos, formato de CEP/UF,
coerência vencedor↔status) e *triggers* que impedem `UPDATE`/`DELETE` nas
tabelas de auditoria (`Bid`, `AuditLog`, `AuctionStatusHistory`).

```bash
# Cria o banco (uma vez, se ainda não existir)
createdb leiloes   # ou: psql -U postgres -c "CREATE DATABASE leiloes;"

# Aplica as migrations existentes (ambiente de produção/CI, não pede confirmação)
npx prisma migrate deploy

# Gera o client do Prisma (necessário após clonar o repo ou trocar de branch)
npx prisma generate
```

> `migrate dev` é o comando usado durante o **desenvolvimento**, quando o
> schema muda: ele cria uma migration nova e a aplica, e pode pedir para
> resetar o banco em caso de divergência. `migrate deploy` é o comando de
> **produção/CI**: só aplica as migrations já existentes na pasta, sem gerar
> nada novo e sem interação — é o que se usa aqui, já que o schema desta
> entrega está fechado.
>
> ⚠️ **Nunca** editar a migration `20260921184557_criacao_inicial` depois de
> aplicada. Qualquer mudança de schema precisa de uma migration nova
> (`prisma migrate dev --create-only` seguido de revisão manual do SQL).

### Fotos de demonstração

`npm run fotos:demo` anexa uma obra de domínio público (de `FrontEnd/public/acervo/`) a cada
item que ainda não tem foto, pelo mesmo caminho do upload (arquivo em `uploads/` + registro em
`Document`). É idempotente e faz o carrossel, a página do item e o quadro 3D mostrarem imagens.
Os créditos das obras estão em `FrontEnd/public/acervo/CREDITOS.md`.

### Seed (dados de exemplo)

```bash
npm run seed        # ou: npx prisma db seed
```

Cria (ou reaproveita, se já existirem) 3 contas de exemplo, 5 categorias e 3
leilões — um em `DRAFT`, um `OPEN` com um lance já dado, e um `CLOSED` com um
item `SOLD` (com vencedor) e outro `UNSOLD`. **Idempotente**: pode ser
rodado várias vezes sem duplicar nada (usa ids fixos com `upsert`; os
registros das tabelas imutáveis — `Bid`, `AuctionStatusHistory` — só são
criados na primeira vez, nunca alterados depois).

| Papel  | E-mail                     | Senha           |
| ------ | -------------------------- | --------------- |
| ADMIN  | `admin@belleepoque.com`    | `Admin@123!`     |
| SELLER | `vendedor@belleepoque.com` | `Vendedor@123!`  |
| BIDDER | `comprador@belleepoque.com`| `Comprador@123!` |

## Rodando a aplicação

```bash
npm run start:dev    # desenvolvimento, com reload automático
npm run build        # build de produção (compila para dist/)
npm run start:prod    # roda o build (node dist/main)
```

A API sobe em `http://localhost:<PORT>`, com todas as rotas sob o prefixo
`/api` (ex.: `http://localhost:3000/api/saude`).

## Rodando com Docker

Sobe a API **e** um Postgres próprio (separado do seu Postgres local, se
tiver um), tudo isolado em containers. Os comandos abaixo rodam a partir da
**raiz do projeto** (não da pasta `BackEnd/`).

```bash
cp .env.example .env   # so a senha do Postgres do Docker; edite se quiser
docker compose up --build
```

Isso builda a imagem da API (multi-stage: compila em uma etapa, roda numa
imagem final enxuta, sem devDependencies nem código TypeScript) e sobe dois
serviços:

| Serviço    | Container                       | Porta no host | Observação                                                  |
| ---------- | -------------------------------- | -------------- | ------------------------------------------------------------ |
| `postgres` | `avaliacao-bimestral-postgres-1` | `5433` (não `5432`, para não brigar com um Postgres local já instalado) | Dados persistidos em um volume nomeado |
| `api`      | `avaliacao-bimestral-api-1`      | `3000`          | Roda `prisma migrate deploy` automaticamente antes de subir |

A API dentro do container reaproveita o `BackEnd/.env` que você já tem
configurado (mesmo `JWT_SECRET`, `API_KEY` etc.) — só o `DATABASE_URL` é
sobrescrito no `docker-compose.yml`, porque dentro da rede do Docker o banco
se chama `postgres`, não `localhost`.

```bash
docker compose ps                # ve o status dos containers
docker compose logs -f api       # acompanha o log da API
docker compose down              # para e remove os containers (mantem os dados)
docker compose down -v           # para e APAGA os dados (banco do zero)
```

Pra popular o banco do Docker com o [seed](#seed-dados-de-exemplo), rode a
partir de `BackEnd/`, apontando pra porta `5433`:

```bash
DATABASE_URL="postgresql://leiloes:<sua senha do .env raiz>@localhost:5433/leiloes" npm run seed
```

🔎 **Achado real ao montar isso:** a imagem oficial do Postgres 18+ mudou a
convenção do volume de dados — agora é `/var/lib/postgresql` (não mais
`/var/lib/postgresql/data`, usado até a versão 17). Usar o caminho antigo
faz o container recusar iniciar (`Error: ... these Docker images are
configured to store database data in a format...`). O `docker-compose.yml`
já usa o caminho certo.

## Testes

```bash
npm run test         # unitários (Jest) -- 7 suítes / 36 testes (e2e: 21 suítes / 262 testes)
npm run test:e2e      # end-to-end, contra um banco de TESTE separado (--runInBand: ver nota)
npm run lint          # oxlint --type-aware
```

- Os testes e2e usam um **banco PostgreSQL real** (não há mock de banco), mas **separado do
  banco de desenvolvimento**: defina `DATABASE_URL_TESTE` no `.env` (o nome do banco precisa
  conter `test`, ex.: `leiloes_teste`). A cada execução o `test/setup-banco-teste.js` **apaga e
  recria** esse banco e aplica as migrations do zero; sem essa variável o e2e **se recusa a rodar**
  (proteção para nunca sujar o banco de dev). No CI (`CI=true`) usa o banco efêmero do próprio job.
  Os testes chamam a **API real** com `configurarAplicacao`, incluindo Helmet,
  CORS, `ValidationPipe` e o prefixo `/api` — ou seja, testam exatamente o
  que roda em produção.
- `test:e2e` roda com `--runInBand` (sequencial, um arquivo por vez): cada
  suíte sobe uma instância completa do Nest com seu próprio pool de conexões
  do Prisma contra o mesmo Postgres local; em paralelo isso pode saturar
  conexões/locks (agravado pelo `SELECT ... FOR UPDATE` dos lances) e gerar
  falhas intermitentes. Sequencial é mais lento, mas 100% estável.
- Algumas tabelas (`Bid`, `AuditLog`, `AuctionStatusHistory`) são
  **imutáveis por trigger** — não podem ser `UPDATE`/`DELETE` nem pela
  própria aplicação. Por isso, registros de teste (leilões que mudaram de
  status, usuários que já fizeram login, itens com lance) não podem ser apagados
  um a um: a solução é o banco de teste descartável acima, recriado a cada
  execução (e isso também prova a imutabilidade da trilha de auditoria).

## Autenticação e segurança

- **`X-API-KEY`**: cabeçalho obrigatório em **toda e qualquer rota**
  (inclusive `/auth/registrar` e `/auth/login`), sem exceção. É um guard
  global e roda antes de qualquer outra verificação. Sem ele, ou com o
  valor errado, a resposta é sempre `401`.
- **JWT** (`Authorization: Bearer <token>`): exigido nas rotas que precisam
  de um usuário logado. Obtido em `POST /auth/login`. É um **access token curto**
  (`JWT_EXPIRES_IN`, 15 min) e carrega `{ sub: id, papel, sid }` (`sid` = id da sessão).
  A cada requisição autenticada a API **reconsulta o usuário e a sessão no banco** —
  se a conta foi desativada ou apagada, ou a sessão foi encerrada, o acesso é
  cortado imediatamente, sem esperar o token expirar.
- **Sessões, refresh token e logout** (tabela `Session`): cada login abre uma sessão. O
  **refresh token** (`<idDaSessão>.<segredo>`) é **rotativo e de uso único** — cada `POST /auth/refresh`
  devolve um par novo e só o **hash SHA-256** do segredo fica no banco (comparação em tempo constante).
  Se um refresh token **já usado** aparecer de novo (sinal de roubo), a sessão inteira é revogada.
  A sessão expira após 7 dias sem uso. `POST /auth/logout` revoga a sessão na hora; **trocar a senha**
  revoga as outras sessões e **redefinir a senha** (recuperação) revoga todas. Implementado em
  `src/auth/sessao.service.ts`; tokens sem sessão (formato antigo) são recusados.
- **Papéis** (`BIDDER`, `SELLER`, `ADMIN`): verificados por `@Roles()` +
  `RolesGuard`, sempre depois do `JwtAuthGuard` (`@UseGuards(JwtAuthGuard, RolesGuard)` —
  nessa ordem; invertida, um usuário não-logado recebe `403` em vez do `401` correto).
- **Rate limiting**: por padrão, `RATE_LIMIT_MAX` requisições por IP a cada
  `RATE_LIMIT_JANELA_MS`; excedido, responde `429` com `Retry-After`.
  `POST /auth/login` e `POST /auth/registrar` têm um limite **próprio e mais
  baixo** (10/min cada; `esqueci-senha` 5/min, `redefinir-senha` 10/min e `refresh` 20/min), independente do geral — são os alvos clássicos de
  força bruta e cadastro em massa.
- **JWT com algoritmo travado** (`HS256`, explícito na assinatura e na
  verificação) — defesa em profundidade contra ataques de confusão de
  algoritmo.
- **Senha**: hash `bcrypt` (custo 12), nunca retornada em nenhuma resposta
  (`@Exclude()` + `ClassSerializerInterceptor` global, como rede de
  segurança adicional).
- **Upload conferido pelo conteúdo**: além do `mimetype` (que o cliente pode falsificar), o servidor lê os primeiros bytes do arquivo (assinatura JPEG `FF D8 FF`, PNG, `%PDF-`) e recusa com `400` quando não batem — um executável enviado como `foto.jpg` é barrado. Implementado em `src/common/utils/assinatura-arquivo.util.ts`.
- **Recuperação de senha** (`POST /auth/esqueci-senha` e `/auth/redefinir-senha`): código de 6 dígitos gerado com `crypto.randomInt`, guardado só como hash bcrypt na tabela `PasswordReset`, com validade de 15 min, no máximo 5 tentativas (contadas de forma atômica antes de conferir), uso único e no máximo 3 pedidos por hora por conta. A resposta é idêntica para e-mail inexistente. A entrega do e-mail é **simulada** (`EmailSimuladoService` escreve o código no log do servidor: `docker compose logs api`); é o único ponto a trocar por um envio real.
- **Aceite dos termos** (`aceiteTermos` obrigatório no cadastro) gravado em `User.termosAceitosEm`.
- **Timing attack neutralizado no login**: o `bcrypt.compare` roda sempre,
  mesmo se o e-mail não existir (contra um hash fictício), para o tempo de
  resposta não denunciar quais e-mails estão cadastrados.

## Matriz de permissões

`Livre` = não exige token (só o `X-API-KEY` global). `Autenticado` = qualquer
papel logado. As demais colunas indicam quem pode acessar; "dono" significa
que, além do papel, o service confere se o recurso pertence a quem fez a
requisição (nunca manipulável trocando um ID no corpo/URL).

| Recurso                     | Livre | BIDDER | SELLER (dono) | ADMIN |
| ---------------------------- | :---: | :----: | :------------: | :---: |
| Registrar / Login            |  ✅   |   ✅   |       ✅        |  ✅   |
| Ver o próprio perfil (`/me`) |       |   ✅   |       ✅        |  ✅   |
| Listar / (des)ativar usuários |      |        |                 |  ✅   |
| Ler categorias/leilões/itens/lances/documentos | ✅ | ✅ | ✅ | ✅ |
| Criar/editar/remover categoria |      |        |                 |  ✅   |
| Criar leilão                 |       |        |       ✅        |  ✅¹  |
| Editar/remover/mudar status do leilão |       |        |       ✅        |  ✅   |
| Criar/editar/remover item do leilão |       |        |       ✅        |  ✅   |
| Dar lance                    |       |   ✅   |                 |       |
| Ver os próprios lances (`/bids/meus`) |       |   ✅   |                 |       |
| Enviar foto/documento do item |       |        |       ✅        |  ✅   |

**Modo comprador / vendedor.** Toda conta nasce BIDDER. Com um clique (`PATCH /users/me/modo`) ela alterna entre os modos, sem completar perfil: no modo **vendedor** cria leilões e **não dá lance**; no modo **comprador** dá lance e **não cria leilão**. Nenhum modo permite lance no próprio leilão. ADMIN não troca de modo.

**Privacidade.** O histórico de lances, o evento em tempo real e o chat (leitura pública) mostram só o primeiro nome e a inicial do segundo ("Maria S."); a abreviação é feita pelo servidor.

**Perfil completo.** Para **dar lance** e para **criar leilão**, o servidor exige telefone, CPF válido e endereço (`403` dizendo o que falta). A regra vive só no back-end; o front apenas exibe a mensagem.

¹ O `ADMIN` pode **editar/mudar status/remover** qualquer leilão como
override administrativo, mas **não cria** leilão (criação é só do `SELLER`,
que passa a ser automaticamente o dono).

## Endpoints

Todas as rotas abaixo estão sob o prefixo `/api` (omitido na tabela por
brevidade) e exigem o cabeçalho `X-API-KEY`. "Auth" indica se precisa de
`Authorization: Bearer <token>` e qual papel.

### Auth (`/auth`)

| Método | Rota | Auth | Body | Respostas |
| --- | --- | --- | --- | --- |
| POST | `/auth/registrar` | Livre | `{ nome, email, senha, aceiteTermos }` | `201` usuário criado (BIDDER, sem senha; o servidor grava `termosAceitosEm`) · `400` inválido ou termos não aceitos · `409` e-mail já cadastrado |
| POST | `/auth/login` | Livre | `{ email, senha }` | `200` `{ accessToken, refreshToken, usuario }` (abre uma sessão) · `400` inválido · `401` credenciais inválidas · `403` conta desativada |
| POST | `/auth/refresh` | Livre | `{ refreshToken }` | `200` par novo `{ accessToken, refreshToken, usuario }` (o refresh token é de **uso único**: o anterior deixa de valer) · `400` corpo inválido · `401` refresh inválido, já usado, revogado ou expirado (mensagem única) · `429` limite por IP |
| POST | `/auth/logout` | Autenticado | — | `204` a sessão é revogada e o access token (e o refresh token) dela param de valer **na hora** · `401` |
| POST | `/auth/esqueci-senha` | Livre | `{ email }` | `200` resposta **sempre igual**, o e-mail existindo ou não (gera um código de 6 dígitos, válido por 15 min, guardado só como hash; entrega simulada no log do servidor; máx. 3 pedidos/hora por conta; pedido novo cancela o anterior) · `400` e-mail inválido · `429` limite por IP |
| POST | `/auth/redefinir-senha` | Livre | `{ email, codigo, novaSenha }` | `200` senha trocada (código de uso único) · `400` corpo inválido **ou** código incorreto/expirado/usado (mesma mensagem; máx. 5 tentativas, depois o código é queimado) · `429` limite por IP |

### Users (`/users`)

| Método | Rota | Auth | Body | Respostas |
| --- | --- | --- | --- | --- |
| GET | `/users/me` | Autenticado | — | `200` o próprio perfil · `401` |
| PATCH | `/users/me` | Autenticado | `{ nome?, email?, telefone?, endereco?, cpf?, avatarUrl?, senhaAtual? }` | `200` · `400` (formato inválido; **trocar o e-mail exige `senhaAtual` correta**) · `401` · `409` (e-mail já cadastrado) |
| POST | `/users/me/encerrar-conta` | Autenticado | `{ senhaAtual }` | `204` **LGPD**: anonimiza os dados pessoais (nome, e-mail, telefone, CPF, endereço, avatar), inativa a conta, revoga as sessões e inutiliza a senha; o histórico imutável (lances, leilões, pedidos, auditoria) permanece como "Usuário removido" · `400` senha incorreta · `401` · `403` ADMIN não encerra por aqui · `409` pendências (peça em disputa, leilão aberto/agendado ou pedido não finalizado) · `429` |
| PATCH | `/users/me/senha` | Autenticado | `{ senhaAtual, novaSenha }` | `204` · `400` (senha atual errada ou nova fraca) · `401` |
| PATCH | `/users/me/modo` | Autenticado | `{ modo: "BIDDER" ou "SELLER" }` | `200` troca o modo da conta na hora, **sem completar perfil** (vendedor cria leilões e não dá lance; comprador dá lance e não cria leilão) · `400` modo inválido · `401` · `403` ADMIN não troca de modo · `409` já está nesse modo |
| POST | `/users` | ADMIN | `{ nome, email, senha, papel }` | `201` cria usuário já com o papel escolhido · `400` · `401` · `403` · `409` |
| GET | `/users/:id` | ADMIN | — | `200` dados **completos** (a consulta é auditada) · `400` · `401` · `403` · `404` |
| GET | `/users` | ADMIN | — | `200` lista de usuários (sem senha; e-mail, telefone, CPF e endereço **mascarados** pelo backend) · `401` · `403` |
| PATCH | `/users/:id/desativar` | ADMIN | query opcional `?forcar=true` | `200` · `400` id inválido · `401` · `403` · `404` · `409` (autodesativação, **ou usuário disputando peça / dono de leilão aberto ou agendado**; com `forcar=true` desativa mesmo assim, para emergências como fraude, e a ação é auditada como `USUARIO_DESATIVADO_FORCADO`) |
| PATCH | `/users/:id/reativar` | ADMIN | — | `200` · `400` · `401` · `403` · `404` |

### Categories (`/categories`)

| Método | Rota | Auth | Body | Respostas |
| --- | --- | --- | --- | --- |
| POST | `/categories` | ADMIN | `{ nome, descricao? }` | `201` · `400` · `401` · `403` |
| GET | `/categories` | Livre | — | `200` lista |
| GET | `/categories/:id` | Livre | — | `200` · `400` id inválido · `404` |
| PATCH | `/categories/:id` | ADMIN | campos parciais | `200` · `400` · `401` · `403` · `404` |
| DELETE | `/categories/:id` | ADMIN | — | `204` · `401` · `403` · `404` · `409` (categoria em uso por um item) |

### Auctions (`/auctions`)

| Método | Rota | Auth | Body | Respostas |
| --- | --- | --- | --- | --- |
| POST | `/auctions` | SELLER | `{ titulo, descricao?, dataInicio, dataFim }` (ISO 8601; `dataFim` > `dataInicio`) | `201` (nasce `DRAFT`) · `400` · `401` · `403` |
| GET | `/auctions?busca=&status=&vendedorId=` | Livre | — | `200` lista paginada (filtros opcionais) |
| GET | `/auctions/:id` | Livre | — | `200` · `400` · `404` |
| GET | `/auctions/:id/indicadores` | Livre | — | `200` `{ totalItens, totalLances, maiorLance, itensVendidos, itensNaoVendidos, itensDisponiveis, arrecadadoTotal }` · `400` · `404` |
| PATCH | `/auctions/:id` | SELLER dono / ADMIN | campos parciais | `200` · `400` · `401` · `403` (não é o dono) · `404` · `409` (fora de `DRAFT`) |
| PATCH | `/auctions/:id/status` | SELLER dono / ADMIN | `{ status, motivo? }` (`motivo` obrigatório se `status=CANCELED`) | `200` (fecha com definição de vencedor, se `CLOSED`) · `400` · `401` · `403` (não é o dono, **ou o vendedor tentou cancelar um leilão ABERTO que já recebeu lances: só o ADMIN cancela, com motivo**) · `404` · `409` (transição inválida; agendar sem itens ou com `dataFim` já passada; ou o leilão mudou de estado ao mesmo tempo) |
| DELETE | `/auctions/:id` | SELLER dono / ADMIN | — | `204` · `401` · `403` · `404` · `409` (fora de `DRAFT`) |

Máquina de estados: `DRAFT → SCHEDULED → OPEN → CLOSED`; `CANCELED` alcançável
de qualquer estado não-final. Ao fechar (`CLOSED`), cada item do leilão vira
`SOLD` (com o vencedor = **maior lance de uma conta ativa**) ou `UNSOLD` (sem nenhum lance ativo).
Se quem liderava foi desativado (só possível com `forcar=true`), o lance dele é **pulado**: a peça vai
para o próximo maior lance de uma conta ativa, **pelo valor desse lance**, e a troca fica na auditoria
(`ITEM_VENCEDOR_SUBSTITUIDO`). O detalhe da peça (`GET /auction-items/:id`) traz `avisoResultado`, um texto
explicando que o maior lance foi desconsiderado (conta desativada) e qual é o valor final. O encerramento automático só fecha se o prazo continua o mesmo que ele leu
(um lance de anti-sniping no meio tempo impede o fechamento).

Cada leilão volta com `transicoesPermitidas` (para onde ele pode ir agora) e
`editavel` (`true` só em `DRAFT`): a tela apenas exibe, quem decide é o backend.

**Abertura e encerramento automáticos:** um serviço interno
(`EncerramentoAutomaticoService`) confere o relógio a cada 5 s. Leilão
`SCHEDULED` que chegou na `dataInicio` vira `OPEN`; leilão `OPEN` que passou da
`dataFim` vira `CLOSED`, com o vencedor de cada item definido e o evento
`item-finalizado` enviado aos clientes. Fica desligado quando `NODE_ENV=test`
e deve rodar em **uma única instância** da API.

### Auction Items (`/auction-items`)

| Método | Rota | Auth | Body | Respostas |
| --- | --- | --- | --- | --- |
| POST | `/auction-items` | SELLER dono do leilão / ADMIN | `{ titulo, descricao?, precoInicial, incrementoMinimo, cep, leilaoId, categoriaId }` | `201` (endereço preenchido via ViaCEP) · `400` · `401` · `403` · `400` também para CEP inexistente · `404` (leilão/categoria inexistente) · `409` (leilão fora de `DRAFT`) · `503` (ViaCEP fora do ar) |
| GET | `/auction-items?leilaoId=&categoriaId=` | Livre | — | `200` lista (filtros opcionais, por relacionamento) |
| GET | `/auction-items/:id` | Livre | — | `200` · `400` · `404` |
| PATCH | `/auction-items/:id` | SELLER dono / ADMIN | campos parciais | `200` · `400` · `401` · `403` · `404` · `409` (leilão fora de `DRAFT`) |
| DELETE | `/auction-items/:id` | SELLER dono / ADMIN | — | `204` · `401` · `403` · `404` · `409` (leilão fora de `DRAFT`) |

Cada item também volta com valores **calculados pelo servidor**: `situacao`
(`EM_BREVE`, `ABERTO`, `ENCERRANDO`, `VENDIDO`, `NAO_VENDIDO`, `CANCELADO`),
`lanceMinimo` (menor lance aceito agora), `segundosParaMudanca` (contagem até
abrir/encerrar), `prorrogacoes` (quantas vezes o **anti-sniping** estendeu o prazo) e `vencedorNome`.

**Anti-sniping** (`src/auctions/anti-sniping.ts`): um lance que chega quando faltam **menos de
2 minutos** para o fim do leilão faz o prazo passar a ser **"agora + 2 minutos"**. Cada novo lance na
janela estende de novo, e o leilão só fecha quando ninguém mais dá lance nos minutos finais. A
extensão acontece **na mesma transação do lance** (sob o mesmo lock) — lance rejeitado nunca estende —,
fica na auditoria (`LEILAO_PRAZO_ESTENDIDO`) e o `dataFim`/`prorrogacoes` do leilão refletem o novo prazo.
O robô de encerramento sempre olha o prazo atual.

Campos de dinheiro (`precoInicial`, `incrementoMinimo`, `lanceAtual`) sempre
voltam como **string** na resposta (ex.: `"150.50"`), nunca como número —
evita perda de precisão do `Decimal` do Postgres em JSON.

### Bids (lances)

| Método | Rota | Auth | Body | Respostas |
| --- | --- | --- | --- | --- |
| POST | `/auction-items/:itemId/bids` | BIDDER | `{ valor }` | `201` · `400` · `401` · `403` (não é BIDDER) · `404` · `409` (é o vendedor do item, leilão fechado/fora do período, valor abaixo do mínimo) |
| GET | `/auction-items/:itemId/bids` | Livre | — | `200` lista, do maior lance para o menor (com `licitanteNome`) |
| GET | `/bids/meus` | BIDDER | — | `200` os lances do próprio usuário logado · `401` |

Concorrência: cada lance é processado dentro de uma transação com
`SELECT ... FOR UPDATE` na linha do item — dois lances simultâneos no mesmo
item nunca "vencem" juntos; o segundo é sempre avaliado contra o valor já
atualizado pelo primeiro.

Depois de gravar o lance, o servidor avisa em tempo real quem está vendo o item
(evento `lance-novo`, ver [Tempo real](#tempo-real-websocket)).

### Documents (upload)

| Método | Rota | Auth | Body | Respostas |
| --- | --- | --- | --- | --- |
| POST | `/auction-items/:itemId/documents` | SELLER dono / ADMIN | `multipart/form-data`: campo `arquivo` (jpeg/png/pdf) + campo `tipo` (`PHOTO` ou `DOCUMENT`) | `201` · `400` (sem arquivo, tipo não aceito, **conteúdo diferente do tipo informado**, maior que `UPLOAD_MAX_SIZE_MB`) · `401` · `403` · `404` |
| GET | `/auction-items/:itemId/documents` | Livre | — | `200` lista |
| GET | `/documents/:id/download` | Livre | — | `200` (stream do arquivo) · `404` |

### CEP (`/cep`)

| Método | Rota | Auth | Respostas |
| --- | --- | --- | --- |
| GET | `/cep/:cep` | Livre (só `X-API-KEY`) | `200` `{ logradouro, cidade, uf }` (ViaCEP; aceita com ou sem hífen) · `400` CEP mal formado ou inexistente · `503` ViaCEP fora do ar |

### Destaques (`/destaques`)

| Método | Rota | Auth | Respostas |
| --- | --- | --- | --- |
| GET | `/destaques?limite=` | Livre (só `X-API-KEY`) | `200` até 10 leilões para o carrossel da home |

Ordem decidida no backend: abertos (encerram primeiro), em breve (abrem primeiro),
encerrados (mais recentes). Rascunho e cancelado nunca aparecem. Cada card traz
`etiqueta` (Aberto, Em breve, Encerrado), totais, maior lance, `capaDocumentoId` e
`itemUnicoId` (preenchido se o leilão tem um item só).

### Ranking, obras, chat, institucional e painel admin

| Método | Rota | Auth | Respostas |
| --- | --- | --- | --- |
| GET | `/ranking/vendedores` | Livre (só `X-API-KEY`) | `200` melhores vendedores por total arrecadado |
| GET | `/obras/acervo` | Livre (só `X-API-KEY`) | `200` obras do acervo de domínio público (título, autor, ano, fonte); as imagens ficam em `FrontEnd/public/acervo/` |
| GET | `/auction-items/:id/historia` | Livre (só `X-API-KEY`) | `200` história da obra e contexto da época · `404` |
| GET | `/auctions/:leilaoId/chat` | Livre (só `X-API-KEY`) | `200` últimas mensagens, da mais antiga para a mais nova |
| POST | `/auctions/:leilaoId/chat` | Autenticado | `201` envia mensagem (**só com o leilão `OPEN`**) · `400` · `401` · `404` leilão inexistente · `409` leilão não aberto |
| GET | `/institucional` | Livre (só `X-API-KEY`) | `200` dados da casa de leilões para o rodapé |
| GET | `/admin/resumo` | ADMIN | `200` totais da plataforma para o painel · `401` · `403` |

### Saúde

| Método | Rota | Auth | Respostas |
| --- | --- | --- | --- |
| GET | `/saude` | Livre (só `X-API-KEY`) | `200` `{ status, banco, dataHora }` · `503` banco fora do ar |

## Tempo real (WebSocket)

Socket.io no namespace **`/lances`** (`src/realtime/`), com uma sala por item
(`item:{id}`). O CORS usa a mesma `FRONTEND_URL` da API.

| Direção | Evento | Dados |
| --- | --- | --- |
| cliente → servidor | `entrar-item` / `sair-item` | `itemId` |
| servidor → sala | `lance-novo` | `{ lance, licitanteNome, lanceAtual, lanceMinimo, lancesSugeridos, prazo: { dataFim, segundosParaMudanca, prorrogacoes, estendido } }` (o `prazo` já traz a extensão do anti-sniping; a tela só acompanha o cronômetro) |
| servidor → sala | `item-finalizado` | `{ itemId, status, vencedorId, vencedorNome, valorFinal }` |

Os eventos só **leem** dados públicos e por isso não exigem a `X-API-KEY` (o
`ApiKeyGuard` ignora o que não é HTTP). Toda **escrita** (dar lance, mudar status)
continua sendo HTTP, com chave e login.

## Exemplos de requisição

Substitua `SUA_API_KEY` pelo valor de `API_KEY` do seu `.env`.

**Registrar e logar:**

```bash
curl -X POST http://localhost:3000/api/auth/registrar \
  -H "X-API-KEY: SUA_API_KEY" -H "Content-Type: application/json" \
  -d '{"nome":"Ana Compradora","email":"ana@teste.com","senha":"Abc12345!"}'

curl -X POST http://localhost:3000/api/auth/login \
  -H "X-API-KEY: SUA_API_KEY" -H "Content-Type: application/json" \
  -d '{"email":"ana@teste.com","senha":"Abc12345!"}'
# -> { "accessToken": "...", "usuario": { ... } }
```

**Criar um leilão (SELLER) e um item dentro dele:**

```bash
TOKEN="o accessToken do login de um usuário SELLER"

curl -X POST http://localhost:3000/api/auctions \
  -H "X-API-KEY: SUA_API_KEY" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"titulo":"Leilão de Arte","dataInicio":"2027-01-01T00:00:00.000Z","dataFim":"2027-01-10T00:00:00.000Z"}'

curl -X POST http://localhost:3000/api/auction-items \
  -H "X-API-KEY: SUA_API_KEY" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"titulo":"Quadro raro","precoInicial":100,"incrementoMinimo":10,"cep":"01310100","leilaoId":"<id-do-leilao>","categoriaId":"<id-da-categoria>"}'
```

**Abrir o leilão e dar um lance (BIDDER):**

```bash
curl -X PATCH http://localhost:3000/api/auctions/<id>/status \
  -H "X-API-KEY: SUA_API_KEY" -H "Authorization: Bearer $TOKEN_SELLER" -H "Content-Type: application/json" \
  -d '{"status":"SCHEDULED"}'
curl -X PATCH http://localhost:3000/api/auctions/<id>/status \
  -H "X-API-KEY: SUA_API_KEY" -H "Authorization: Bearer $TOKEN_SELLER" -H "Content-Type: application/json" \
  -d '{"status":"OPEN"}'

curl -X POST http://localhost:3000/api/auction-items/<itemId>/bids \
  -H "X-API-KEY: SUA_API_KEY" -H "Authorization: Bearer $TOKEN_BIDDER" -H "Content-Type: application/json" \
  -d '{"valor":100}'
```

**Enviar uma foto do item:**

```bash
curl -X POST http://localhost:3000/api/auction-items/<itemId>/documents \
  -H "X-API-KEY: SUA_API_KEY" -H "Authorization: Bearer $TOKEN_SELLER" \
  -F "tipo=PHOTO" -F "arquivo=@/caminho/para/foto.jpg"
```

## Formato de erro padrão

Todo erro da API sai no mesmo formato, em português:

```json
{
  "statusCode": 409,
  "erro": "Conflito",
  "mensagem": "Este registro esta em uso por outros registros e nao pode ser removido",
  "caminho": "/api/categories/1b2c3d4e-...",
  "dataHora": "2026-09-22T18:00:00.000Z"
}
```

`mensagem` é uma `string` para a maioria dos erros e um array de `string`
(uma mensagem por campo) quando vem da validação do corpo (`400`). Erros do
Prisma são traduzidos (`P2002` → `409`, FK `Restrict` → `409`, FK ausente →
`404`, `P2025` → `404`, violação de `CHECK` → `400`, banco fora do ar →
`503`); qualquer outro erro vira um `500` genérico — os detalhes reais vão
só para o log do servidor, nunca para a resposta.

## Interceptor de log

`LogRequisicaoInterceptor` (global) grava uma linha de log estruturado
(JSON) por requisição — `idRequisicao`, `método`, `rota`, `status` e o
tempo de execução em ms — no momento em que a resposta termina de ser
enviada (por isso também captura o status final de erros tratados pelo
filtro global). **Finalidade: observabilidade** (auditoria de performance e
tráfego), sem nenhuma regra de negócio. Nunca registra cabeçalhos, corpo ou
query string, para não vazar segredos (token, senha, chave de API) no log.

## Decisões de arquitetura

- **Nomenclatura:** nomes de model/enum em inglês (conforme o enunciado);
  campos, mensagens de resposta, comentários e nomes de método em português.
- **Leilão × item × lance:** o `Auction` é o evento (período + status); o
  `AuctionItem` é o que se vende; o `Bid` pertence ao item.
- **Checagem de dono sempre no service**, nunca no guard — o guard não tem
  acesso ao dado ainda; o service compara o `id` do dono com
  `@CurrentUser()`, com um bypass para `ADMIN`. É isso que impede manipular
  o recurso de outra pessoa só trocando o ID na URL/corpo.
- **Auditoria (`AuditLog`)**: toda ação de escrita (registro, login,
  categorias, leilões, itens, lances, documentos) grava uma linha de
  sucesso **ou** de rejeição (com o motivo e o status HTTP reais), sempre
  gravada **fora** de qualquer transação de negócio que possa sofrer
  rollback — senão a auditoria de uma rejeição seria desfeita junto.
- **Imutabilidade de trilha de auditoria**: `Bid`, `AuditLog` e
  `AuctionStatusHistory` têm um trigger no banco que bloqueia `UPDATE` e
  `DELETE`, e suas chaves estrangeiras usam `onDelete: Restrict`. Isso
  significa que qualquer leilão que já mudou de estado, item que já recebeu
  lance, ou usuário que já fez login, fica protegido contra remoção **para
  sempre** — mesmo pelo `ADMIN`. É uma escolha deliberada de integridade de
  auditoria, não um bug.
- **Concorrência nos lances**: lock pessimista (`SELECT ... FOR UPDATE`)
  dentro de uma transação, em vez de otimista — garante que dois lances
  simultâneos no mesmo item nunca sejam avaliados contra o mesmo valor
  desatualizado.
- **Dinheiro sempre em `Decimal(12,2)`**, nunca `Float`; sempre convertido
  para `string` nas respostas (`class-transformer` não serializa `Decimal`
  do Prisma corretamente).

A revisão de segurança feita antes da entrega (achados corrigidos, pontos já
adequados e riscos aceitos, com evidência de cada um) está em
[`REVISAO-SEGURANCA.md`](../REVISAO-SEGURANCA.md), na raiz do projeto.

## Estrutura de pastas

```
src/
  auth/              autenticação, JWT, sessões (refresh token/logout), recuperação de senha, DTOs
  users/             perfil (/me) e gestão de usuários pelo ADMIN
  audit/              AuditLogService (log de auditoria)
  categories/         CRUD de categorias (ADMIN)
  auctions/           leilões, máquina de estados, fechamento com vencedor
  auction-items/      itens do leilão, integração com o CEP
  bids/               lances, concorrência
  documents/          upload de fotos/documentos
  cep/                integração externa (ViaCEP) via HttpService + GET /cep/:cep
  destaques/          carrossel da home (GET /destaques)
  ranking/            ranking de vendedores
  obras/              história e contexto da obra (GET /auction-items/:id/historia)
  chat/               chat por leilão (mensagens só com o leilão aberto)
  institucional/      dados da casa de leilões (rodapé)
  admin/              resumo da plataforma para o painel ADMIN
  realtime/           gateway Socket.io (lances ao vivo) e adaptador de CORS
  saude/              health check
  prisma/             PrismaService (driver adapter)
  common/             guards, decorators, filtros, interceptors, pipes, utils
  generated/prisma/   client do Prisma gerado (fora do Git)
prisma/
  schema.prisma
  migrations/
test/
  *.e2e-spec.ts       testes end-to-end permanentes, por módulo
```
