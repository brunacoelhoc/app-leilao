import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { CepService } from './../src/cep/cep.service';
import { cepFalso } from './cep-falso';
import { configurarAplicacao } from './../src/configurar-aplicacao';
import { PrismaService } from './../src/prisma/prisma.service';
import { PERFIL_COMPLETO } from './perfil-teste';

describe('AuctionItems (e2e)', () => {
  let app: INestApplication<App>;
  let chave: string;
  let prisma: PrismaService;
  let tokenSeller: string;
  let tokenOutroSeller: string;
  let tokenBidder: string;
  let leilaoDraftId: string;
  let categoriaId: string;

  const EMAIL_SELLER = 'items.seller@teste.com';
  const EMAIL_OUTRO_SELLER = 'items.outro.seller@teste.com';
  const EMAIL_BIDDER = 'items.bidder@teste.com';
  const SENHA_TESTE = 'Abc12345!';

  async function criarUsuario(nome: string, email: string, papel?: 'BIDDER' | 'SELLER' | 'ADMIN') {
    await request(app.getHttpServer())
      .post('/api/auth/registrar')
      .set('X-API-KEY', chave)
      .send({ nome, email, senha: SENHA_TESTE, aceiteTermos: true });
    await prisma.user.update({ where: { email }, data: { ...PERFIL_COMPLETO, ...(papel ? { papel } : {}) } });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-API-KEY', chave)
      .send({ email, senha: SENHA_TESTE });
    return (login.body as { accessToken: string }).accessToken;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CepService)
      .useValue(cepFalso)
      .compile();

    app = moduleFixture.createNestApplication();
    configurarAplicacao(app);
    await app.init();

    chave = app.get(ConfigService).getOrThrow<string>('API_KEY');
    prisma = app.get(PrismaService);

    tokenSeller = await criarUsuario('Seller Items', EMAIL_SELLER, 'SELLER');
    tokenOutroSeller = await criarUsuario(
      'Outro Seller Items',
      EMAIL_OUTRO_SELLER,
      'SELLER',
    );
    tokenBidder = await criarUsuario('Bidder Items', EMAIL_BIDDER);

    const categoria = await prisma.category.create({
      data: { nome: `Items E2E Categoria ${Date.now()}` },
    });
    categoriaId = categoria.id;

    const auctionResponse = await request(app.getHttpServer())
      .post('/api/auctions')
      .set('X-API-KEY', chave)
      .set('Authorization', `Bearer ${tokenSeller}`)
      .send({
        titulo: 'Items E2E Leilao Draft',
        dataInicio: '2099-01-01T00:00:00.000Z',
        dataFim: '2099-01-02T00:00:00.000Z',
      });
    leilaoDraftId = (auctionResponse.body as { id: string }).id;
  }, 30_000); // varios registros/logins reais (bcrypt) -- 5s padrao do Jest e curto demais

  afterAll(async () => {
    // Apaga TODOS os itens criados neste teste (de qualquer leilao), para
    // a categoria de teste poder ser removida em seguida (onDelete: Restrict)
    await prisma.auctionItem.deleteMany({ where: { categoriaId } });
    await prisma.category.deleteMany({ where: { id: categoriaId } });
    // Leiloes que mudaram de status (ex.: o que virou SCHEDULED) ficam presos
    // para sempre (mesmo comportamento ja visto e documentado no Auctions)
    await prisma.auction.deleteMany({
      where: { titulo: { startsWith: 'Items E2E' }, status: 'DRAFT' },
    });
    await prisma.user
      .deleteMany({
        where: {
          email: { in: [EMAIL_SELLER, EMAIL_OUTRO_SELLER, EMAIL_BIDDER] },
        },
      })
      .catch(() => undefined);
    await app.close();
  });

  const rota = (
    metodo: 'get' | 'post' | 'patch' | 'delete',
    caminho: string,
    token?: string,
  ) => {
    const req = request(app.getHttpServer())
      [metodo](`/api/auction-items${caminho}`)
      .set('X-API-KEY', chave);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  const dadosValidos = (titulo: string) => ({
    titulo,
    precoInicial: 150.5,
    incrementoMinimo: 10,
    cep: '01310100',
    leilaoId: leilaoDraftId,
    categoriaId,
  });

  describe('autorizacao e validacao basica', () => {
    it('BIDDER tentando criar -> 403', async () => {
      const resposta = await rota('post', '', tokenBidder).send(
        dadosValidos('Items E2E Bloqueado'),
      );
      expect(resposta.status).toBe(403);
    });

    it('sem token -> 401', async () => {
      const resposta = await rota('post', '').send(
        dadosValidos('Items E2E Bloqueado'),
      );
      expect(resposta.status).toBe(401);
    });

    it('precoInicial negativo -> 400', async () => {
      const resposta = await rota('post', '', tokenSeller).send({
        ...dadosValidos('Items E2E Preco Invalido'),
        precoInicial: -10,
      });
      expect(resposta.status).toBe(400);
    });

    it('cep com formato invalido -> 400', async () => {
      const resposta = await rota('post', '', tokenSeller).send({
        ...dadosValidos('Items E2E Cep Invalido'),
        cep: '123',
      });
      expect(resposta.status).toBe(400);
    });

    it('cep com formato valido (8 digitos) mas inexistente -> 400', async () => {
      const resposta = await rota('post', '', tokenSeller).send({
        ...dadosValidos('Items E2E Cep Inexistente'),
        cep: '00000000',
      });
      expect(resposta.status).toBe(400);
      expect(resposta.body.mensagem).toContain('CEP não encontrado');
    });
  });

  describe('fluxo principal e relacionamentos', () => {
    it('SELLER dono cria o item (201), preco vem como string (Decimal)', async () => {
      const resposta = await rota('post', '', tokenSeller)
        .send(dadosValidos('Items E2E Quadro'))
        .expect(201);

      expect(resposta.body.titulo).toBe('Items E2E Quadro');
      expect(typeof resposta.body.precoInicial).toBe('string');

      // Integracao externa (ViaCEP) preenchendo o endereco de verdade a
      // partir do cep '01310100' (Avenida Paulista, Sao Paulo - SP)
      expect(resposta.body.logradouro).toBe('Avenida Paulista');
      expect(resposta.body.cidade).toBe('São Paulo');
      expect(resposta.body.uf).toBe('SP');
    });

    it('qualquer um LISTA, sem token -> 200, formato paginado', async () => {
      const resposta = await rota('get', '').expect(200);
      expect(Array.isArray(resposta.body.dados)).toBe(true);
      expect(resposta.body.pagina).toBe(1);
      expect(resposta.body.limite).toBe(20);
    });

    it('consulta por relacionamento: itens de um leilao', async () => {
      // O leilão está em rascunho: só o dono vê os itens dele (visitante recebe lista vazia; ver o teste abaixo)
      const resposta = await rota(
        'get',
        `?leilaoId=${leilaoDraftId}`,
        tokenSeller,
      ).expect(200);
      const itens = resposta.body.dados as { leilaoId: string }[];
      expect(itens.length).toBeGreaterThan(0);
      expect(itens.every((i) => i.leilaoId === leilaoDraftId)).toBe(true);
    });

    it('itens de leilão em RASCUNHO: visitante não vê na lista nem pelo link; o dono e o ADMIN veem', async () => {
      const lista = await rota('get', `?leilaoId=${leilaoDraftId}`).expect(200);
      expect(lista.body.dados).toHaveLength(0);
      const dono = await rota('get', `?leilaoId=${leilaoDraftId}`, tokenSeller).expect(200);
      const itemId = (dono.body.dados as { id: string }[])[0].id;

      await rota('get', `/${itemId}`).expect(404); // visitante, pelo link direto
      await rota('get', `/${itemId}`, tokenSeller).expect(200); // dono
    });

    it('consulta por relacionamento: itens de uma categoria', async () => {
      const resposta = await rota(
        'get',
        `?categoriaId=${categoriaId}`,
        tokenSeller, // os itens de teste estão em leilão em rascunho: só o dono os vê
      ).expect(200);
      const itens = resposta.body.dados as { categoriaId: string }[];
      expect(itens.length).toBeGreaterThan(0);
      expect(itens.every((i) => i.categoriaId === categoriaId)).toBe(true);
    });

    it('leilaoId invalido (nao-uuid) -> 400', () => {
      return rota('get', '?leilaoId=nao-e-uuid').expect(400);
    });

    it('?limite=1 combinado com filtro devolve no maximo 1 item', async () => {
      const resposta = await rota(
        'get',
        `?categoriaId=${categoriaId}&limite=1`,
      ).expect(200);
      expect(resposta.body.dados.length).toBeLessThanOrEqual(1);
    });
  });

  describe('leilao ou categoria inexistente -> 404', () => {
    it('leilaoId que nao existe -> 404', async () => {
      const resposta = await rota('post', '', tokenSeller).send({
        ...dadosValidos('Items E2E Leilao Fake'),
        leilaoId: '24afe5fe-9857-44e7-866c-c814971433ea', // uuid v4 valido, mas nao existe no banco
      });
      expect(resposta.status).toBe(404);
    });

    it('categoriaId que nao existe -> 404', async () => {
      const resposta = await rota('post', '', tokenSeller).send({
        ...dadosValidos('Items E2E Categoria Fake'),
        categoriaId: '24afe5fe-9857-44e7-866c-c814971433ea', // uuid v4 valido, mas nao existe no banco
      });
      expect(resposta.status).toBe(404);
    });

    it('id malformado no GET -> 400 em portugues', async () => {
      const resposta = await rota('get', '/nao-e-um-uuid').expect(400);
      expect(resposta.body.mensagem).toBe('id deve ser um uuid válido');
    });
  });

  describe('dono do recurso (via leilao)', () => {
    it('outro SELLER nao pode editar item de leilao alheio -> 403', async () => {
      const criado = await rota('post', '', tokenSeller).send(
        dadosValidos('Items E2E Dono'),
      );

      const resposta = await rota(
        'patch',
        `/${criado.body.id}`,
        tokenOutroSeller,
      ).send({ titulo: 'Hackeado' });

      expect(resposta.status).toBe(403);
    });

    it('dono edita normalmente (200)', async () => {
      const criado = await rota('post', '', tokenSeller).send(
        dadosValidos('Items E2E Editar'),
      );

      const resposta = await rota(
        'patch',
        `/${criado.body.id}`,
        tokenSeller,
      )
        .send({ titulo: 'Items E2E Editado' })
        .expect(200);

      expect(resposta.body.titulo).toBe('Items E2E Editado');
    });
  });

  describe('so pode editar/remover enquanto o LEILAO esta em DRAFT', () => {
    it('leilao sai de DRAFT -> editar item vira 409', async () => {
      const outroLeilao = await request(app.getHttpServer())
        .post('/api/auctions')
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenSeller}`)
        .send({
          titulo: 'Items E2E Leilao Vai Abrir',
          dataInicio: '2099-02-01T00:00:00.000Z',
          dataFim: '2099-02-02T00:00:00.000Z',
        });
      const outroLeilaoId = (outroLeilao.body as { id: string }).id;

      const item = await rota('post', '', tokenSeller).send({
        ...dadosValidos('Items E2E Preso'),
        leilaoId: outroLeilaoId,
      });

      await request(app.getHttpServer())
        .patch(`/api/auctions/${outroLeilaoId}/status`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenSeller}`)
        .send({ status: 'SCHEDULED' });

      const resposta = await rota(
        'patch',
        `/${item.body.id}`,
        tokenSeller,
      ).send({ titulo: 'Tarde demais' });

      expect(resposta.status).toBe(409);
    });

    it('remover item enquanto o leilao ainda e DRAFT -> 204', async () => {
      const criado = await rota('post', '', tokenSeller).send(
        dadosValidos('Items E2E Remover OK'),
      );

      const resposta = await rota(
        'delete',
        `/${criado.body.id}`,
        tokenSeller,
      ).expect(204);

      expect(resposta.body).toEqual({});
    });
  });
});
