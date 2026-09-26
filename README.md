# Belle Époque Leilões

> *"Toda peça rara conta uma história."*

Plataforma de leilões online de **arte e antiguidades**: vendedores publicam peças com ficha técnica e fotos,
compradores disputam lances **em tempo real** e o servidor encerra o leilão e define o vencedor.
Projeto da avaliação **AV-08 — Plataforma de Leilões**.

[![CI](https://github.com/brunacoelhoc/app-leilao/actions/workflows/ci.yml/badge.svg)](https://github.com/brunacoelhoc/app-leilao/actions/workflows/ci.yml)
![NestJS](https://img.shields.io/badge/NestJS-12-E0234E?logo=nestjs&logoColor=white)
![Angular](https://img.shields.io/badge/Angular-22-DD0031?logo=angular&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7.10.0-2D3748?logo=prisma&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

![Página inicial da Belle Époque Leilões](docs/img/01-home.jpg)

## Sumário

- [Sobre o projeto](#sobre-o-projeto)
- [Histórias de usuário](#histórias-de-usuário)
- [Telas](#telas)
- [Funcionalidades](#funcionalidades)
- [Como funciona um leilão](#como-funciona-um-leilão)
- [Perfis e permissões](#perfis-e-permissões)
- [Arquitetura](#arquitetura)
- [Como rodar na sua máquina](#como-rodar-na-sua-máquina)
  - [Pré-requisitos](#pré-requisitos)
  - [Passo 1 — Baixar o projeto](#passo-1--baixar-o-projeto)
  - [Passo 2 — Configurar as variáveis](#passo-2--configurar-as-variáveis)
  - [Passo 3 — Subir a API e o banco](#passo-3--subir-a-api-e-o-banco)
  - [Passo 4 — Criar os dados de exemplo](#passo-4--criar-os-dados-de-exemplo)
  - [Passo 5 — Subir o front-end](#passo-5--subir-o-front-end)
  - [Primeiro acesso](#primeiro-acesso)
  - [Conferindo que está tudo certo](#conferindo-que-está-tudo-certo)
  - [Parar e limpar tudo](#parar-e-limpar-tudo)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Comandos úteis](#comandos-úteis)
- [Usando a API](#usando-a-api)
- [Testes e CI](#testes-e-ci)
- [Segurança](#segurança)
- [Solução de problemas](#solução-de-problemas)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Limitações conhecidas e próximos passos](#limitações-conhecidas-e-próximos-passos)
- [Contribuindo](#contribuindo)
- [Documentação complementar](#documentação-complementar)
- [Autoria, créditos e licença](#autoria-créditos-e-licença)

## Sobre o projeto

A **Belle Époque** é uma casa de leilões (fictícia) que quer levar o leilão de arte e antiguidades para a internet
**sem perder a seriedade do salão**:

- O **vendedor** (uma galeria, um antiquário, um colecionador) cadastra o leilão, descreve cada peça com **ficha técnica**
  e envia fotos. O endereço de retirada é preenchido com um serviço real (ViaCEP).
- O **comprador** entra na sala de uma peça e **dá lances ao vivo**: cada lance aparece para todos na hora, com cronômetro
  regressivo e chat.
- Quando o prazo acaba, o **servidor fecha o leilão sozinho**, decide o vencedor e a peça vira "vendida" (ou "não vendida").
- O **administrador** cuida da plataforma: categorias, usuários, moderação e indicadores.

O que dá confiança a um leilão é saber que **ninguém manipula o preço** e que **o vencedor é justo**. Por isso o sistema
tem lances imutáveis, vendedor que não dá lance na própria peça, vencedor decidido pelo servidor e tudo auditável.
A história completa, com os personagens e as regras, está em [`HISTORIA-DA-APLICACAO.md`](HISTORIA-DA-APLICACAO.md).

| Camada | Tecnologia | Papel |
| --- | --- | --- |
| **Back-end** ([`BackEnd/`](BackEnd/README.md)) | NestJS 12, Prisma 7, PostgreSQL 18, Socket.io | API REST + WebSocket. **Concentra toda a regra de negócio e a validação.** |
| **Front-end** ([`FrontEnd/`](FrontEnd/README.md)) | Angular 22 (standalone + signals), Three.js | Interface. **Só exibe e coleta dados**, sem regra de negócio. |
| **Infra** | Docker Compose, GitHub Actions | Sobe API + banco com um comando; o CI valida build, lint e testes. |

## Histórias de usuário

| Quem | Quero… | Para… | Como o sistema entrega |
| --- | --- | --- | --- |
| **Visitante** | explorar destaques, ranking, leilões e peças sem me cadastrar | decidir se vale a pena participar | Leitura pública; nomes abreviados ("Maria S.") |
| **Comprador** | dar um lance e ver, na hora, se alguém me cobriu | disputar a peça sem recarregar a página | Lances em tempo real (Socket.io) e cronômetro |
| **Comprador** | ter certeza de que o lance mínimo e o prazo são respeitados | confiar no resultado | Regra e prazo validados no servidor, com lock no banco |
| **Comprador** | não perder a peça por um lance no último segundo | competir de forma justa | Anti-sniping: lance nos últimos 2 min estende o prazo |
| **Comprador** | acompanhar as peças que ganhei, perdi ou disputo | organizar minhas compras | Tela "Meus lances" e pedido pós-leilão |
| **Vendedor** | cadastrar leilão e peças com ficha técnica e fotos | apresentar a obra com credibilidade | Painel do vendedor, upload validado e ViaCEP |
| **Vendedor** | conduzir o leilão (agendar, abrir, cancelar) | controlar a venda das minhas peças | Máquina de estados; só o dono conduz |
| **Vendedor** | aparecer no ranking | ganhar visibilidade com as boas vendas | Ranking por total arrecadado |
| **Administrador** | gerenciar categorias e usuários e moderar leilões | manter a plataforma saudável | Painel administrativo; cancelar e reativar com motivo |
| **Qualquer pessoa** | apagar meus dados quando eu quiser | ter meu direito de privacidade respeitado (LGPD) | Encerramento de conta com anonimização |

## Telas

| Peça com lances ao vivo | Painel do vendedor |
| --- | --- |
| ![Peça em leilão](docs/img/02-peca-com-lance.jpg) | ![Painel do vendedor](docs/img/03-painel-vendedor.jpg) |

| Painel administrativo | Versão para celular |
| --- | --- |
| ![Painel administrativo](docs/img/04-painel-admin.jpg) | <img src="docs/img/05-celular.jpg" alt="Versão para celular" width="220"> |

## Funcionalidades

- **Lances em tempo real** (Socket.io) e **chat** por leilão.
- **Anti-sniping**: lance nos últimos 2 minutos estende o prazo (+2 min), decidido pelo servidor na mesma transação do lance.
- **Indicadores por leilão**: total de lances, maior lance, itens vendidos e total arrecadado (`Decimal`, nunca `Float`).
- **Ranking de vendedores** e **destaques** na página inicial.
- **Ficha técnica** das obras (autor, época, técnica, dimensões, conservação, procedência) e **visualizador 3D** da peça.
- **Upload** de fotos e documentos com **validação do conteúdo real do arquivo** (assinatura JPEG/PNG/PDF, não só o tipo informado).
  Fotos têm URL pública com cache; certificados e laudos exigem login.
- **Modo comprador / vendedor**: a mesma conta alterna com um clique; ninguém dá lance no próprio leilão.
  Lance e criação de leilão exigem **perfil completo** (telefone, CPF válido e endereço).
- **Pós-leilão**: o vencedor paga (simulado) e escolhe retirada ou entrega.
- **Recuperação de senha** com código de 6 dígitos de uso único, validade de 15 minutos e tentativas limitadas
  (o envio do e-mail é **simulado**: o código aparece no log da API).
- **Sessões seguras**: refresh token rotativo e logout que encerra a sessão no servidor.
- **Encerrar a própria conta (LGPD)**: anonimiza os dados pessoais e mantém o histórico imutável.
- **Rascunhos e leilões cancelados** não aparecem nas listas públicas: só o dono e o administrador os veem.
- **Auditoria** de ações sensíveis em tabelas somente-inserção (triggers impedem `UPDATE`, `DELETE` e `TRUNCATE`).
- **Paginação e filtros** em todas as listagens, e **Swagger** interativo em `/docs`.
- **Acessibilidade**: barra de acessibilidade, alto contraste, fonte ajustável e interface responsiva.

## Como funciona um leilão

- **Leilão** é o evento (título, período, status); **item** é a peça vendida; os **lances pertencem ao item**.
- Ciclo de vida: `DRAFT` → `SCHEDULED` → `OPEN` → `CLOSED` (ou `CANCELED`, que o administrador pode reativar).
- Um lance só é aceito com o leilão `OPEN`, dentro do período, e precisa superar o lance atual em pelo menos o
  **incremento mínimo**. Lances são **imutáveis** e a concorrência é resolvida com **lock pessimista** no banco.
- Um leilão dura no máximo **48 horas** (o anti-sniping pode estender o prazo).
- Ao encerrar, o item com lance vira `SOLD` (vence o maior lance de uma conta ativa); sem lance, `UNSOLD`.

## Perfis e permissões

| Perfil | Pode |
| --- | --- |
| **Visitante** (sem login) | Explorar destaques, ranking, leilões, peças e o histórico público de lances; ler o chat. |
| **BIDDER** (comprador) | Dar lances, acompanhar "Meus lances", participar do chat e editar o perfil. **Todo cadastro nasce assim.** Para vender, ativa o **modo vendedor** com um clique no menu. |
| **SELLER** (vendedor) | Mesma conta no **modo vendedor**: cria leilões e itens, consulta CEP e conduz o status do **próprio** leilão. Neste modo **não dá lances**. |
| **ADMIN** | Gerencia categorias e usuários, modera leilões (cancelar e reativar, com motivo) e vê indicadores. Não cria leilão nem dá lance. |

Ninguém manipula o recurso de outra pessoa só trocando o `id` na requisição: a API confere o dono.
A matriz completa por endpoint está em [`BackEnd/README.md`](BackEnd/README.md#matriz-de-permissões).

## Arquitetura

```
 Angular (4200) ──HTTP + JWT + X-API-KEY──▶ NestJS (3092) ──Prisma──▶ PostgreSQL (5433)
        ▲                                        │
        └──────────── WebSocket (lances, chat) ◀─┘
```

Decisões principais:

- **Regra só no back-end**: o front nunca decide status, valor mínimo de lance nem permissões.
- **Defesa em profundidade**: as regras críticas também existem no banco (`CHECK`, `UNIQUE`, triggers de imutabilidade).
- **Modelos e enums em inglês** (`User`, `Auction`, `AuctionItem`, `Bid`…); campos, mensagens e comentários em português.
- **Migrations versionadas**, IDs UUID e erros num formato padrão único (ver [`BackEnd/README.md`](BackEnd/README.md)).

## Como rodar na sua máquina

Este passo a passo foi **testado a partir de um clone limpo** (instalação, migrations, seed, API, login e build do front).

### Pré-requisitos

| Ferramenta | Versão | Para quê |
| --- | --- | --- |
| **Git** | qualquer recente | baixar o projeto |
| **Node.js** | **24 (LTS)** — há um `.nvmrc` na raiz | back-end, front-end e seed |
| **Docker Desktop** (com Compose v2) | recente | banco PostgreSQL e API |

Portas livres: **3092** (API), **4200** (front), **5433** (PostgreSQL) e **5050** (pgAdmin).

### Passo 1 — Baixar o projeto

```bash
git clone https://github.com/brunacoelhoc/app-leilao.git
cd app-leilao
```

### Passo 2 — Configurar as variáveis

Crie os dois arquivos `.env` a partir dos modelos (ambos ficam **fora do Git**):

```bash
cp .env.example .env                    # senha do PostgreSQL usada pelo Docker
cp BackEnd/.env.example BackEnd/.env    # segredos e configurações da API
```

Gere dois segredos aleatórios (rode duas vezes) e copie os resultados:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Edite os arquivos:

1. **`.env`** (raiz): troque `POSTGRES_PASSWORD` por uma senha qualquer.
2. **`BackEnd/.env`**:
   - `JWT_SECRET` → o primeiro segredo gerado.
   - `API_KEY` → o segundo segredo gerado.
   - `DATABASE_URL` → `postgresql://leiloes:SUA_SENHA@localhost:5433/leiloes` (a mesma senha do `POSTGRES_PASSWORD`).
   - `DATABASE_URL_TESTE` → `postgresql://leiloes:SUA_SENHA@localhost:5433/leiloes_teste` (só para os testes automatizados).

> No Windows, o `cp` funciona no PowerShell e no Git Bash. O usuário do banco (`leiloes`) e o nome do banco (`leiloes`) já vêm do `docker-compose.yml`.

### Passo 3 — Subir a API e o banco

Escolha **uma** das opções:

**Opção A — Docker (recomendada): API + PostgreSQL + pgAdmin**

```bash
docker compose up --build -d
docker compose ps                       # api, postgres e pgadmin devem estar "Up"
```

A API aplica as migrations sozinha ao subir.
API: `http://localhost:3092/api` · Swagger: `http://localhost:3092/docs` · pgAdmin: `http://localhost:5050` (já ligado ao banco).

**Opção B — API local (fora do Docker), só com o banco no Docker**

```bash
docker compose up -d postgres
cd BackEnd
npm install
npx prisma migrate deploy
npx prisma generate
npm run start:dev                       # http://localhost:3092
```

> **Não suba a API do Docker e a local juntas** (as duas usam a porta 3092). Para rodar local: `docker compose stop api`.

### Passo 4 — Criar os dados de exemplo

O banco nasce **vazio**. O seed cria usuários, categorias, leilões, peças e lances de demonstração
(é idempotente: pode rodar de novo sem duplicar):

```bash
cd BackEnd
npm install                 # pule se já fez na Opção B
npx prisma generate         # pule se já fez na Opção B
npm run seed                # contas de exemplo, categorias, leilões e itens
npm run fotos:demo          # anexa as obras do acervo às peças
```

### Passo 5 — Subir o front-end

```bash
cd FrontEnd
npm install
cp src/app/core/environment.example.ts src/app/core/environment.ts
```

Abra `FrontEnd/src/app/core/environment.ts` e preencha:

```ts
export const environment = {
  apiUrl: 'http://localhost:3092/api',
  apiKey: 'COLE_AQUI_A_MESMA_API_KEY_DO_BackEnd/.env',
};
```

```bash
npm start                   # http://localhost:4200
```

### Primeiro acesso

Abra **http://localhost:4200** e entre com uma das contas criadas pelo seed (**somente para o ambiente local**):

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Administrador | `admin@belleepoque.com` | `Admin@123!` |
| Vendedor (casa de leilões) | `vendedor@belleepoque.com` | `Vendedor@123!` |
| Comprador | `comprador@belleepoque.com` | `Comprador@123!` |

Ou clique em **Cadastrar** para criar a sua conta (todo cadastro novo é comprador).

### Conferindo que está tudo certo

| O que conferir | Como | Esperado |
| --- | --- | --- |
| API e banco | `curl` no comando abaixo (a rota exige o cabeçalho `X-API-KEY`, então não abre direto no navegador) | `{"status":"ok","banco":"conectado",...}` |
| Documentação | abrir `http://localhost:3092/docs` | Swagger carregado |
| Dados de exemplo | abrir `http://localhost:4200` | leilões e destaques na página inicial |

```bash
curl -H "X-API-KEY: SUA_API_KEY" http://localhost:3092/api/saude
```

### Parar e limpar tudo

```bash
docker compose stop            # para os containers (os dados permanecem)
docker compose down            # remove os containers (os dados permanecem no volume)
docker compose down -v         # ⚠️ remove também o banco: apaga TODOS os dados
```

Os dados ficam no volume `avaliacao-bimestral_leiloes_postgres_data` e sobrevivem a `stop`, `down`, reinício e rebuild.
Backup do banco: `.\scripts\backup-banco.ps1` (gera `backups\leiloes-AAAA-MM-DD_HHmm.sql`).

## Variáveis de ambiente

Arquivo `BackEnd/.env` (modelo em [`BackEnd/.env.example`](BackEnd/.env.example)). A API **valida tudo na inicialização**
e não sobe com valor ausente ou inválido.

| Variável | Para que serve | Exemplo / padrão |
| --- | --- | --- |
| `DATABASE_URL` | Conexão com o PostgreSQL | `postgresql://leiloes:SENHA@localhost:5433/leiloes` |
| `JWT_SECRET` | Segredo que assina o token de acesso (use um valor longo e aleatório) | 64 caracteres hexadecimais |
| `JWT_EXPIRES_IN` | Validade do token de acesso (a renovação é pelo refresh token) | `35m` |
| `API_KEY` | Chave exigida no cabeçalho `X-API-KEY` de toda rota de negócio | 64 caracteres hexadecimais |
| `PORT` | Porta da API | `3092` |
| `FRONTEND_URL` | Origem liberada no CORS | `http://localhost:4200` |
| `CEP_API_URL` / `CEP_API_TIMEOUT_MS` | Serviço de CEP e tempo limite | `https://viacep.com.br/ws` / `5000` |
| `UPLOAD_MAX_SIZE_MB` | Tamanho máximo de um upload | `5` |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_JANELA_MS` | Limite de requisições por IP e janela | `100` / `60000` |
| `DATABASE_URL_TESTE` | Banco **separado** dos testes e2e (o nome precisa conter `test`) | `.../leiloes_teste` |

Na raiz, o `.env` tem só `POSTGRES_PASSWORD` (usado pelo `docker-compose.yml`).
Descrição completa em [`BackEnd/README.md`](BackEnd/README.md).

## Comandos úteis

| Onde | Comando | O que faz |
| --- | --- | --- |
| `BackEnd/` | `npm run start:dev` | API com recarga automática |
| `BackEnd/` | `npm run build` / `npm run start:prod` | build de produção e execução do build |
| `BackEnd/` | `npm run lint` | análise estática |
| `BackEnd/` | `npm test` / `npm run test:e2e` | testes unitários / testes e2e com PostgreSQL real |
| `BackEnd/` | `npm run seed` / `npm run fotos:demo` | dados de exemplo / fotos das obras |
| `BackEnd/` | `npx prisma migrate deploy` | aplica as migrations |
| `FrontEnd/` | `npm start` / `npm run build` / `npm test` | front em desenvolvimento / build / testes |
| raiz | `docker compose logs -f api` | acompanha o log da API (o código de recuperação de senha aparece aqui) |
| raiz | `.\scripts\backup-banco.ps1` | backup do banco do Docker |

## Usando a API

- **Swagger** (`/docs`): clique em **Authorize** e preencha o cadeado `api-key`; faça `POST /auth/login` e cole o
  `accessToken` no cadeado `jwt` (sem a palavra "Bearer").
- **Thunder Client**: coleção pronta em [`BackEnd/thunder-tests/`](BackEnd/thunder-tests/README.md).
- **Lista completa de endpoints**, com permissão, corpo e respostas, em [`BackEnd/README.md`](BackEnd/README.md).

Exemplo com `curl` (no PowerShell, use `curl.exe`; no Windows o Swagger costuma ser mais prático):

```bash
# 1) entrar
curl -X POST http://localhost:3092/api/auth/login \
  -H "X-API-KEY: SUA_API_KEY" -H "Content-Type: application/json" \
  -d '{"email":"comprador@belleepoque.com","senha":"Comprador@123!"}'

# 2) listar leilões (rota pública: só precisa da chave)
curl -H "X-API-KEY: SUA_API_KEY" "http://localhost:3092/api/auctions?limite=5"

# 3) dar um lance (rota privada: chave + token)
curl -X POST http://localhost:3092/api/auction-items/ID_DO_ITEM/bids \
  -H "X-API-KEY: SUA_API_KEY" -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" -d '{"valor": 1000}'
```

Todo erro vem no mesmo formato: `{ "statusCode", "erro", "mensagem", "caminho", "dataHora" }`.

## Testes e CI

```bash
cd BackEnd
npm run lint
npm run build
npm test            # unitários
npm run test:e2e    # e2e contra um PostgreSQL real e SEPARADO (DATABASE_URL_TESTE), recriado a cada execução

cd ../FrontEnd
npm test
```

A suíte e2e (mais de **350 testes**) cobre os **10 cenários obrigatórios do enunciado** (fluxo principal, `400`, `401`,
`403`, `404`, `409`, acesso a recurso de terceiro, upload válido e inválido, integração externa funcionando e falhando de
forma controlada, e fluxo completo de mudança de estado), além de concorrência (dezenas de lances simultâneos),
anti-sniping, encerramento automático, regras do banco e validação de entrada.

O workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda em cada push/PR: sobe um `postgres:18` efêmero,
aplica as migrations do zero e executa lint, build, testes unitários e e2e.

## Segurança

- Autenticação **JWT (HS256 fixado)** e chave **`X-API-KEY`** exigida em toda rota de negócio.
- **Rate limiting** global e específico em login, cadastro e recuperação de senha; **Helmet**, compressão e **CORS** restrito ao front.
- Validação estrita de DTOs (`whitelist` + `forbidNonWhitelisted`); texto com caractere nulo, valores acima do limite do banco e
  corpo grande demais são recusados com erro claro; dados pessoais **mascarados** nas listagens.
- Senhas com hash; segredos apenas em `.env` (fora do Git); logs sem segredos.
- **Upload seguro**: tipo declarado **e** assinatura real do arquivo, nome aleatório, tamanho limitado, hash SHA-256.
- **Sessões**: access token de 35 minutos (configurável), refresh token rotativo e de uso único (só o hash no banco; o reuso
  derruba a sessão), logout que invalida o token e revogação ao trocar a senha ou desativar a conta.
- **Banco**: `CHECK`, `UNIQUE`, chaves estrangeiras `RESTRICT` e triggers que impedem alterar ou apagar lances, auditoria e histórico.
- Revisão de segurança documentada em [`REVISAO-SEGURANCA.md`](REVISAO-SEGURANCA.md).

## Solução de problemas

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| `401` "API key ausente" ou "API key inválida" | Faltou (ou está errado) o cabeçalho `X-API-KEY`; no Swagger, o cadeado `api-key` | Envie a chave do `BackEnd/.env` |
| `401` "Token ausente" ou "inválido ou expirado" | Faltou o token, ou o de acesso venceu | Entre de novo (no Swagger, cole o novo token no cadeado `jwt`) |
| O front mostra "Não foi possível carregar…" | `apiUrl` ou `apiKey` errados em `environment.ts`, ou API fora do ar | Confira a porta (3092), a chave e `http://localhost:3092/api/saude` |
| A API não sobe: erro de variável de ambiente | Variável ausente ou inválida no `BackEnd/.env` | Leia a mensagem: ela diz qual variável corrigir |
| `P1000` / falha de autenticação no banco | Senha do `DATABASE_URL` diferente do `POSTGRES_PASSWORD` do Docker | Use a mesma senha nos dois arquivos |
| `EADDRINUSE` / porta 3092 ocupada | API do Docker e API local rodando juntas | `docker compose stop api` ou pare a local |
| `Cannot find module '.../generated/prisma'` | Faltou gerar o cliente do Prisma | `cd BackEnd && npx prisma generate` |
| Entrei, mas não há leilões nem contas | O banco está vazio | Rode `npm run seed` (Passo 4) |
| Foto da peça não aparece depois de trocar entre API local e Docker | Cada uma guarda os uploads no seu próprio disco | Use só uma das duas; rode `npm run fotos:demo` |
| `429` "Muitas requisições" | Limite de requisições por minuto | Aguarde 1 minuto |
| Não recebi o código de recuperação de senha | O envio de e-mail é simulado | Veja o código com `docker compose logs api` |
| Os testes e2e reclamam do banco | `DATABASE_URL_TESTE` ausente ou igual ao `DATABASE_URL` | Aponte para um banco separado cujo nome contenha `test` |

## Estrutura do repositório

```
.
├── BackEnd/                 API NestJS (src/, prisma/, test/, scripts/, thunder-tests/)
├── FrontEnd/                Aplicação Angular (src/app/, public/acervo/)
├── docs/img/                Capturas de tela usadas neste README
├── .github/workflows/       Pipeline de CI
├── docker/pgadmin/          Servidor pré-cadastrado do pgAdmin
├── scripts/backup-banco.ps1 Backup (pg_dump) do banco do Docker
├── docker-compose.yml       API + PostgreSQL + pgAdmin
├── .env.example             Variáveis do Docker Compose
├── .nvmrc                   Versão do Node recomendada
└── *.md                     Documentação de apoio (história, segurança, glossário…)
```

## Limitações conhecidas e próximos passos

Em nome da transparência, o que **ainda não** é de produção:

- **E-mail simulado**: o código de recuperação de senha é escrito no log. Falta ligar um provedor real de e-mail.
- **Pagamento simulado**: o pós-leilão registra o pagamento sem gateway real.
- **Tokens no `localStorage`**: é um trade-off conhecido; a alternativa mais forte é cookie `httpOnly` com proteção CSRF.
- **Usuário do banco**: a API conecta como dono das tabelas; o ideal é um usuário só da aplicação, sem `TRUNCATE` nem `ALTER`.
- **Teste de carga**: há testes de concorrência, mas não um teste de carga sustentada.
- **Dados de exemplo**: o seed cria leilões abertos por vários anos para facilitar a demonstração, o que foge da regra de 48 horas.

Ideias para a evolução: notificações por e-mail e push, gateway de pagamento, moderação de imagens, internacionalização e mais idiomas.

## Contribuindo

1. Crie uma branch a partir de `main` (`feat/…`, `fix/…`).
2. Rode `npm run lint`, `npm run build`, `npm test` e `npm run test:e2e` em `BackEnd/`, e `npm test` em `FrontEnd/`.
3. Escreva commits curtos e claros, no imperativo (`fix: …`, `feat: …`, `test: …`).
4. Abra um Pull Request: o CI precisa passar.

Regras do projeto: **regra de negócio só no back-end**, nada de segredo no Git, e toda regra nova precisa de teste.

## Documentação complementar

- [`BackEnd/README.md`](BackEnd/README.md) — API, variáveis, endpoints, permissões, tempo real e decisões.
- [`FrontEnd/README.md`](FrontEnd/README.md) — telas, rotas e como rodar a interface.
- [`HISTORIA-DA-APLICACAO.md`](HISTORIA-DA-APLICACAO.md) — a história do produto, os personagens e as regras.
- [`AV-08-LEILOES.md`](AV-08-LEILOES.md) — o enunciado da avaliação.
- [`REVISAO-SEGURANCA.md`](REVISAO-SEGURANCA.md) — análise de segurança.
- [`GLOSSARIO.md`](GLOSSARIO.md) e [`INSUMOS-APRESENTACAO.md`](INSUMOS-APRESENTACAO.md) — termos e roteiro de apresentação.

## Autoria, créditos e licença

- **Autoria:** Bruna Coelho — projeto acadêmico da avaliação **AV-08**.
- **Imagens do acervo:** obras de **domínio público**; autoria e fontes em
  [`FrontEnd/public/acervo/CREDITOS.md`](FrontEnd/public/acervo/CREDITOS.md).
- **Licença:** projeto acadêmico, sem licença de código aberto definida. Antes de reutilizar o código, fale com a autora.
