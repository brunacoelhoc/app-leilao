import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configurarAplicacao } from './../src/configurar-aplicacao';
import { PrismaService } from './../src/prisma/prisma.service';

// Cobre o que foi acrescentado depois do nucleo: criacao/remocao de usuario pelo
// ADMIN, resumos, dados institucionais, ranking, chat e os campos calculados
// pelo servidor (atalhos de lance, rotulo do botao, capa padrao)
describe('Novos modulos (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let chave: string;

  let tokenAdmin: string;
  let tokenBidder: string;
  let tokenSeller: string;
  let sellerId: string;
  let categoriaId: string;

  const agora = Date.now();
  const SENHA = 'Abc12345!';
  const email = (quem: string) => `novos.${quem}.${agora}@teste.com`;

  // Cria o usuario direto no banco e assina o token (sem passar por registro/login):
  // esses dois endpoints tem limite de 10 por minuto e esta suite cria mais contas que isso
  async function criarEEntrar(nome: string, quem: string, papel: 'BIDDER' | 'SELLER' | 'ADMIN') {
    const usuario = await prisma.user.create({ data: { nome, email: email(quem), senha: 'x', papel } });
    const token = app.get(JwtService, { strict: false }).sign({ sub: usuario.id, papel });
    return { token, id: usuario.id };
  }

  const api = (metodo: 'get' | 'post' | 'delete' | 'patch', rota: string, token?: string) => {
    const req = request(app.getHttpServer())[metodo](`/api${rota}`).set('X-API-KEY', chave);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  // CPF valido para testes (digitos verificadores corretos), a partir de uma base numerica
  function cpfDe(base: number): string {
    const d = String(100000000 + ((base * 7919) % 899999999)).slice(0, 9).split('').map(Number);
    const dv = (n: number[]) => {
      const r = (n.reduce((acc, v, i) => acc + v * (n.length + 1 - i), 0) * 10) % 11;
      return r === 10 ? 0 : r;
    };
    d.push(dv(d));
    d.push(dv(d));
    return d.join('');
  }

  async function criarLeilao(status: 'OPEN' | 'CLOSED' | 'DRAFT', vendedorId = sellerId) {
    const leilao = await prisma.auction.create({
      data: {
        titulo: `Novos ${status} ${Math.random()}`,
        status,
        dataInicio: new Date(agora - 3600_000),
        dataFim: new Date(agora + 3600_000),
        vendedorId,
      },
    });
    return leilao.id;
  }

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarAplicacao(app);
    await app.init();
    chave = app.get(ConfigService).getOrThrow<string>('API_KEY');
    prisma = app.get(PrismaService);

    tokenAdmin = (await criarEEntrar('Admin Novos', 'admin', 'ADMIN')).token;
    tokenBidder = (await criarEEntrar('Bidder Novos', 'bidder', 'BIDDER')).token;
    const vendedor = await criarEEntrar('Seller Novos', 'seller', 'SELLER');
    tokenSeller = vendedor.token;
    sellerId = vendedor.id;
    categoriaId = (await prisma.category.create({ data: { nome: `Novos Cat ${agora}` } })).id;
  }, 40_000);

  afterAll(async () => {
    await app.close();
  });

  describe('POST/DELETE /users (so ADMIN)', () => {
    let novoId: string;

    it('ADMIN cria vendedor com o papel escolhido e a senha nunca volta', async () => {
      const res = await api('post', '/users', tokenAdmin)
        .send({ nome: 'Vendedor Criado', email: email('criado'), senha: SENHA, papel: 'SELLER' })
        .expect(201);
      novoId = res.body.id;
      expect(res.body.papel).toBe('SELLER');
      expect(res.body).not.toHaveProperty('senha');
    });

    it('a conta criada consegue entrar', async () => {
      // este login gera auditoria, entao esta conta passa a ter historico
      await api('post', '/auth/login').send({ email: email('criado'), senha: SENHA }).expect(200);
    });

    it('e-mail repetido -> 409', async () => {
      await api('post', '/users', tokenAdmin)
        .send({ nome: 'Vendedor Criado', email: email('criado'), senha: SENHA, papel: 'SELLER' })
        .expect(409);
    });

    it('papel ADMIN nao e aceito -> 400', async () => {
      await api('post', '/users', tokenAdmin)
        .send({ nome: 'Quer Ser Admin', email: email('quer'), senha: SENHA, papel: 'ADMIN' })
        .expect(400);
    });

    it('senha fora do padrao -> 400', async () => {
      await api('post', '/users', tokenAdmin)
        .send({ nome: 'Senha Fraca', email: email('fraca'), senha: '12345678', papel: 'BIDDER' })
        .expect(400);
    });

    it('comprador e vendedor nao criam usuarios -> 403; sem login -> 401', async () => {
      const corpo = { nome: 'Invasor Teste', email: email('inv'), senha: SENHA, papel: 'BIDDER' };
      await api('post', '/users', tokenBidder).send(corpo).expect(403);
      await api('post', '/users', tokenSeller).send(corpo).expect(403);
      await api('post', '/users').send(corpo).expect(401);
    });

    it('conta COM historico (ja entrou) nao pode ser removida -> 409', async () => {
      await api('delete', `/users/${novoId}`, tokenAdmin).expect(409);
    });

    it('conta SEM nenhum historico e removida -> 204 e depois 404', async () => {
      const criada = await api('post', '/users', tokenAdmin)
        .send({ nome: 'Descartavel Teste', email: email('descartavel'), senha: SENHA, papel: 'SELLER' })
        .expect(201);
      await api('delete', `/users/${criada.body.id}`, tokenAdmin).expect(204);
      await api('delete', `/users/${criada.body.id}`, tokenAdmin).expect(404);
    });

    it('ADMIN nao remove a propria conta -> 409; nao-admin -> 403', async () => {
      const eu = await api('get', '/users/me', tokenAdmin).expect(200);
      await api('delete', `/users/${eu.body.id}`, tokenAdmin).expect(409);
      await api('delete', `/users/${novoId}`, tokenBidder).expect(403);
    });

    it('busca por nome encontra o usuario (so ADMIN)', async () => {
      const res = await api('get', '/users?busca=vendedor%20criado', tokenAdmin).expect(200);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
      await api('get', '/users?busca=vendedor', tokenBidder).expect(403);
    });
  });

  describe('Resumos e dados institucionais', () => {
    it('GET /auctions/resumo conta por status (livre) e filtra por vendedor', async () => {
      await criarLeilao('OPEN');
      await criarLeilao('DRAFT');
      const res = await api('get', `/auctions/resumo?vendedorId=${sellerId}`).expect(200);
      expect(res.body).toMatchObject({ OPEN: 1, DRAFT: 1, CLOSED: 0, total: 2 });
      const geral = await api('get', '/auctions/resumo').expect(200);
      expect(geral.body.total).toBeGreaterThanOrEqual(2);
    });

    it('GET /admin/resumo: 200 para ADMIN, 403 para outros, 401 sem login', async () => {
      const res = await api('get', '/admin/resumo', tokenAdmin).expect(200);
      expect(res.body).toEqual({
        categorias: expect.any(Number),
        usuarios: expect.any(Number),
        leiloes: expect.any(Number),
      });
      await api('get', '/admin/resumo', tokenBidder).expect(403);
      await api('get', '/admin/resumo').expect(401);
    });

    it('GET /institucional e livre e traz o "atendendo agora" calculado no servidor', async () => {
      const res = await api('get', '/institucional').expect(200);
      expect(res.body.nome).toBeTruthy();
      expect(res.body.endereco.cep).toMatch(/^\d{5}-\d{3}$/);
      expect(typeof res.body.atendimento.atendendoAgora).toBe('boolean');
    });
  });

  describe('Ranking de vendedores', () => {
    it('so entra quem vendeu; ordena pelo total arrecadado; expoe so dados publicos', async () => {
      const comprador = await prisma.user.findUniqueOrThrow({ where: { email: email('bidder') } });
      const leilaoId = await criarLeilao('CLOSED');
      await prisma.auctionItem.create({
        data: {
          titulo: 'Vendido A', precoInicial: 100, incrementoMinimo: 10, lanceAtual: 300, status: 'SOLD',
          vencedorId: comprador.id, cep: '01310100', leilaoId, categoriaId,
        },
      });
      await prisma.auctionItem.create({
        data: { titulo: 'Sem venda', precoInicial: 100, incrementoMinimo: 10, status: 'UNSOLD', cep: '01310100', leilaoId, categoriaId },
      });

      const res = await api('get', '/ranking/vendedores?limite=20').expect(200);
      const linha = (res.body as { vendedorId: string }[]).find((l) => l.vendedorId === sellerId);
      expect(linha).toMatchObject({ arrecadado: '300.00', vendidas: 1, finalizadas: 2, taxaVenda: 50 });
      expect(linha).not.toHaveProperty('email');
      expect(linha).not.toHaveProperty('cpf');

      // ordenado do maior para o menor
      const valores = (res.body as { arrecadado: string }[]).map((l) => Number(l.arrecadado));
      expect([...valores].sort((a, b) => b - a)).toEqual(valores);
    });
  });

  describe('Chat do leilao', () => {
    let leilaoAberto: string;

    beforeAll(async () => {
      leilaoAberto = await criarLeilao('OPEN');
    });

    it('logado escreve com o leilao aberto (texto sem espacos nas pontas)', async () => {
      const res = await api('post', `/auctions/${leilaoAberto}/chat`, tokenBidder).send({ texto: '  Peca linda!  ' }).expect(201);
      expect(res.body).toMatchObject({ texto: 'Peca linda!', autorPapel: 'BIDDER' });
    });

    it('vazio ou acima de 300 caracteres -> 400; sem login -> 401', async () => {
      await api('post', `/auctions/${leilaoAberto}/chat`, tokenBidder).send({ texto: '   ' }).expect(400);
      await api('post', `/auctions/${leilaoAberto}/chat`, tokenBidder).send({ texto: 'x'.repeat(301) }).expect(400);
      await api('post', `/auctions/${leilaoAberto}/chat`).send({ texto: 'oi' }).expect(401);
    });

    it('leitura e livre e vem em ordem cronologica', async () => {
      await api('post', `/auctions/${leilaoAberto}/chat`, tokenSeller).send({ texto: 'Segunda mensagem' }).expect(201);
      const res = await api('get', `/auctions/${leilaoAberto}/chat`).expect(200);
      expect(res.body.map((m: { texto: string }) => m.texto)).toEqual(['Peca linda!', 'Segunda mensagem']);
    });

    it('so se conversa com o leilao ABERTO (fechado e rascunho -> 409); leilao inexistente -> 404', async () => {
      const fechado = await criarLeilao('CLOSED');
      const rascunho = await criarLeilao('DRAFT');
      await api('post', `/auctions/${fechado}/chat`, tokenBidder).send({ texto: 'tarde' }).expect(409);
      await api('post', `/auctions/${rascunho}/chat`, tokenBidder).send({ texto: 'cedo' }).expect(409);
      await api('get', `/auctions/${fechado}/chat`).expect(200); // ler continua permitido
      await api('get', '/auctions/8e9d06c4-0000-4000-8000-000000000000/chat').expect(404);
    });
  });

  describe('Campos calculados pelo servidor (a tela so exibe)', () => {
    it('peca ABERTA traz atalhos de lance, rotulo do botao e capa padrao', async () => {
      const leilaoId = await criarLeilao('OPEN');
      const item = await prisma.auctionItem.create({
        data: { titulo: 'Atalhos', precoInicial: 100, incrementoMinimo: 10, cep: '01310100', leilaoId, categoriaId },
      });
      const res = await api('get', `/auction-items/${item.id}`).expect(200);
      expect(res.body.lancesSugeridos).toEqual(['100.00', '110.00', '120.00', '150.00']);
      expect(res.body.rotuloAcao).toBe('Participar');
      expect(res.body.capaPadrao).toMatch(/^acervo\/.+\.jpg$/);
    });

    it('depois de um lance os atalhos partem do novo minimo', async () => {
      const leilaoId = await criarLeilao('OPEN');
      const item = await prisma.auctionItem.create({
        data: { titulo: 'Atalhos 2', precoInicial: 100, incrementoMinimo: 10, cep: '01310100', leilaoId, categoriaId },
      });
      await api('post', `/auction-items/${item.id}/bids`, tokenBidder).send({ valor: 100 }).expect(201);
      const res = await api('get', `/auction-items/${item.id}`).expect(200);
      expect(res.body.lanceMinimo).toBe('110');
      expect(res.body.lancesSugeridos).toEqual(['110.00', '120.00', '130.00', '160.00']);
    });

    it('peca encerrada nao traz atalhos e o botao vira "Ver resultado"', async () => {
      const leilaoId = await criarLeilao('CLOSED');
      const item = await prisma.auctionItem.create({
        data: { titulo: 'Encerrada', precoInicial: 100, incrementoMinimo: 10, status: 'UNSOLD', cep: '01310100', leilaoId, categoriaId },
      });
      const res = await api('get', `/auction-items/${item.id}`).expect(200);
      expect(res.body.lancesSugeridos).toEqual([]);
      expect(res.body.rotuloAcao).toBe('Ver resultado');
    });

    it('detalhe do leilao traz a capa padrao (e a foto, quando houver)', async () => {
      const leilaoId = await criarLeilao('OPEN');
      const res = await api('get', `/auctions/${leilaoId}`).expect(200);
      expect(res.body.capaPadrao).toMatch(/^acervo\/.+\.jpg$/);
      expect(res.body).toHaveProperty('capaDocumentoId');
    });
  });

  describe('Uma conta compra e vende (sem brechas)', () => {
    let itemDeA: string;
    let leilaoDeA: string;
    let tokenA: string;
    let idA: string;
    let tokenB: string;

    beforeAll(async () => {
      const a = await criarEEntrar('Vendedor A Mista', 'mistaa', 'SELLER');
      const b = await criarEEntrar('Vendedor B Mista', 'mistab', 'SELLER');
      tokenA = a.token;
      idA = a.id;
      tokenB = b.token;
      leilaoDeA = await criarLeilao('OPEN', idA);
      itemDeA = (
        await prisma.auctionItem.create({
          data: { titulo: 'Peca do A', precoInicial: 100, incrementoMinimo: 10, cep: '01310100', leilaoId: leilaoDeA, categoriaId },
        })
      ).id;
    });

    it('VENDEDOR compra: da lance em leilao de OUTRO vendedor -> 201', async () => {
      await api('post', `/auction-items/${itemDeA}/bids`, tokenB).send({ valor: 100 }).expect(201);
    });

    it('VENDEDOR nunca da lance no PROPRIO leilao -> 403', async () => {
      const res = await api('post', `/auction-items/${itemDeA}/bids`, tokenA).send({ valor: 500 }).expect(403);
      expect(res.body.mensagem).toContain('proprio item');
    });

    it('vendedor ve os proprios lances em "meus lances"', async () => {
      const res = await api('get', '/bids/meus', tokenB).expect(200);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
    });

    it('ADMIN continua fora do jogo: nao da lance e nao cria leilao -> 403', async () => {
      await api('post', `/auction-items/${itemDeA}/bids`, tokenAdmin).send({ valor: 900 }).expect(403);
      await api('post', '/auctions', tokenAdmin)
        .send({ titulo: 'Admin nao cria', dataInicio: new Date(agora).toISOString(), dataFim: new Date(agora + 86400000).toISOString() })
        .expect(403);
    });

    it('COMPRADOR com perfil incompleto NAO vira vendedor -> 400 dizendo o que falta', async () => {
      const novo = await criarEEntrar('Comprador Quer Vender', 'querv', 'BIDDER');
      const res = await api('post', '/users/me/vendedor', novo.token).expect(400);
      expect(res.body.mensagem).toMatch(/telefone.*CPF.*endereco/);
      // e continua sem poder criar leilao
      await api('post', '/auctions', novo.token)
        .send({ titulo: 'Ainda nao', dataInicio: new Date(agora).toISOString(), dataFim: new Date(agora + 86400000).toISOString() })
        .expect(403);
    });

    it('CPF invalido no perfil -> 400', async () => {
      const novo = await criarEEntrar('Cpf Invalido', 'cpfinv', 'BIDDER');
      await api('patch', '/users/me', novo.token)
        .send({ telefone: '11999998888', endereco: 'Rua Teste, 10', cpf: '12345678900' })
        .expect(200);
      const res = await api('post', '/users/me/vendedor', novo.token).expect(400);
      expect(res.body.mensagem).toContain('invalido');
    });

    it('COMPRADOR com perfil completo vira vendedor NA HORA, cria leilao e continua podendo comprar', async () => {
      const novo = await criarEEntrar('Comprador Vira Vendedor', 'viravend', 'BIDDER');
      await api('patch', '/users/me', novo.token)
        .send({ telefone: '11999998888', endereco: 'Rua Teste, 10', cpf: cpfDe(agora % 100000) })
        .expect(200);

      const res = await api('post', '/users/me/vendedor', novo.token).expect(200);
      expect(res.body.papel).toBe('SELLER');

      // mesmo token, sem novo login: agora cria leilao...
      const leilao = await api('post', '/auctions', novo.token)
        .send({ titulo: 'Primeiro leilao', dataInicio: new Date(agora).toISOString(), dataFim: new Date(agora + 86400000).toISOString() })
        .expect(201);
      expect(leilao.body.status).toBe('DRAFT');
      // ... e ainda da lance em leilao de outro
      await api('post', `/auction-items/${itemDeA}/bids`, novo.token).send({ valor: 110 }).expect(201);
      // ... mas nunca no proprio leilao (a regra vale por dono)
      const meuLeilao = await criarLeilao('OPEN', res.body.id);
      const meuItem = await prisma.auctionItem.create({
        data: { titulo: 'Meu item', precoInicial: 50, incrementoMinimo: 5, cep: '01310100', leilaoId: meuLeilao, categoriaId },
      });
      await api('post', `/auction-items/${meuItem.id}/bids`, novo.token).send({ valor: 50 }).expect(403);

      // ja e vendedor: pedir de novo -> 409
      await api('post', '/users/me/vendedor', novo.token).expect(409);
    });

    it('o MESMO CPF nao pode estar em duas contas de vendedor -> 409', async () => {
      const cpf = cpfDe((agora % 100000) + 7);
      const primeiro = await criarEEntrar('Dono do CPF', 'cpf1', 'BIDDER');
      await api('patch', '/users/me', primeiro.token).send({ telefone: '11999990000', endereco: 'Rua Um, 1', cpf }).expect(200);
      await api('post', '/users/me/vendedor', primeiro.token).expect(200);

      const segundo = await criarEEntrar('Outra Conta Mesmo CPF', 'cpf2', 'BIDDER');
      await api('patch', '/users/me', segundo.token).send({ telefone: '11999991111', endereco: 'Rua Dois, 2', cpf }).expect(200);
      const res = await api('post', '/users/me/vendedor', segundo.token).expect(409);
      expect(res.body.mensagem).toContain('CPF');
    });

    it('ADMIN nao vira vendedor -> 403; sem login -> 401', async () => {
      await api('post', '/users/me/vendedor', tokenAdmin).expect(403);
      await api('post', '/users/me/vendedor').expect(401);
    });
  });

  describe('Meus lances por peca e historia da obra', () => {
    let leilaoId: string;
    let itemId: string;
    let tokenOutro: string;

    beforeAll(async () => {
      leilaoId = await criarLeilao('OPEN');
      itemId = (
        await prisma.auctionItem.create({
          data: { titulo: 'Peca disputada', precoInicial: 100, incrementoMinimo: 10, cep: '01310100', leilaoId, categoriaId },
        })
      ).id;
      tokenOutro = (await criarEEntrar('Outro Comprador', 'outrocomp', 'BIDDER')).token;
    });

    it('quem tem o maior lance aparece LIDERANDO; quando alguem cobre, SUPERADO', async () => {
      await api('post', `/auction-items/${itemId}/bids`, tokenBidder).send({ valor: 100 }).expect(201);
      let res = await api('get', '/bids/minhas-pecas', tokenBidder).expect(200);
      let peca = (res.body.pecas as { item: { id: string }; situacaoDoLance: string }[]).find((p) => p.item.id === itemId);
      expect(peca?.situacaoDoLance).toBe('LIDERANDO');

      await api('post', `/auction-items/${itemId}/bids`, tokenOutro).send({ valor: 110 }).expect(201);
      res = await api('get', '/bids/minhas-pecas', tokenBidder).expect(200);
      peca = (res.body.pecas as { item: { id: string }; situacaoDoLance: string }[]).find((p) => p.item.id === itemId);
      expect(peca?.situacaoDoLance).toBe('SUPERADO');
      expect(peca).toMatchObject({ meuMaiorLance: '100.00', totalMeusLances: 1, adquiridoEm: null, valorAquisicao: null });
    });

    it('peca arrematada aparece VENCEDOR com valor e data da aquisicao; a perdida, PERDIDO', async () => {
      const comprador = await prisma.user.findUniqueOrThrow({ where: { email: email('bidder') } });
      const outro = await prisma.user.findUniqueOrThrow({ where: { email: email('outrocomp') } });
      const fechado = await criarLeilao('CLOSED');
      const ganhei = await prisma.auctionItem.create({
        data: { titulo: 'Ganhei', precoInicial: 100, incrementoMinimo: 10, lanceAtual: 250, status: 'SOLD', vencedorId: comprador.id, cep: '01310100', leilaoId: fechado, categoriaId },
      });
      const perdi = await prisma.auctionItem.create({
        data: { titulo: 'Perdi', precoInicial: 100, incrementoMinimo: 10, lanceAtual: 300, status: 'SOLD', vencedorId: outro.id, cep: '01310100', leilaoId: fechado, categoriaId },
      });
      await prisma.bid.create({ data: { valor: 250, itemId: ganhei.id, licitanteId: comprador.id } });
      await prisma.bid.create({ data: { valor: 200, itemId: perdi.id, licitanteId: comprador.id } });

      const res = await api('get', '/bids/minhas-pecas', tokenBidder).expect(200);
      const lista = res.body.pecas as { item: { id: string }; situacaoDoLance: string; valorAquisicao: string | null; adquiridoEm: string | null }[];
      const g = lista.find((p) => p.item.id === ganhei.id);
      expect(g).toMatchObject({ situacaoDoLance: 'VENCEDOR', valorAquisicao: '250' });
      expect(g?.adquiridoEm).toBeTruthy();
      expect(lista.find((p) => p.item.id === perdi.id)).toMatchObject({ situacaoDoLance: 'PERDIDO', valorAquisicao: null, adquiridoEm: null });
    });

    it('ADMIN nao tem "meus lances" (403); sem login 401', async () => {
      await api('get', '/bids/minhas-pecas', tokenAdmin).expect(403);
      await api('get', '/bids/minhas-pecas').expect(401);
    });

    it('historia: foto de obra do acervo + titulo da obra -> traz a historia e o contexto da epoca', async () => {
      const item = await prisma.auctionItem.create({
        data: { titulo: 'Mona Lisa', precoInicial: 100, incrementoMinimo: 10, cep: '01310100', leilaoId, categoriaId },
      });
      await prisma.document.create({
        data: { tipo: 'PHOTO', nomeOriginal: 'mona-lisa.jpg', nomeArquivo: `${Math.random()}.jpg`, mimeType: 'image/jpeg', tamanho: 10, hash: `h${Math.random()}`, itemId: item.id, enviadoPorId: sellerId },
      });
      const res = await api('get', `/auction-items/${item.id}/historia`).expect(200);
      expect(res.body.origem).toBe('OBRA_DO_ACERVO');
      expect(res.body.obra).toMatchObject({ artista: 'Leonardo da Vinci', autenticidade: 'REPRODUCAO' });
      expect(res.body.obra.contextoHistorico).toBeTruthy();
      expect(res.body.obra.autenticidadeTexto).toContain('Louvre');
    });

    it('historia: peca com ficha propria e nome diferente da foto NAO recebe a historia de outra obra', async () => {
      const item = await prisma.auctionItem.create({
        data: { titulo: 'Anel de Rubi', autor: 'Ourives inglês', precoInicial: 100, incrementoMinimo: 10, cep: '01310100', leilaoId, categoriaId },
      });
      await prisma.document.create({
        data: { tipo: 'PHOTO', nomeOriginal: 'mona-lisa.jpg', nomeArquivo: `${Math.random()}.jpg`, mimeType: 'image/jpeg', tamanho: 10, hash: `h${Math.random()}`, itemId: item.id, enviadoPorId: sellerId },
      });
      const res = await api('get', `/auction-items/${item.id}/historia`).expect(200);
      expect(res.body.origem).toBe('FICHA_DA_PECA');
      expect(res.body.obra).toBeNull();
      expect(res.body.autor).toBe('Ourives inglês');
    });

    it('historia: peca inexistente -> 404; uuid invalido -> 400', async () => {
      await api('get', '/auction-items/8e9d06c4-0000-4000-8000-000000000000/historia').expect(404);
      await api('get', '/auction-items/abc/historia').expect(400);
    });
  });

  describe('Responsabilidades do servidor (a tela so exibe)', () => {
    let leilaoDoVendedor: string;
    let itemId: string;

    beforeAll(async () => {
      leilaoDoVendedor = await criarLeilao('OPEN');
      itemId = (
        await prisma.auctionItem.create({
          data: { titulo: 'Peca responsabilidades', precoInicial: 100, incrementoMinimo: 10, cep: '01310100', leilaoId: leilaoDoVendedor, categoriaId },
        })
      ).id;
    });

    it('minha-situacao: comprador PODE; dono NAO (DONO); ADMIN NAO (ADMIN); sem login 401', async () => {
      const comprador = await api('get', `/auction-items/${itemId}/bids/minha-situacao`, tokenBidder).expect(200);
      expect(comprador.body).toMatchObject({ permitido: true, motivo: null, euSouDono: false });

      const dono = await api('get', `/auction-items/${itemId}/bids/minha-situacao`, tokenSeller).expect(200);
      expect(dono.body).toMatchObject({ permitido: false, motivo: 'DONO', euSouDono: true });
      expect(dono.body.mensagem).toContain('dono');

      const admin = await api('get', `/auction-items/${itemId}/bids/minha-situacao`, tokenAdmin).expect(200);
      expect(admin.body).toMatchObject({ permitido: false, motivo: 'ADMIN' });

      await api('get', `/auction-items/${itemId}/bids/minha-situacao`).expect(401);
    });

    it('minha-situacao e a MESMA regra do lance: quem nao "pode" leva 403 ao tentar', async () => {
      await api('post', `/auction-items/${itemId}/bids`, tokenSeller).send({ valor: 100 }).expect(403);
      await api('post', `/auction-items/${itemId}/bids`, tokenAdmin).send({ valor: 100 }).expect(403);
    });

    it('minha-situacao: leilao fechado -> LEILAO_FECHADO; peca inexistente -> 404', async () => {
      const fechado = await criarLeilao('CLOSED');
      const item = await prisma.auctionItem.create({
        data: { titulo: 'Fechada', precoInicial: 100, incrementoMinimo: 10, cep: '01310100', leilaoId: fechado, categoriaId },
      });
      const res = await api('get', `/auction-items/${item.id}/bids/minha-situacao`, tokenBidder).expect(200);
      expect(res.body).toMatchObject({ permitido: false, motivo: 'LEILAO_FECHADO' });
      await api('get', '/auction-items/8e9d06c4-0000-4000-8000-000000000000/bids/minha-situacao', tokenBidder).expect(404);
    });

    it('meus lances: o servidor devolve o resumo (total investido em Decimal) e a aba de cada peca', async () => {
      const comprador = await prisma.user.findUniqueOrThrow({ where: { email: email('bidder') } });
      const fechado = await criarLeilao('CLOSED');
      for (const [titulo, valor] of [['Aba A', 300], ['Aba B', 450.5]] as const) {
        const it = await prisma.auctionItem.create({
          data: { titulo, precoInicial: 100, incrementoMinimo: 10, lanceAtual: valor, status: 'SOLD', vencedorId: comprador.id, cep: '01310100', leilaoId: fechado, categoriaId },
        });
        await prisma.bid.create({ data: { valor, itemId: it.id, licitanteId: comprador.id } });
      }
      const res = await api('get', '/bids/minhas-pecas', tokenBidder).expect(200);
      expect(res.body.resumo.adquiridas).toBeGreaterThanOrEqual(2);
      // total investido = soma do que foi pago nas pecas arrematadas, com duas casas
      const soma = (res.body.pecas as { grupo: string; valorAquisicao: string }[])
        .filter((p) => p.grupo === 'ADQUIRIDAS')
        .reduce((acc, p) => acc + Number(p.valorAquisicao), 0);
      expect(res.body.resumo.totalInvestido).toBe(soma.toFixed(2));
      expect(res.body.resumo.disputadas).toBe(res.body.pecas.length);
      expect((res.body.pecas as { grupo: string }[]).every((p) => ['ADQUIRIDAS', 'EM_DISPUTA', 'ENCERRADAS'].includes(p.grupo))).toBe(true);
    });

    it('requisitos de vendedor: o servidor diz o que falta; vendedor e admin nao "podem solicitar"', async () => {
      const novo = await criarEEntrar('Quer Requisitos', 'requis', 'BIDDER');
      let res = await api('get', '/users/me/vendedor', novo.token).expect(200);
      expect(res.body.podeSolicitar).toBe(false);
      expect(res.body.requisitos.map((r: { campo: string; ok: boolean }) => [r.campo, r.ok])).toEqual([
        ['telefone', false],
        ['cpf', false],
        ['endereco', false],
      ]);

      await api('patch', '/users/me', novo.token)
        .send({ telefone: '11999997777', endereco: 'Rua X, 1', cpf: cpfDe((agora % 100000) + 33) })
        .expect(200);
      res = await api('get', '/users/me/vendedor', novo.token).expect(200);
      expect(res.body.podeSolicitar).toBe(true);
      expect(res.body.requisitos.every((r: { ok: boolean }) => r.ok)).toBe(true);

      const vend = await api('get', '/users/me/vendedor', tokenSeller).expect(200);
      expect(vend.body).toMatchObject({ jaEVendedor: true, podeSolicitar: false });
      await api('get', '/users/me/vendedor', tokenAdmin).expect(200).expect((r) => expect(r.body.podeSolicitar).toBe(false));
      await api('get', '/users/me/vendedor').expect(401);
    });

    it('indicadores do leilao trazem os percentuais prontos', async () => {
      const id = await criarLeilao('CLOSED');
      await prisma.auctionItem.create({ data: { titulo: 'P1', precoInicial: 10, incrementoMinimo: 1, lanceAtual: 20, status: 'SOLD', vencedorId: sellerId, cep: '01310100', leilaoId: id, categoriaId } });
      await prisma.auctionItem.create({ data: { titulo: 'P2', precoInicial: 10, incrementoMinimo: 1, status: 'UNSOLD', cep: '01310100', leilaoId: id, categoriaId } });
      await prisma.auctionItem.create({ data: { titulo: 'P3', precoInicial: 10, incrementoMinimo: 1, status: 'UNSOLD', cep: '01310100', leilaoId: id, categoriaId } });
      const res = await api('get', `/auctions/${id}/indicadores`).expect(200);
      expect(res.body.percentuais).toEqual({ vendidos: 33.3, disponiveis: 0, naoVendidos: 66.7 });
    });

    it('ranking: cada linha traz a participacao em relacao ao lider (lider = 100)', async () => {
      const res = await api('get', '/ranking/vendedores?limite=20').expect(200);
      const lista = res.body as { participacao: number }[];
      expect(lista[0].participacao).toBe(100);
      expect(lista.every((l) => l.participacao >= 0 && l.participacao <= 100)).toBe(true);
    });

    describe('foto publica (a tela so aponta a URL)', () => {
      let fotoId: string;
      let documentoId: string;

      beforeAll(async () => {
        const { writeFile, mkdir } = await import('fs/promises');
        const { join } = await import('path');
        await mkdir(join(process.cwd(), 'uploads'), { recursive: true });
        const nomes = [`foto-teste-${agora}.jpg`, `doc-teste-${agora}.pdf`];
        await writeFile(join(process.cwd(), 'uploads', nomes[0]), Buffer.from('imagem-falsa'));
        await writeFile(join(process.cwd(), 'uploads', nomes[1]), Buffer.from('pdf-falso'));
        fotoId = (
          await prisma.document.create({
            data: { tipo: 'PHOTO', nomeOriginal: 'x.jpg', nomeArquivo: nomes[0], mimeType: 'image/jpeg', tamanho: 12, hash: `f${agora}`, itemId, enviadoPorId: sellerId },
          })
        ).id;
        documentoId = (
          await prisma.document.create({
            data: { tipo: 'DOCUMENT', nomeOriginal: 'laudo.pdf', nomeArquivo: nomes[1], mimeType: 'application/pdf', tamanho: 9, hash: `d${agora}`, itemId, enviadoPorId: sellerId },
          })
        ).id;
      });

      it('GET /documents/:id/foto abre SEM chave da API e permite exibir em outra origem', async () => {
        const res = await request(app.getHttpServer()).get(`/api/documents/${fotoId}/foto`).expect(200);
        expect(res.headers['content-type']).toContain('image/jpeg');
        expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
        expect(res.headers['cache-control']).toContain('max-age');
      });

      it('certificados e laudos (DOCUMENT) NAO saem por essa rota (404) e o download continua exigindo a chave', async () => {
        await request(app.getHttpServer()).get(`/api/documents/${documentoId}/foto`).expect(404);
        await request(app.getHttpServer()).get(`/api/documents/${documentoId}/download`).expect(401);
        await api('get', `/documents/${documentoId}/download`).expect(200);
      });

      it('as demais rotas continuam exigindo a chave', async () => {
        await request(app.getHttpServer()).get('/api/auctions').expect(401);
      });
    });
  });
});
