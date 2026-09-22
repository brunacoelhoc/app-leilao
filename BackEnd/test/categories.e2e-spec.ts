import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configurarAplicacao } from './../src/configurar-aplicacao';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Categories (e2e)', () => {
  let app: INestApplication<App>;
  let chave: string;
  let prisma: PrismaService;
  let tokenBidder: string;
  let tokenAdmin: string;

  const EMAIL_BIDDER = 'categories.bidder@teste.com';
  const EMAIL_ADMIN = 'categories.admin@teste.com';
  const SENHA_TESTE = 'Abc12345!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configurarAplicacao(app);
    await app.init();

    chave = app.get(ConfigService).getOrThrow<string>('API_KEY');
    prisma = app.get(PrismaService);

    // Um BIDDER comum e um usuario promovido a ADMIN direto no banco
    await request(app.getHttpServer())
      .post('/api/auth/registrar')
      .set('X-API-KEY', chave)
      .send({ nome: 'Bidder Categories', email: EMAIL_BIDDER, senha: SENHA_TESTE });
    const loginBidder = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-API-KEY', chave)
      .send({ email: EMAIL_BIDDER, senha: SENHA_TESTE });
    tokenBidder = (loginBidder.body as { accessToken: string }).accessToken;

    await request(app.getHttpServer())
      .post('/api/auth/registrar')
      .set('X-API-KEY', chave)
      .send({ nome: 'Admin Categories', email: EMAIL_ADMIN, senha: SENHA_TESTE });
    await prisma.user.update({
      where: { email: EMAIL_ADMIN },
      data: { papel: 'ADMIN' },
    });
    const loginAdmin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-API-KEY', chave)
      .send({ email: EMAIL_ADMIN, senha: SENHA_TESTE });
    tokenAdmin = (loginAdmin.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await prisma.category.deleteMany({
      where: { nome: { startsWith: 'Categories E2E' } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [EMAIL_BIDDER, EMAIL_ADMIN] } },
    });
    await app.close();
  });

  const rota = (
    metodo: 'get' | 'post' | 'patch' | 'delete',
    caminho: string,
    token?: string,
  ) => {
    const req = request(app.getHttpServer())
      [metodo](`/api/categories${caminho}`)
      .set('X-API-KEY', chave);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  describe('autorizacao: so ADMIN escreve', () => {
    it('BIDDER tentando criar -> 403', async () => {
      const resposta = await rota('post', '', tokenBidder).send({
        nome: 'Categories E2E Bloqueada',
      });
      expect(resposta.status).toBe(403);
    });

    it('sem token tentando criar -> 401', async () => {
      const resposta = await rota('post', '').send({
        nome: 'Categories E2E Bloqueada',
      });
      expect(resposta.status).toBe(401);
    });
  });

  describe('fluxo principal: ADMIN cria, atualiza e remove', () => {
    it('ADMIN cria uma categoria (201)', async () => {
      const resposta = await rota('post', '', tokenAdmin)
        .send({ nome: 'Categories E2E Pintura', descricao: 'Quadros e telas' })
        .expect(201);

      expect(resposta.body.nome).toBe('Categories E2E Pintura');
    });

    it('qualquer um LISTA, mesmo sem token (200)', async () => {
      const resposta = await rota('get', '').expect(200);

      expect(Array.isArray(resposta.body)).toBe(true);
    });

    it('BIDDER consegue LER o detalhe (200)', async () => {
      const lista = await rota('get', '', tokenAdmin);
      const id = (lista.body as { id: string }[])[0].id;

      await rota('get', `/${id}`, tokenBidder).expect(200);
    });

    it('ADMIN atualiza (200)', async () => {
      const lista = await rota('get', '', tokenAdmin);
      const id = (lista.body as { id: string; nome: string }[]).find(
        (c) => c.nome === 'Categories E2E Pintura',
      )!.id;

      const resposta = await rota('patch', `/${id}`, tokenAdmin)
        .send({ descricao: 'Nova descricao' })
        .expect(200);

      expect(resposta.body.descricao).toBe('Nova descricao');
    });

    it('ADMIN remove (204, sem corpo)', async () => {
      const criada = await rota('post', '', tokenAdmin).send({
        nome: 'Categories E2E Sera Removida',
      });

      const resposta = await rota(
        'delete',
        `/${criada.body.id}`,
        tokenAdmin,
      ).expect(204);

      expect(resposta.body).toEqual({});
    });
  });

  describe('recurso inexistente -> 404', () => {
    it('id valido (uuid) mas inexistente -> 404', () => {
      return rota('get', '/00000000-0000-0000-0000-000000000000').expect(404);
    });
  });

  describe('id malformado -> 400', () => {
    it('id que nao e um uuid -> 400, mensagem em portugues', async () => {
      const resposta = await rota('get', '/id-nao-e-uuid').expect(400);

      expect(resposta.body.mensagem).toBe('id deve ser um uuid valido');
    });
  });

  describe('conflito de negocio -> 409', () => {
    it('remover categoria em uso por um item -> 409', async () => {
      const categoria = await rota('post', '', tokenAdmin).send({
        nome: 'Categories E2E Em Uso',
      });

      const vendedor = await prisma.user.create({
        data: {
          nome: 'Vendedor Categories',
          email: 'vendedor.categories.e2e@teste.com',
          senha: 'hash-falso',
          papel: 'SELLER',
        },
      });
      const leilao = await prisma.auction.create({
        data: {
          titulo: 'Leilao Categories E2E',
          dataInicio: new Date(),
          dataFim: new Date(Date.now() + 86400000),
          vendedorId: vendedor.id,
        },
      });
      await prisma.auctionItem.create({
        data: {
          titulo: 'Item Categories E2E',
          precoInicial: 100,
          incrementoMinimo: 10,
          cep: '01310100',
          leilaoId: leilao.id,
          categoriaId: categoria.body.id as string,
        },
      });

      await rota('delete', `/${categoria.body.id}`, tokenAdmin).expect(409);

      // limpeza (nesta ordem, por causa das FKs)
      await prisma.auctionItem.deleteMany({ where: { leilaoId: leilao.id } });
      await prisma.auction.delete({ where: { id: leilao.id } });
      await prisma.user.delete({ where: { id: vendedor.id } });
      await prisma.category.delete({ where: { id: categoria.body.id as string } });
    });
  });
});
