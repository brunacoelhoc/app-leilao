# Revisão de segurança — AV-08 Plataforma de Leilões

Revisão manual do backend (`BackEnd/`), feita em 2026-09-22, depois de todo o
obrigatório do enunciado estar implementado e testado. Não usa nenhuma
ferramenta automatizada de scan (SAST) além do `npm audit`; o resto foi
inspeção manual de código, guiada pelas categorias mais comuns de risco em
uma API REST com autenticação própria (OWASP API Security Top 10).

## Achados corrigidos nesta revisão

### 1. Login e registro sem limite de tentativas próprio (corrigido)

**Antes:** `/auth/login` e `/auth/registrar` só tinham o limite geral da
aplicação (`RATE_LIMIT_MAX`, padrão 100 requisições/minuto por IP). Isso é
adequado para a API como um todo, mas fraco especificamente para login: um
atacante podia tentar até 100 senhas por minuto por IP antes de ser
bloqueado.

**Correção:** `@Throttle({ default: { limit: 10, ttl: 60_000 } })` em cada
uma das duas rotas (`src/auth/auth.controller.ts`), bem abaixo do limite
geral. 10/min foi escolhido para dar folga confortável sobre o uso real dos
testes e2e (o arquivo mais intenso, `users.e2e-spec.ts`, faz até 5 logins
numa única instância de app) e ainda ser uma redução de 10x sobre o limite
geral.

**Provado com um teste e2e real e isolado**
(`test/auth-rate-limit.e2e-spec.ts`): dispara 11 requisições de verdade
contra cada rota e confirma que a 11ª (e só ela) volta `429`. Roda em um
`AppModule` próprio, para não interferir na contagem de login de nenhum
outro arquivo de teste (o armazenamento do rate limit é em memória, por
instância da aplicação).

### 2. Algoritmo do JWT não fixado explicitamente (corrigido)

**Antes:** `JwtModule`/`JwtStrategy` recebiam o segredo (`JWT_SECRET`), mas
não especificavam `algorithm`/`algorithms`. Com a versão atual do
`jsonwebtoken` (9.0.3) isso **não é uma falha ativa** — a biblioteca já
recusa tokens `alg: none` por padrão e infere um algoritmo HMAC a partir do
tipo da chave —, mas deixar implícito é uma prática frágil: qualquer
mudança futura na lib ou na configuração poderia reabrir a porta para um
ataque de confusão de algoritmo.

**Correção:** `signOptions.algorithm: 'HS256'` no `JwtModule`
(`src/auth/auth.module.ts`) e `algorithms: ['HS256']` na
`JwtStrategy` (`src/auth/jwt.strategy.ts`) — assinatura e verificação
travadas explicitamente no mesmo algoritmo.

Toda a suíte (10 e2e / 106 testes + 5 unitários / 30 testes) foi rodada de
novo depois das duas correções, três vezes seguidas, sem nenhuma falha.

## Pontos verificados e já adequados (evidência)

| Área | Verificação | Evidência |
| --- | --- | --- |
| Senhas | Hash `bcrypt` custo 12, nunca em texto puro, nunca retornada em nenhuma resposta | `@Exclude()` + `ClassSerializerInterceptor`; provado em todo teste de Auth desde o início do projeto |
| Timing attack no login | `bcrypt.compare` roda sempre, mesmo se o e-mail não existir (contra hash fictício) | Medido: ~250ms para os dois casos, antes da correção original |
| Injeção SQL | Nenhum uso de `$queryRawUnsafe`/`$executeRawUnsafe`; o único `$queryRaw` (lock de lance) usa template literal (parametrizado pelo Prisma), o resto é tudo via query builder do Prisma | `grep -rn "queryRaw\|executeRaw" src/` |
| Escalonamento de privilégio | DTO de registro não tem campo `papel` (todo cadastro nasce `BIDDER`); `whitelist`+`forbidNonWhitelisted` recusam (`400`) qualquer campo extra, inclusive `papel` | Testado em `auth.e2e-spec.ts` ("nao e possivel virar ADMIN pelo registro") |
| Rotas sem exceção do `X-API-KEY` | Nenhum `@Public()`/`SkipThrottle`/mecanismo de exceção existe no código; o guard é `APP_GUARD` global | `grep -rn "@Public\|SkipThrottle\|IS_PUBLIC" src/` → vazio |
| Manipulação de recurso de terceiro | Toda checagem de dono é feita no **service**, comparando o id do recurso com `@CurrentUser()`, nunca confiando em um id do corpo/URL | Padrão repetido em Auctions, AuctionItems, Documents, Users; testado em todos |
| Upload — nome de arquivo | Nunca usa o nome original para salvar em disco; gera `randomUUID()+extensão` | `documents.service.ts`; elimina *path traversal* e colisão |
| Upload — presença/tamanho/tipo | Confere presença, `mimetype` real (não a extensão do nome) e tamanho configurável, além de um teto fixo no `multer` | Testado em `documents.e2e-spec.ts` (válido e inválido) |
| Download de arquivo | O caminho no disco vem do `nomeArquivo` gerado (salvo no banco), nunca de um parâmetro da URL — impossível montar um *path traversal* pela API | `documents.service.ts:buscarParaDownload` |
| Erros e logs | Filtro global nunca expõe mensagem interna do Prisma/Postgres na resposta nem no log (só código+stack local); interceptor de log nunca registra cabeçalho, corpo ou query string | `filtro-excecoes.spec.ts`, `log-requisicao.interceptor.spec.ts` |
| CORS | Restrito à origem do front (`FRONTEND_URL`), sem `credentials: true` (a API não usa cookies) | `configurar-aplicacao.ts` |
| Headers de segurança | `helmet()` habilitado (remove `X-Powered-By`, adiciona `X-Content-Type-Options`, `X-Frame-Options` etc.) | Testado com `curl` |
| Segredos no repositório | `.env` fora do Git; `.env.example` só com placeholders; `JWT_SECRET`/`API_KEY` recusados na inicialização se forem o valor de exemplo ou tiverem menos de 32 caracteres | `src/config/variaveis-ambiente.ts` |
| Comparação da API key | `timingSafeEqual`, com checagem de tamanho **antes** (evita o `RangeError` do Node quando os buffers têm tamanhos diferentes, e evita vazar o tamanho certo pelo tempo de resposta) | `common/guards/api-key.guard.ts` |
| Reautorização em tempo real | Papel/status da conta são reconsultados no banco a cada requisição autenticada (não confia soletra no payload do token) | `JwtStrategy.validate`; testado (promoção de papel e desativação valem na hora, sem novo login) |

