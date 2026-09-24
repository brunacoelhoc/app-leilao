# Belle Époque Leilões

Plataforma de leilões online de arte e antiguidades: vendedores publicam peças com ficha técnica e fotos,
compradores disputam lances **em tempo real** e o servidor encerra o leilão e define o vencedor.

Projeto da avaliação **AV-08 — Plataforma de Leilões**.

[![CI](https://github.com/brunacoelhoc/app-leilao/actions/workflows/ci.yml/badge.svg)](https://github.com/brunacoelhoc/app-leilao/actions/workflows/ci.yml)
![NestJS](https://img.shields.io/badge/NestJS-12-E0234E?logo=nestjs&logoColor=white)
![Angular](https://img.shields.io/badge/Angular-22-DD0031?logo=angular&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7.10.0-2D3748?logo=prisma&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)

## Sumário

- [Visão geral](#visão-geral)
- [Como funciona um leilão](#como-funciona-um-leilão)
- [Perfis e permissões](#perfis-e-permissões)
- [Funcionalidades](#funcionalidades)
- [Arquitetura](#arquitetura)
- [Início rápido](#início-rápido)
- [Testes e CI](#testes-e-ci)
- [Segurança](#segurança)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Documentação complementar](#documentação-complementar)
- [Créditos das obras](#créditos-das-obras)

## Visão geral

| Camada | Tecnologia | Papel |
| --- | --- | --- |
| **Back-end** ([`BackEnd/`](BackEnd/README.md)) | NestJS 12, Prisma 7, PostgreSQL 18, Socket.io | API REST + WebSocket. **Concentra toda a regra de negócio e validação.** |
| **Front-end** ([`FrontEnd/`](FrontEnd/README.md)) | Angular 22 (standalone + signals), Three.js | Interface. **Só exibe e coleta dados**, sem regra de negócio. |
| **Infra** | Docker Compose, GitHub Actions | Sobe API + banco com um comando; CI valida build, lint e testes. |

## Como funciona um leilão

- **Leilão** é o evento (título, período, status). **Item** é a peça vendida; os **lances pertencem ao item**.
- Ciclo de vida do leilão: `DRAFT` → `SCHEDULED` → `OPEN` → `CLOSED` (ou `CANCELED`).
- Um lance só é aceito com o leilão `OPEN` e precisa superar o lance atual em pelo menos o **incremento mínimo**.
  Lances são **imutáveis** e a concorrência é resolvida com **lock pessimista** no banco.
- Ao encerrar, o item com lance vira `SOLD` (vence o maior lance); sem lance, `UNSOLD`.
- Cada lance é transmitido a todos os participantes da sala por WebSocket, com cronômetro regressivo.

## Perfis e permissões

| Perfil | Pode |
| --- | --- |
| **Visitante** (sem login) | Explorar destaques, ranking, leilões, peças e histórico público de lances; ler o chat. |
| **BIDDER** (comprador) | Dar lances, acompanhar "Meus lances", participar do chat e editar o perfil. Todo cadastro nasce assim. Para vender, ativa o **modo vendedor** com um clique no menu. |
| **SELLER** (vendedor) | Mesma conta no **modo vendedor**: cria leilões e itens (com ficha técnica e fotos), consulta CEP e conduz o status do leilão. Neste modo **não dá lances**; volta ao modo comprador com um clique. |
| **ADMIN** | Gerenciar categorias e usuários (criar, desativar, reativar), moderar leilões e ver indicadores da plataforma. |

Para **dar lance** ou **criar leilão**, o perfil precisa estar completo (telefone, CPF válido e endereço); a regra é validada no servidor. Ninguém dá lance no próprio leilão, em nenhum dos modos.

A matriz completa de permissões por endpoint está em [`BackEnd/README.md`](BackEnd/README.md#matriz-de-permissões).

## Funcionalidades

- **Lances em tempo real** (Socket.io) e **chat** por leilão.
- **Anti-sniping**: lance nos últimos 2 minutos estende o prazo (+2 min), decidido pelo servidor na mesma transação do lance; o cronômetro de todos sobe ao vivo e a tela mostra "prazo estendido".
- **Indicadores por leilão**: total de lances, maior lance, itens vendidos e total arrecadado (`Decimal`, nunca `Float`).
- **Ranking de vendedores** por valor arrecadado e **destaques** na página inicial.
- **Ficha técnica** das obras (autor, época, técnica, dimensões, conservação, procedência) e **visualizador 3D** da peça.
- **Upload** de fotos e documentos, com **validação do conteúdo real do arquivo** (assinatura JPEG/PNG/PDF, não só o tipo informado). Fotos são servidas por URL pública com cache; documentos exigem a chave da API.
- **Modo comprador / vendedor**: a mesma conta alterna com um clique (vendedor cria leilões, comprador dá lances; ninguém dá lance no próprio leilão). Lance e criação de leilão exigem **perfil completo** (telefone, CPF válido e endereço).
- **Recuperação de senha** com código de 6 dígitos de uso único (só o hash fica no banco), validade de 15 minutos, limite de 5 tentativas e de 3 pedidos por hora. O envio do e-mail é **simulado** (o código aparece no log do servidor).
- **Sessões seguras**: login abre uma sessão renovável (refresh token) e o logout a encerra de verdade no servidor.
- **Aceite dos termos de uso** gravado no banco no cadastro e **privacidade** dos nomes (histórico de lances, tempo real e chat mostram "Maria S.").
- **Integração externa real**: consulta de CEP via ViaCEP.
- **Auditoria** de ações sensíveis em tabelas append-only (triggers impedem `UPDATE`/`DELETE`).
- **Paginação e filtros** em todas as listagens.
- **Swagger** interativo em `/docs`.
- **Acessibilidade**: barra de acessibilidade e interface responsiva.

## Arquitetura

```
 Angular (4200) ──HTTP + JWT + X-API-KEY──▶ NestJS (3000) ──Prisma──▶ PostgreSQL
        ▲                                        │
        └──────────── WebSocket (lances, chat) ◀─┘
```

Decisões principais:

- **Regra só no back-end**: o front nunca decide status, valor mínimo de lance nem permissões.
- **Modelos e enums em inglês** (`User`, `Auction`, `AuctionItem`, `Bid`…); campos, mensagens e comentários em português.
- **Migrations versionadas** com `CHECK` constraints e triggers de imutabilidade.
- **IDs UUID**; erros num formato padrão único (ver README do back-end).

## Início rápido

### Opção A — Docker (API + banco)

```bash
cp .env.example .env                    # defina POSTGRES_PASSWORD
cp BackEnd/.env.example BackEnd/.env    # preencha JWT_SECRET e API_KEY
docker compose up --build
```

API em `http://localhost:3000/api` · Swagger em `http://localhost:3000/docs`.

### Opção B — Local

Requisitos: Node.js 20+, PostgreSQL 18, npm.

```bash
# Back-end
cd BackEnd
npm install
cp .env.example .env            # ajuste DATABASE_URL, DATABASE_URL_TESTE (só para os testes), JWT_SECRET, API_KEY
npx prisma migrate deploy
npx prisma generate
npm run seed                    # dados de exemplo (idempotente)
npm run fotos:demo              # anexa obras do acervo aos itens
npm run start:dev               # http://localhost:3000

# Front-end (outro terminal)
cd FrontEnd
npm install
cp src/app/core/environment.example.ts src/app/core/environment.ts   # apiUrl e apiKey
npm start                       # http://localhost:4200
```

Detalhes de variáveis de ambiente, endpoints e exemplos de requisição: [`BackEnd/README.md`](BackEnd/README.md).

## Testes e CI

```bash
cd BackEnd
npm run lint
npm run build
npm test            # unitários
npm run test:e2e    # e2e contra um PostgreSQL real e SEPARADO (DATABASE_URL_TESTE), recriado a cada execução
```

O workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda em cada push/PR para `main`: sobe um
`postgres:18` efêmero, aplica as migrations do zero e executa lint, build, testes unitários e e2e.
A coleção do Thunder Client está em [`BackEnd/thunder-tests/`](BackEnd/thunder-tests/README.md).

## Segurança

- Autenticação **JWT (HS256 fixado)** e chave **`X-API-KEY`** exigida em toda rota de negócio.
- **Rate limiting** global e específico em login, cadastro e recuperação de senha; **Helmet** e **CORS** restrito ao front.
- Validação estrita de DTOs (`whitelist` + `forbidNonWhitelisted`); dados pessoais **mascarados** nas listagens.
- Senhas com hash; segredos apenas em `.env` (fora do Git); validação de variáveis na inicialização.
- **Upload seguro**: tipo declarado **e** assinatura real do arquivo (magic bytes), nome aleatório, tamanho limitado, hash SHA-256.
- **Recuperação de senha** sem revelar se o e-mail existe, com código só em hash, validade, tentativas limitadas e uso único.
- **Sessões com refresh token rotativo e logout que invalida o token**: access token de 15 minutos, refresh token de uso único (só o hash no banco, reuso derruba a sessão), sessão de 7 dias sem uso; trocar ou redefinir a senha revoga as sessões.
- **Sessão enxuta no navegador**: só os tokens ficam salvos; os dados pessoais vêm do servidor a cada abertura e nunca ficam no `localStorage`.
- Revisão de segurança documentada em [`REVISAO-SEGURANCA.md`](REVISAO-SEGURANCA.md).

## Estrutura do repositório

```
.
├── BackEnd/                 API NestJS (src/, prisma/, test/, scripts/, thunder-tests/)
├── FrontEnd/                Aplicação Angular (src/app/, public/acervo/)
├── .github/workflows/       Pipeline de CI
├── docker-compose.yml       API + PostgreSQL
├── .env.example             Variáveis do Docker Compose
└── REVISAO-SEGURANCA.md     Revisão de segurança
```

## Documentação complementar

- [`BackEnd/README.md`](BackEnd/README.md) — API, variáveis, endpoints, permissões, tempo real, decisões.
- [`FrontEnd/README.md`](FrontEnd/README.md) — telas, rotas e como rodar a interface.
- [`REVISAO-SEGURANCA.md`](REVISAO-SEGURANCA.md) — análise de segurança.

## Créditos das obras

As imagens do acervo são obras de **domínio público**; autoria e fontes em
[`FrontEnd/public/acervo/CREDITOS.md`](FrontEnd/public/acervo/CREDITOS.md).
