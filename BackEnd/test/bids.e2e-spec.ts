import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configurarAplicacao } from './../src/configurar-aplicacao';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Bids (e2e)', () => {
  let app: INestApplication<App>;
  let chave: string;
  let prisma: PrismaService;
  let tokenSeller: string;
  let tokenBidder1: string;
  let tokenBidder2: string;
  let emailSeller: string;
  let categoriaId: string;
  let leilaoAbertoId: string;
  let itemId: string;
  let leilaoDraftId: string;
  let itemDraftId: string;

  const EMAIL_BIDDER_1 = `bids.bidder1.${Date.now()}@teste.com`;
  const EMAIL_BIDDER_2 = `bids.bidder2.${Date.now()}@teste.com`;
  const SENHA_TESTE = 'Abc12345!';

  async function criarUsuario(nome: string, email: string, papel?: string) {
    await request(app.getHttpServer())
      .post('/api/auth/registrar')
      .set('X-API-KEY', chave)
      .send({ nome, email, senha: SENHA_TESTE });
    if (papel) {
      await prisma.user.update({ where: { email }, data: { papel } });
    }
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-API-KEY', chave)
      .send({ email, senha: SENHA_TESTE });
    return (login.body as { accessToken: string }).accessToken;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configurarAplicacao(app);
    await app.init();

    chave = app.get(ConfigService).getOrThrow<string>('API_KEY');
    prisma = app.get(PrismaService);

    emailSeller = `bids.seller.${Date.now()}@teste.com`;
    tokenSeller = await criarUsuario('Seller Bids', emailSeller, 'SELLER');
    tokenBidder1 = await criarUsuario('Bidder Um', EMAIL_BIDDER_1);
    tokenBidder2 = await criarUsuario('Bidder Dois', EMAIL_BIDDER_2);

    const categoria = await prisma.category.create({
      data: { nome: `Bids E2E Categoria ${Date.now()}` },
    });
    categoriaId = categoria.id;

    // Leilao que vai ficar ABERTO (dataInicio no passado, dataFim no futuro),
    // pronto para receber lances de verdade
    const agora = Date.now();
    const leilaoAberto = await request(app.getHttpServer())
      .post('/api/auctions')
      .set('X-API-KEY', chave)
      .set('Authorization', `Bearer ${tokenSeller}`)
      .send({
        titulo: 'Bids E2E Leilao Aberto',
        dataInicio: new Date(agora - 86400000).toISOString(),
        dataFim: new Date(agora + 86400000).toISOString(),
      });
    leilaoAbertoId = (leilaoAberto.body as { id: string }).id;

    // O item so pode ser criado enquanto o leilao ainda esta DRAFT
    const item = await request(app.getHttpServer())
      .post('/api/auction-items')
      .set('X-API-KEY', chave)
      .set('Authorization', `Bearer ${tokenSeller}`)
      .send({
        titulo: 'Bids E2E Item',
        precoInicial: 100,
        incrementoMinimo: 10,
        cep: '01310100',
        leilaoId: leilaoAbertoId,
        categoriaId,
      });
    itemId = (item.body as { id: string }).id;

    // Agora sim: DRAFT -> SCHEDULED -> OPEN
    await request(app.getHttpServer())
      .patch(`/api/auctions/${leilaoAbertoId}/status`)
      .set('X-API-KEY', chave)
      .set('Authorization', `Bearer ${tokenSeller}`)
      .send({ status: 'SCHEDULED' });
    await request(app.getHttpServer())
      .patch(`/api/auctions/${leilaoAbertoId}/status`)
      .set('X-API-KEY', chave)
      .set('Authorization', `Bearer ${tokenSeller}`)
      .send({ status: 'OPEN' });

    // Um segundo leilao, que fica em DRAFT de proposito, para testar que
    // nao se pode dar lance em um item de leilao ainda nao aberto
    const leilaoDraft = await request(app.getHttpServer())
      .post('/api/auctions')
      .set('X-API-KEY', chave)
      .set('Authorization', `Bearer ${tokenSeller}`)
      .send({
        titulo: 'Bids E2E Leilao Draft',
        dataInicio: new Date(agora - 86400000).toISOString(),
        dataFim: new Date(agora + 86400000).toISOString(),
      });
    leilaoDraftId = (leilaoDraft.body as { id: string }).id;

    const itemDraft = await request(app.getHttpServer())
      .post('/api/auction-items')
      .set('X-API-KEY', chave)
      .set('Authorization', `Bearer ${tokenSeller}`)
      .send({
        titulo: 'Bids E2E Item Draft',
        precoInicial: 50,
        incrementoMinimo: 5,
        cep: '01310100',
        leilaoId: leilaoDraftId,
        categoriaId,
      });
    itemDraftId = (itemDraft.body as { id: string }).id;
  }, 30_000); // varios registros/logins reais (bcrypt) -- 5s padrao do Jest e curto demais

  afterAll(async () => {
    // So da para apagar o que nunca recebeu lance nem mudou de status
    // (Bid e AuctionStatusHistory sao imutaveis e bloqueiam a exclusao em
    // cascata via onDelete: Restrict -- comportamento ja documentado nos
    // outros testes deste projeto)
    await prisma.auctionItem
      .deleteMany({ where: { id: itemDraftId } })
      .catch(() => undefined);
    await prisma.auction
      .deleteMany({ where: { id: leilaoDraftId, status: 'DRAFT' } })
      .catch(() => undefined);
    await prisma.category.deleteMany({ where: { id: categoriaId } }).catch(() => undefined);
    await prisma.user
      .deleteMany({
        where: { email: { in: [emailSeller, EMAIL_BIDDER_1, EMAIL_BIDDER_2] } },
      })
      .catch(() => undefined);
    await app.close();
  });

  describe('autorizacao e validacao basica', () => {
    it('sem token -> 401', async () => {
      const resposta = await request(app.getHttpServer())
        .post(`/api/auction-items/${itemId}/bids`)
        .set('X-API-KEY', chave)
        .send({ valor: 100 });
      expect(resposta.status).toBe(401);
    });

    it('SELLER tentando dar lance -> 403 (so BIDDER da lance)', async () => {
      const resposta = await request(app.getHttpServer())
        .post(`/api/auction-items/${itemId}/bids`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenSeller}`)
        .send({ valor: 100 });
      expect(resposta.status).toBe(403);
    });

    it('valor negativo -> 400', async () => {
      const resposta = await request(app.getHttpServer())
        .post(`/api/auction-items/${itemId}/bids`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenBidder1}`)
        .send({ valor: -10 });
      expect(resposta.status).toBe(400);
    });

    it('valor com mais de 2 casas decimais -> 400', async () => {
      const resposta = await request(app.getHttpServer())
        .post(`/api/auction-items/${itemId}/bids`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenBidder1}`)
        .send({ valor: 100.123 });
      expect(resposta.status).toBe(400);
    });
  });

  describe('item ou id invalido', () => {
    it('item inexistente (uuid valido) -> 404', async () => {
      const resposta = await request(app.getHttpServer())
        .post('/api/auction-items/24afe5fe-9857-44e7-866c-c814971433ea/bids')
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenBidder1}`)
        .send({ valor: 100 });
      expect(resposta.status).toBe(404);
    });

    it('id malformado -> 400 em portugues', async () => {
      const resposta = await request(app.getHttpServer())
        .post('/api/auction-items/nao-e-um-uuid/bids')
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenBidder1}`)
        .send({ valor: 100 });
      expect(resposta.status).toBe(400);
      expect(resposta.body.mensagem).toBe('id deve ser um uuid valido');
    });
  });

  describe('leilao precisa estar OPEN', () => {
    it('lance em item de leilao ainda DRAFT -> 409', async () => {
      const resposta = await request(app.getHttpServer())
        .post(`/api/auction-items/${itemDraftId}/bids`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenBidder1}`)
        .send({ valor: 50 });
      expect(resposta.status).toBe(409);
      expect(resposta.body.mensagem).toContain('aberto');
    });
  });

  describe('fluxo principal: valor minimo e evolucao do lance', () => {
    it('lance abaixo do preco inicial (100) -> 409', async () => {
      const resposta = await request(app.getHttpServer())
        .post(`/api/auction-items/${itemId}/bids`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenBidder1}`)
        .send({ valor: 50 });
      expect(resposta.status).toBe(409);
    });

    it('primeiro lance, igual ao preco inicial -> 201, valor como string', async () => {
      const resposta = await request(app.getHttpServer())
        .post(`/api/auction-items/${itemId}/bids`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenBidder1}`)
        .send({ valor: 100 })
        .expect(201);

      expect(typeof resposta.body.valor).toBe('string');
      expect(Number(resposta.body.valor)).toBe(100);
      expect(resposta.body.lanceAnterior).toBeNull();

      const itemAtualizado = await request(app.getHttpServer())
        .get(`/api/auction-items/${itemId}`)
        .set('X-API-KEY', chave);
      expect(Number(itemAtualizado.body.lanceAtual)).toBe(100);
    });

    it('lance abaixo do minimo (lanceAtual + incremento = 110) -> 409', async () => {
      const resposta = await request(app.getHttpServer())
        .post(`/api/auction-items/${itemId}/bids`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenBidder1}`)
        .send({ valor: 105 });
      expect(resposta.status).toBe(409);
      expect(resposta.body.mensagem).toContain('110');
    });

    it('lance valido, supera o minimo -> 201', async () => {
      const resposta = await request(app.getHttpServer())
        .post(`/api/auction-items/${itemId}/bids`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenBidder1}`)
        .send({ valor: 150 })
        .expect(201);

      expect(Number(resposta.body.valor)).toBe(150);
      expect(Number(resposta.body.lanceAnterior)).toBe(100);
    });
  });

  describe('consultas por relacionamento', () => {
    it('GET /auction-items/:itemId/bids lista os lances, paginado, do maior para o menor, sem exigir token', async () => {
      const resposta = await request(app.getHttpServer())
        .get(`/api/auction-items/${itemId}/bids`)
        .set('X-API-KEY', chave)
        .expect(200);

      expect(resposta.body.pagina).toBe(1);
      expect(resposta.body.limite).toBe(20);
      const valores = (resposta.body.dados as { valor: string }[]).map((b) =>
        Number(b.valor),
      );
      expect(valores).toEqual([...valores].sort((a, b) => b - a));
      expect(valores).toContain(150);
      expect(valores).toContain(100);
    });

    it('GET /auction-items/:itemId/bids com ?limite=1 devolve no maximo 1 lance', async () => {
      const resposta = await request(app.getHttpServer())
        .get(`/api/auction-items/${itemId}/bids?limite=1`)
        .set('X-API-KEY', chave)
        .expect(200);

      expect(resposta.body.dados.length).toBeLessThanOrEqual(1);
      expect(resposta.body.total).toBeGreaterThanOrEqual(2);
    });

    it('GET /auction-items/:itemId reflete o indicador totalLances (2 lances ate aqui)', async () => {
      const resposta = await request(app.getHttpServer())
        .get(`/api/auction-items/${itemId}`)
        .set('X-API-KEY', chave)
        .expect(200);

      expect(resposta.body.totalLances).toBe(2);
    });

    it('GET /bids/meus sem token -> 401', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/api/bids/meus')
        .set('X-API-KEY', chave);
      expect(resposta.status).toBe(401);
    });

    it('GET /bids/meus retorna os lances do proprio usuario logado, paginado', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/api/bids/meus')
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenBidder1}`)
        .expect(200);

      expect(resposta.body.pagina).toBe(1);
      const lances = resposta.body.dados as { itemId: string }[];
      expect(lances.every((l) => l.itemId !== undefined)).toBe(true);
      expect(lances.some((l) => l.itemId === itemId)).toBe(true);
    });

    it('?pagina=0 -> 400', () => {
      return request(app.getHttpServer())
        .get(`/api/auction-items/${itemId}/bids?pagina=0`)
        .set('X-API-KEY', chave)
        .expect(400);
    });
  });

  describe('concorrencia: dois lances simultaneos no mesmo item', () => {
    it('so um dos dois vence, o outro e rejeitado por causa do lock pessimista', async () => {
      // Estado atual: lanceAtual = 150, incrementoMinimo = 10 -> minimo = 160.
      // Os dois valores abaixo sao validos SE avaliados contra 150, mas so um
      // pode vencer: quem pegar o lock primeiro atualiza o lanceAtual, e o
      // outro e reavaliado contra esse novo valor (nao contra o antigo)
      const [respostaA, respostaB] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/auction-items/${itemId}/bids`)
          .set('X-API-KEY', chave)
          .set('Authorization', `Bearer ${tokenBidder1}`)
          .send({ valor: 170 }),
        request(app.getHttpServer())
          .post(`/api/auction-items/${itemId}/bids`)
          .set('X-API-KEY', chave)
          .set('Authorization', `Bearer ${tokenBidder2}`)
          .send({ valor: 171 }),
      ]);

      const statusOrdenados = [respostaA.status, respostaB.status].sort(
        (a, b) => a - b,
      );
      expect(statusOrdenados).toEqual([201, 409]);

      const vencedora = respostaA.status === 201 ? respostaA : respostaB;

      const itemAtualizado = await request(app.getHttpServer())
        .get(`/api/auction-items/${itemId}`)
        .set('X-API-KEY', chave);
      expect(Number(itemAtualizado.body.lanceAtual)).toBe(
        Number(vencedora.body.valor),
      );
    });
  });

  describe('vendedor nao pode dar lance no proprio item', () => {
    it('promovendo o vendedor a BIDDER (efeito imediato, sem novo login) -> 409 ao tentar dar lance no proprio item', async () => {
      await prisma.user.update({
        where: { email: emailSeller },
        data: { papel: 'BIDDER' },
      });

      const resposta = await request(app.getHttpServer())
        .post(`/api/auction-items/${itemId}/bids`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenSeller}`)
        .send({ valor: 1000 });

      expect(resposta.status).toBe(409);
      expect(resposta.body.mensagem).toContain('proprio item');
    });
  });
});
