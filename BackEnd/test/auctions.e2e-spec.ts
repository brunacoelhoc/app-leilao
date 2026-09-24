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

describe('Auctions (e2e)', () => {
  let app: INestApplication<App>;
  let chave: string;
  let prisma: PrismaService;
  let tokenSeller: string;
  let tokenOutroSeller: string;
  let tokenBidder: string;
  let tokenAdmin: string;
  let idBidder: string;
  let categoriaId: string;

  const EMAIL_SELLER = 'auctions.seller@teste.com';
  const EMAIL_OUTRO_SELLER = 'auctions.outro.seller@teste.com';
  const EMAIL_BIDDER = 'auctions.bidder@teste.com';
  const EMAIL_ADMIN = 'auctions.admin@teste.com';
  const SENHA_TESTE = 'Abc12345!';

  // Ajuda a registrar+logar um usuario e (se precisar) promove-lo a outro papel
  async function criarUsuario(nome: string, email: string, papel?: string) {
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

    tokenSeller = await criarUsuario('Seller Auctions', EMAIL_SELLER, 'SELLER');
    tokenOutroSeller = await criarUsuario(
      'Outro Seller',
      EMAIL_OUTRO_SELLER,
      'SELLER',
    );
    tokenBidder = await criarUsuario('Bidder Auctions', EMAIL_BIDDER);
    tokenAdmin = await criarUsuario('Admin Auctions', EMAIL_ADMIN, 'ADMIN');

    const bidderUser = await prisma.user.findUniqueOrThrow({
      where: { email: EMAIL_BIDDER },
    });
    idBidder = bidderUser.id;

    const categoria = await prisma.category.create({
      data: { nome: `Auctions E2E Categoria ${Date.now()}` },
    });
    categoriaId = categoria.id;
  }, 30_000); // varios registros/logins reais (bcrypt) -- 5s padrao do Jest e curto demais

  afterAll(async () => {
    // AuctionStatusHistory nunca pode ser apagado (trigger de imutabilidade da
    // migration) e um leilao com historico tambem fica protegido (onDelete:
    // Restrict) -- e o comportamento CORRETO para leiloes de verdade (trilha
    // de auditoria a prova de exclusao). Por isso so limpamos aqui os leiloes
    // que ainda estao em DRAFT (nunca tiveram historico); os que passaram por
    // alguma mudanca de status ficam para sempre no banco, de proposito
    const rascunhos = { titulo: { startsWith: 'Auctions E2E' }, status: 'DRAFT' as const };
    await prisma.auctionItem.deleteMany({ where: { leilao: rascunhos } }); // itens de apoio dos testes
    await prisma.auction.deleteMany({ where: rascunhos });

    // Todo login grava uma linha em AuditLog (auditoria), que nunca pode ser
    // apagada -- por isso qualquer usuario que ja logou (todos aqui) pode
    // ficar "preso" para sempre (onDelete: Restrict). Tentativa best-effort
    await prisma.user
      .deleteMany({
        where: {
          email: {
            in: [EMAIL_SELLER, EMAIL_OUTRO_SELLER, EMAIL_BIDDER, EMAIL_ADMIN],
          },
        },
      })
      .catch(() => undefined);

    // Itens vendidos (SOLD) travam a categoria (onDelete: Restrict);
    // tentativa best-effort, sem quebrar o teste
    await prisma.category.deleteMany({ where: { id: categoriaId } }).catch(() => undefined);

    await app.close();
  });

  const rota = (
    metodo: 'get' | 'post' | 'patch' | 'delete',
    caminho: string,
    token?: string,
  ) => {
    const req = request(app.getHttpServer())
      [metodo](`/api/auctions${caminho}`)
      .set('X-API-KEY', chave);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  const dadosValidos = (titulo: string) => ({
    titulo,
    dataInicio: '2027-01-01T00:00:00.000Z',
    dataFim: '2027-01-10T00:00:00.000Z',
  });

  describe('autorizacao: so SELLER cria', () => {
    it('BIDDER tentando criar -> 403', async () => {
      const resposta = await rota('post', '', tokenBidder).send(
        dadosValidos('Auctions E2E Bloqueado'),
      );
      expect(resposta.status).toBe(403);
    });

    it('sem token -> 401', async () => {
      const resposta = await rota('post', '').send(
        dadosValidos('Auctions E2E Bloqueado'),
      );
      expect(resposta.status).toBe(401);
    });
  });

  describe('leitura e livre para qualquer um', () => {
    it('GET / sem token -> 200, formato paginado', async () => {
      const resposta = await rota('get', '').expect(200);
      expect(Array.isArray(resposta.body.dados)).toBe(true);
      expect(resposta.body.pagina).toBe(1);
      expect(resposta.body.limite).toBe(20);
    });

    it('?vendedorId= filtra pelos leiloes de um vendedor (consulta por relacionamento)', async () => {
      const criado = await rota('post', '', tokenSeller).send(
        dadosValidos('Auctions E2E Filtro Vendedor'),
      );
      const idVendedor = (
        await prisma.auction.findUniqueOrThrow({ where: { id: criado.body.id as string } })
      ).vendedorId;

      const resposta = await rota('get', `?vendedorId=${idVendedor}`).expect(200);
      const leiloes = resposta.body.dados as { id: string; vendedorId: string }[];
      expect(leiloes.length).toBeGreaterThan(0);
      expect(leiloes.every((l) => l.vendedorId === idVendedor)).toBe(true);
    });

    it('?limite=2 devolve no maximo 2 itens', async () => {
      const resposta = await rota('get', '?limite=2').expect(200);
      expect(resposta.body.dados.length).toBeLessThanOrEqual(2);
    });

    it('?pagina=0 -> 400 (pagina comeca em 1)', async () => {
      const resposta = await rota('get', '?pagina=0');
      expect(resposta.status).toBe(400);
    });

    it('id valido mas inexistente -> 404', () => {
      return rota('get', '/00000000-0000-0000-0000-000000000000').expect(404);
    });

    it('id malformado -> 400 em portugues', async () => {
      const resposta = await rota('get', '/nao-e-um-uuid').expect(400);
      expect(resposta.body.mensagem).toBe('id deve ser um uuid valido');
    });
  });

  describe('dono do recurso: nao da para mexer no leilao de outro so trocando o id', () => {
    it('SELLER de outro dono nao pode editar -> 403', async () => {
      const criado = await rota('post', '', tokenSeller).send(
        dadosValidos('Auctions E2E Dono'),
      );

      const resposta = await rota(
        'patch',
        `/${criado.body.id}`,
        tokenOutroSeller,
      ).send({ titulo: 'Hackeado' });

      expect(resposta.status).toBe(403);
    });

    it('ADMIN pode editar o leilao de qualquer vendedor', async () => {
      const criado = await rota('post', '', tokenSeller).send(
        dadosValidos('Auctions E2E Dono Admin'),
      );

      const resposta = await rota(
        'patch',
        `/${criado.body.id}`,
        tokenAdmin,
      )
        .send({ titulo: 'Editado pelo ADMIN' })
        .expect(200);

      expect(resposta.body.titulo).toBe('Editado pelo ADMIN');
    });
  });

  describe('so pode editar/remover enquanto DRAFT', () => {
    it('editar depois de sair de DRAFT -> 409', async () => {
      const criado = await rota('post', '', tokenSeller).send(
        dadosValidos('Auctions E2E Editar Depois'),
      );
      await adicionarItem(criado.body.id as string);
      await rota('patch', `/${criado.body.id}/status`, tokenSeller).send({
        status: 'SCHEDULED',
      });

      const resposta = await rota(
        'patch',
        `/${criado.body.id}`,
        tokenSeller,
      ).send({ titulo: 'Tarde demais' });

      expect(resposta.status).toBe(409);
    });

    it('remover depois de sair de DRAFT -> 409', async () => {
      const criado = await rota('post', '', tokenSeller).send(
        dadosValidos('Auctions E2E Remover Depois'),
      );
      await adicionarItem(criado.body.id as string);
      await rota('patch', `/${criado.body.id}/status`, tokenSeller).send({
        status: 'SCHEDULED',
      });

      const resposta = await rota(
        'delete',
        `/${criado.body.id}`,
        tokenSeller,
      );

      expect(resposta.status).toBe(409);
    });

    it('remover enquanto DRAFT -> 204', async () => {
      const criado = await rota('post', '', tokenSeller).send(
        dadosValidos('Auctions E2E Remover OK'),
      );

      const resposta = await rota(
        'delete',
        `/${criado.body.id}`,
        tokenSeller,
      ).expect(204);

      expect(resposta.body).toEqual({});
    });
  });

  describe('fluxo completo de mudanca de estado', () => {
    it('DRAFT -> SCHEDULED -> OPEN -> CLOSED, cada passo grava historico', async () => {
      const criado = await rota('post', '', tokenSeller).send(
        dadosValidos('Auctions E2E Fluxo Completo'),
      );
      const id = criado.body.id as string;
      await adicionarItem(id);

      await rota('patch', `/${id}/status`, tokenSeller)
        .send({ status: 'SCHEDULED' })
        .expect(200);
      await rota('patch', `/${id}/status`, tokenSeller)
        .send({ status: 'OPEN' })
        .expect(200);
      const fechado = await rota('patch', `/${id}/status`, tokenSeller)
        .send({ status: 'CLOSED' })
        .expect(200);

      expect(fechado.body.status).toBe('CLOSED');

      const historico = await prisma.auctionStatusHistory.findMany({
        where: { leilaoId: id },
        orderBy: { criadoEm: 'asc' },
      });
      expect(historico.map((h) => h.statusNovo)).toEqual([
        'SCHEDULED',
        'OPEN',
        'CLOSED',
      ]);
    });

    it('transicao invalida (pular etapa) -> 409', async () => {
      const criado = await rota('post', '', tokenSeller).send(
        dadosValidos('Auctions E2E Transicao Invalida'),
      );

      const resposta = await rota(
        'patch',
        `/${criado.body.id}/status`,
        tokenSeller,
      ).send({ status: 'OPEN' }); // DRAFT nao pode ir direto para OPEN

      expect(resposta.status).toBe(409);
    });

    it('agendar leilao SEM itens -> 409', async () => {
      const criado = await rota('post', '', tokenSeller).send(
        dadosValidos('Auctions E2E Agendar Vazio'),
      );

      const resposta = await rota('patch', `/${criado.body.id}/status`, tokenSeller)
        .send({ status: 'SCHEDULED' });

      expect(resposta.status).toBe(409);
      expect(resposta.body.mensagem).toContain('ao menos um item');
    });

    it('agendar leilao cuja dataFim ja passou -> 409', async () => {
      const agora = Date.now();
      const criado = await rota('post', '', tokenSeller).send({
        titulo: 'Auctions E2E Agendar Vencido',
        dataInicio: new Date(agora - 2 * 86400000).toISOString(),
        dataFim: new Date(agora - 86400000).toISOString(),
      });
      await adicionarItem(criado.body.id as string);

      const resposta = await rota('patch', `/${criado.body.id}/status`, tokenSeller)
        .send({ status: 'SCHEDULED' });

      expect(resposta.status).toBe(409);
      expect(resposta.body.mensagem).toContain('data de fim');
    });

    it('duas mudancas de estado ao mesmo tempo (fechar x cancelar): so uma vence, a outra -> 409, historico sem duplicata', async () => {
      const { leilaoId } = await criarLeilaoAbertoComItem('Auctions E2E Corrida Status');

      const [fechar, cancelar] = await Promise.all([
        rota('patch', `/${leilaoId}/status`, tokenSeller).send({ status: 'CLOSED' }),
        rota('patch', `/${leilaoId}/status`, tokenSeller).send({ status: 'CANCELED', motivo: 'Corrida' }),
      ]);

      expect([fechar.status, cancelar.status].sort((a, b) => a - b)).toEqual([200, 409]);
      const finais = await prisma.auctionStatusHistory.count({
        where: { leilaoId, statusNovo: { in: ['CLOSED', 'CANCELED'] } },
      });
      expect(finais).toBe(1);
    });

    it('cancelar sem motivo -> 400', async () => {
      const criado = await rota('post', '', tokenSeller).send(
        dadosValidos('Auctions E2E Cancelar Sem Motivo'),
      );

      const resposta = await rota(
        'patch',
        `/${criado.body.id}/status`,
        tokenSeller,
      ).send({ status: 'CANCELED' });

      expect(resposta.status).toBe(400);
    });

    it('cancelar com motivo -> 200, motivo gravado no historico', async () => {
      const criado = await rota('post', '', tokenSeller).send(
        dadosValidos('Auctions E2E Cancelar Com Motivo'),
      );

      await rota('patch', `/${criado.body.id}/status`, tokenSeller)
        .send({ status: 'CANCELED', motivo: 'Item indisponivel' })
        .expect(200);

      const historico = await prisma.auctionStatusHistory.findFirst({
        where: { leilaoId: criado.body.id as string, statusNovo: 'CANCELED' },
      });
      expect(historico?.motivo).toBe('Item indisponivel');
    });
  });

  describe('edicao parcial de datas', () => {
    it('so dataInicio, depois da dataFim ja gravada -> 409', async () => {
      const criado = await rota('post', '', tokenSeller).send(
        dadosValidos('Auctions E2E Data Parcial'),
      );

      const resposta = await rota('patch', `/${criado.body.id}`, tokenSeller)
        .send({ dataInicio: '2027-02-01T00:00:00.000Z' }); // dataFim gravada: 2027-01-10

      expect(resposta.status).toBe(409);
      expect(resposta.body.mensagem).toContain('dataFim deve ser depois de dataInicio');
    });
  });

  describe('validacao do corpo -> 400', () => {
    it('dataFim antes de dataInicio -> 400', async () => {
      const resposta = await rota('post', '', tokenSeller).send({
        titulo: 'Auctions E2E Datas Invertidas',
        dataInicio: '2027-01-10T00:00:00.000Z',
        dataFim: '2027-01-01T00:00:00.000Z',
      });

      expect(resposta.status).toBe(400);
      expect(resposta.body.mensagem).toEqual([
        'dataFim deve ser uma data depois de dataInicio',
      ]);
    });
  });

  // Um leilao so pode ser agendado com ao menos um item
  async function adicionarItem(leilaoId: string) {
    await request(app.getHttpServer())
      .post('/api/auction-items')
      .set('X-API-KEY', chave)
      .set('Authorization', `Bearer ${tokenSeller}`)
      .send({ titulo: 'Item de apoio', precoInicial: 50, incrementoMinimo: 5, cep: '01310100', leilaoId, categoriaId })
      .expect(201);
  }

  // Cria um leilao ja no periodo (dataInicio no passado, dataFim no futuro)
  // com um item, e avanca ate OPEN -- pronto para receber lances. Usado tanto
  // pelo fechamento com vencedor quanto pelos indicadores do leilao
  async function criarLeilaoAbertoComItem(titulo: string) {
    const agora = Date.now();
    const leilao = await rota('post', '', tokenSeller).send({
      titulo,
      dataInicio: new Date(agora - 86400000).toISOString(),
      dataFim: new Date(agora + 86400000).toISOString(),
    });
    const leilaoId = leilao.body.id as string;

    const item = await request(app.getHttpServer())
      .post('/api/auction-items')
      .set('X-API-KEY', chave)
      .set('Authorization', `Bearer ${tokenSeller}`)
      .send({
        titulo: `${titulo} Item`,
        precoInicial: 50,
        incrementoMinimo: 5,
        cep: '01310100',
        leilaoId,
        categoriaId,
      });
    const itemId = item.body.id as string;

    await rota('patch', `/${leilaoId}/status`, tokenSeller).send({
      status: 'SCHEDULED',
    });
    await rota('patch', `/${leilaoId}/status`, tokenSeller).send({
      status: 'OPEN',
    });

    return { leilaoId, itemId };
  }

  describe('fechamento do leilao com definicao do vencedor', () => {
    it('item com lance -> ao fechar vira SOLD, vencedorId e quem deu o maior lance', async () => {
      const { leilaoId, itemId } = await criarLeilaoAbertoComItem(
        'Auctions E2E Fechamento Com Lance',
      );

      await request(app.getHttpServer())
        .post(`/api/auction-items/${itemId}/bids`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenBidder}`)
        .send({ valor: 50 })
        .expect(201);

      await rota('patch', `/${leilaoId}/status`, tokenSeller)
        .send({ status: 'CLOSED' })
        .expect(200);

      const itemFechado = await request(app.getHttpServer())
        .get(`/api/auction-items/${itemId}`)
        .set('X-API-KEY', chave);

      expect(itemFechado.body.status).toBe('SOLD');
      expect(itemFechado.body.vencedorId).toBe(idBidder);
    });

    it('item sem nenhum lance -> ao fechar vira UNSOLD, sem vencedor', async () => {
      const { leilaoId, itemId } = await criarLeilaoAbertoComItem(
        'Auctions E2E Fechamento Sem Lance',
      );

      await rota('patch', `/${leilaoId}/status`, tokenSeller)
        .send({ status: 'CLOSED' })
        .expect(200);

      const itemFechado = await request(app.getHttpServer())
        .get(`/api/auction-items/${itemId}`)
        .set('X-API-KEY', chave);

      expect(itemFechado.body.status).toBe('UNSOLD');
      expect(itemFechado.body.vencedorId).toBeNull();
    });
  });

  describe('transicoesPermitidas (a maquina de estados vem do backend)', () => {
    it('cada leilao informa para quais estados pode ir agora', async () => {
      const criado = await rota('post', '', tokenSeller).send(
        dadosValidos('Auctions E2E Transicoes'),
      );
      await adicionarItem(criado.body.id as string);
      expect(criado.body.transicoesPermitidas).toEqual(['SCHEDULED', 'CANCELED']);
      expect(criado.body.editavel).toBe(true); // rascunho pode ser editado

      const agendado = await rota('patch', `/${criado.body.id}/status`, tokenSeller)
        .send({ status: 'SCHEDULED' })
        .expect(200);
      expect(agendado.body.transicoesPermitidas).toEqual(['OPEN', 'CANCELED']);
      expect(agendado.body.editavel).toBe(false); // depois de agendado, nao

      const lido = await rota('get', `/${criado.body.id}`).expect(200);
      expect(lido.body.transicoesPermitidas).toEqual(['OPEN', 'CANCELED']);
    });
  });

  describe('GET /auctions/:id/indicadores', () => {
    it('id malformado -> 400 em portugues', async () => {
      const resposta = await rota('get', '/nao-e-um-uuid/indicadores').expect(
        400,
      );
      expect(resposta.body.mensagem).toBe('id deve ser um uuid valido');
    });

    it('id valido mas inexistente -> 404', () => {
      return rota(
        'get',
        '/00000000-0000-0000-0000-000000000000/indicadores',
      ).expect(404);
    });

    it('antes de fechar: reflete o lance recebido, mas nada foi vendido ainda', async () => {
      const { leilaoId, itemId } = await criarLeilaoAbertoComItem(
        'Auctions E2E Indicadores Antes',
      );

      await request(app.getHttpServer())
        .post(`/api/auction-items/${itemId}/bids`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenBidder}`)
        .send({ valor: 50 })
        .expect(201);

      const resposta = await rota('get', `/${leilaoId}/indicadores`).expect(
        200,
      );

      expect(resposta.body.totalItens).toBe(1);
      expect(resposta.body.totalLances).toBe(1);
      expect(Number(resposta.body.maiorLance)).toBe(50);
      expect(resposta.body.itensDisponiveis).toBe(1);
      expect(resposta.body.itensVendidos).toBe(0);
      expect(Number(resposta.body.arrecadadoTotal)).toBe(0);
    });

    it('depois de fechar: item vendido entra no total arrecadado', async () => {
      const { leilaoId, itemId } = await criarLeilaoAbertoComItem(
        'Auctions E2E Indicadores Depois',
      );

      await request(app.getHttpServer())
        .post(`/api/auction-items/${itemId}/bids`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenBidder}`)
        .send({ valor: 60 })
        .expect(201);

      await rota('patch', `/${leilaoId}/status`, tokenSeller)
        .send({ status: 'CLOSED' })
        .expect(200);

      const resposta = await rota('get', `/${leilaoId}/indicadores`).expect(
        200,
      );

      expect(resposta.body.totalItens).toBe(1);
      expect(resposta.body.totalLances).toBe(1);
      expect(Number(resposta.body.maiorLance)).toBe(60);
      expect(resposta.body.itensVendidos).toBe(1);
      expect(resposta.body.itensDisponiveis).toBe(0);
      expect(Number(resposta.body.arrecadadoTotal)).toBe(60);
    });

    it('leilao sem nenhum item: indicadores todos zerados', async () => {
      const criado = await rota('post', '', tokenSeller).send(
        dadosValidos('Auctions E2E Indicadores Vazio'),
      );

      const resposta = await rota(
        'get',
        `/${criado.body.id}/indicadores`,
      ).expect(200);

      expect(resposta.body.totalItens).toBe(0);
      expect(resposta.body.totalLances).toBe(0);
      expect(resposta.body.maiorLance).toBeNull();
      expect(Number(resposta.body.arrecadadoTotal)).toBe(0);
    });
  });
});
