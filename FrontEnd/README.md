# Belle Époque Leilões — Front-end (Angular)

Interface da plataforma de leilões de arte e antiguidades. Consome a API do
[`BackEnd/`](../BackEnd/README.md) e recebe lances em tempo real por Socket.io.
**O front só exibe e coleta dados: toda regra de negócio fica no backend.**

## Stack

Angular (componentes standalone, signals, rotas com lazy load) · SweetAlert2 ·
Three.js (visualizador 3D) · socket.io-client · Vitest.

## Como rodar

```bash
npm install
cp src/app/core/environment.example.ts src/app/core/environment.ts   # e preencha apiUrl e apiKey
npm start          # http://localhost:4200
npm run build
npm test
```

`environment.ts` fica fora do Git. A `apiKey` é a mesma `API_KEY` do `BackEnd/.env`
(o enunciado exige o cabeçalho `X-API-KEY`, então ela precisa ir no bundle; o
segredo de verdade é o JWT). O backend precisa estar de pé e com `FRONTEND_URL`
igual à origem do front.

## Telas

| Rota | Quem | O que faz |
| --- | --- | --- |
| `/` | todos | Hero, carrossel 3D de leilões em destaque, lista com busca, filtro e paginação |
| `/leiloes/:id` | todos | Itens do leilão e indicadores |
| `/itens/:id` | todos | **Sala de leilão ao vivo**: 3D, contagem regressiva, lance e histórico em tempo real |
| `/login`, `/registrar` | visitante | Login (olho mágico e "Esqueci minha senha", que usa a API: código por e-mail simulado) e cadastro com aceite dos termos (gravado no servidor) |
| `/perfil` | logado | Editar dados, e-mail, endereço com busca de CEP, avatar (upload ou biblioteca) e senha; aviso do que falta no perfil; **botão para alternar entre comprador (BIDDER) e vendedor (SELLER)** |
| `/meus-lances` | comprador | Lances do usuário |
| `/vendedor`, `/vendedor/leiloes/:id` | vendedor/admin | Grade de leilões e itens, com criar, editar e remover em modais (descrição e foto opcionais) |
| `/admin` | admin | Categorias (CRUD), usuários (ativar/desativar) e leilões |

## Estrutura

```
src/app/
  core/       auth, guards, interceptor, tempo-real (Socket.io), modelos, utilitários
  services/   um serviço HTTP por recurso (leilões, itens, lances, destaques, CEP...)
  pages/      uma pasta por tela
  shared/     hero, carrossel-destaques, visualizador-3d, sidebar, footer, modal,
              paginacao, avatar, acessibilidade, recuperar-senha
public/       logo, cena de galeria do Hero, ilustrações de avatares (SVG) e acervo/
              (imagens das 70 obras de domínio público; a lista e os dados vêm de `GET /obras/acervo`; créditos em acervo/CREDITOS.md)
```

## Destaques técnicos

- **Tempo real:** `TempoRealService` entra na sala do item e a tela atualiza lance
  atual, histórico e o fim do lote sem recarregar. O evento de lance traz o `prazo` já
  calculado pelo servidor (anti-sniping): o cronômetro só passa a contar até o novo fim e
  aparece o aviso "prazo estendido". Se a conexão cair e voltar, o serviço avisa (`reconectado`) e a tela recarrega peça, lances e situação, para não ficar defasada. O botão de lance é bloqueado na
  hora em que o tempo zera.
- **3D:** `Visualizador3d` (Three.js/WebGL) mostra a foto do lote em uma moldura
  dourada, ou uma ânfora quando não há foto. Gira sozinho, aceita mouse, toque e
  teclado, pausa fora da tela e respeita "reduzir animações".
- **Acessibilidade:** barra com A+/A-, alto contraste e mais opções, link "pular para
  o conteúdo", atalhos de teclado, ARIA, foco visível e VLibras.
- **Responsivo:** menu lateral vira gaveta com botão hambúrguer no celular; testado
  de 320 a 1920 px sem rolagem horizontal.
- **Sessão:** o navegador guarda só os tokens (acesso de 15 min e renovação); ao abrir a página o usuário é carregado de `GET /users/me` (`provideAppInitializer`). Quando o acesso vence (401), o interceptor renova com `POST /auth/refresh` (uma renovação por vez) e refaz a chamada; se a sessão foi encerrada, volta ao login. "Sair" chama `POST /auth/logout`. CPF, telefone e endereço nunca ficam no `localStorage`.
- **Validação visual:** campos inválidos ficam com borda vermelha e válidos com verde.

## O que fica no front (só apresentação)

Rótulos e cores de status, máscaras de digitação, biblioteca de avatares, preferências de
acessibilidade (guardadas no navegador), links e guards por papel (o backend recusa com 401/403 de qualquer forma).