## Riscos aceitos / limitações conhecidas (documentadas, não corrigidas)

Estes ficam registrados deliberadamente como pendências conhecidas, não
como "resolvidos" — decisão de escopo, não descuido.

1. **Upload sem verificação de assinatura real do arquivo (magic bytes).**
   Hoje só o `mimetype` enviado pelo cliente é conferido, que pode ser
   falsificado no `multipart/form-data`. Uma verificação de assinatura
   (ex.: `file-type`) reduziria o risco de um arquivo malicioso disfarçado
   de imagem. Fora do escopo desta entrega.
2. **Download de documento é uma rota pública** (só exige `X-API-KEY`, não
   JWT). Decisão deliberada — fotos de leilão precisam ser vistas por quem
   ainda não fez login, para atrair lances — mas é o oposto de "servir por
   endpoint autenticado", uma sugestão de bônus do próprio checklist.
3. **Sem endpoint de promoção de papel** (`BIDDER→SELLER`, por exemplo):
   hoje isso só é possível direto no banco. Não é uma falha de segurança em
   si (o inverso, "impedir auto-promoção", está garantido), mas é uma
   lacuna funcional que limita a gestão de usuários pelo `ADMIN`.
4. **Rate limit em memória, por instância.** Reinicia ao reiniciar a API e
   não é compartilhado entre múltiplas instâncias (não há Redis). Aceitável
   para o escopo desta avaliação (uma instância só); seria uma revisão
   necessária antes de rodar em produção com mais de uma réplica.
5. **`npm audit`: 4 vulnerabilidades "high"**, todas dentro de
   dependências transitivas do **próprio pacote `prisma`**
   (`mysql2` e `deepmerge-ts`, usados pelo suporte a MySQL da ferramenta de
   CLI do Prisma). A aplicação nunca importa nem executa esse código — só
   usamos `@prisma/client` + `@prisma/adapter-pg` (Postgres) em tempo de
   execução. Corrigir exigiria atualizar o `prisma` para uma versão que
   quebra o requisito do enunciado de manter a versão travada em
   exatamente `7.10.0`. Risco real percebido: baixo (código morto para este
   projeto); registrado aqui em vez de ignorado silenciosamente.

## Adendo (2026-09-23): infraestrutura adicionada depois desta revisão

O Docker Compose, a paginação/indicadores e o CI foram implementados **depois**
desta revisão (2026-09-22). Registro aqui o que muda em termos de superfície
de segurança — nenhum achado novo, só confirmação:

- **Docker Compose:** o Postgres do container só expõe a porta `5433` no
  **host local** (`docker-compose.yml`), nunca pra fora da máquina. A senha
  vem do `.env` da raiz (`POSTGRES_PASSWORD`), gitignored, igual ao padrão já
  usado no `BackEnd/.env`. A API dentro do container roda com as mesmas
  variáveis/guards já revisados acima — nada muda no código da aplicação.
- **CI (GitHub Actions):** o workflow (`.github/workflows/ci.yml`) tem
  `JWT_SECRET`/`API_KEY` **fixos e falsos** escritos direto no YAML — só para
  satisfazer a validação de `.env` (`src/config/variaveis-ambiente.ts`) num
  banco descartável criado e destruído a cada execução. Não são segredos reais
  e não dão acesso a nada fora daquela execução isolada; documentado aqui para
  quem revisar o workflow não confundir com uma credencial vazada.
- **Paginação e indicadores do domínio:** os endpoints novos (`?pagina=`,
  `?limite=`, `GET /auctions/:id/indicadores`) são todos de **leitura**,
  seguindo exatamente o mesmo padrão de autorização das rotas de listagem já
  revisadas (públicas, sem dado sensível de usuário exposto) — nenhuma
  autorização nova foi introduzida.

## Metodologia

Verificação manual, categoria por categoria (autenticação, autorização,
validação de entrada, injeção, upload, segredos, cabeçalhos HTTP, logs,
dependências), com `grep` para confirmar ausência de padrões perigosos
(`eval`, `queryRawUnsafe`, `@Public`, `console.log` de dados sensíveis) e
`npm audit` para a cadeia de dependências. Não substitui uma ferramenta de
SAST dedicada nem um teste de penetração — é o nível apropriado para o
escopo e o tempo desta avaliação.
