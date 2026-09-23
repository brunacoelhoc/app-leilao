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
  }, 30_000);

  afterAll(async () => {
    await prisma.category.deleteMany({
      where: { nome: { startsWith: 'Categories E2E' } },
    });
    // Todo login grava uma linha em AuditLog (auditoria), que nunca pode ser
    // apagada -- por isso um usuario que ja logou pode ficar "preso" para
    // sempre (onDelete: Restrict). Tentativa best-effort, sem quebrar o teste
    await prisma.user
      .deleteMany({ where: { email: { in: [EMAIL_BIDDER, EMAIL_ADMIN] } } })
      .catch(() => undefined);
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
    let idCategoriaPintura: string;

    it('ADMIN cria uma categoria (201)', async () => {
      const resposta = await rota('post', '', tokenAdmin)
        .send({ nome: 'Categories E2E Pintura', descricao: 'Quadros e telas' })
        .expect(201);

      expect(resposta.body.nome).toBe('Categories E2E Pintura');
      idCategoriaPintura = resposta.body.id as string;
    });

    it('qualquer um LISTA, mesmo sem token (200), formato paginado', async () => {
      const resposta = await rota('get', '').expect(200);

      const corpo = resposta.body as {
        dados: unknown[];
        total: number;
        pagina: number;
        limite: number;
        totalPaginas: number;
      };
      expect(Array.isArray(corpo.dados)).toBe(true);
      expect(corpo.pagina).toBe(1);
      expect(corpo.limite).toBe(20); // padrao, ninguem pediu ?limite=
      expect(corpo.dados.length).toBeLessThanOrEqual(20);
      expect(corpo.total).toBeGreaterThanOrEqual(corpo.dados.length);
      expect(corpo.totalPaginas).toBe(Math.ceil(corpo.total / corpo.limite));
    });

    it('BIDDER consegue LER o detalhe da categoria recem-criada (200)', async () => {
      await rota('get', `/${idCategoriaPintura}`, tokenBidder).expect(200);
    });

    it('ADMIN atualiza a categoria recem-criada (200)', async () => {
      const resposta = await rota('patch', `/${idCategoriaPintura}`, tokenAdmin)
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

  describe('paginacao', () => {
    it('?limite=2 devolve no maximo 2 itens', async () => {
      const resposta = await rota('get', '?limite=2').expect(200);

      expect(resposta.body.dados.length).toBeLessThanOrEqual(2);
      expect(resposta.body.limite).toBe(2);
    });

    it('paginas diferentes devolvem itens diferentes', async () => {
      const pagina1 = await rota('get', '?limite=2&pagina=1').expect(200);
      const pagina2 = await rota('get', '?limite=2&pagina=2').expect(200);

      const idsPagina1 = (pagina1.body.dados as { id: string }[]).map((c) => c.id);
      const idsPagina2 = (pagina2.body.dados as { id: string }[]).map((c) => c.id);
      expect(idsPagina1).not.toEqual(idsPagina2);
    });

    it('?pagina=0 -> 400 (pagina comeca em 1)', async () => {
      const resposta = await rota('get', '?pagina=0');
      expect(resposta.status).toBe(400);
    });

    it('?limite=101 -> 400 (maximo e 100)', async () => {
      const resposta = await rota('get', '?limite=101');
      expect(resposta.status).toBe(400);
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
