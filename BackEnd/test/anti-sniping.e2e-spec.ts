import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configurarAplicacao } from './../src/configurar-aplicacao';
import { CepService } from './../src/cep/cep.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { cepFalso } from './cep-falso';
import { PERFIL_COMPLETO } from './perfil-teste';

// Anti-sniping: lance nos ultimos 2 minutos estende o prazo do leilao (regra do servidor, na transacao do lance)
describe('Anti-sniping (e2e)', () => {
  let app: INestApplication<App>;
  let chave: string;
  let prisma: PrismaService;
  let categoriaId: string;
  let vendedorId: string;
  let tokenComprador: string;
  let tokenOutro: string;

  const SUFIXO = Date.now();

  const api = (metodo: 'get' | 'post', rota: string, token?: string) => {
    const req = request(app.getHttpServer())[metodo](`/api${rota}`).set('X-API-KEY', chave);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  async function criarUsuario(quem: string, papel: 'BIDDER' | 'SELLER') {
    const usuario = await prisma.user.create({
      data: { nome: `Snipe ${quem}`, email: `snipe.${quem}.${SUFIXO}@teste.com`, senha: 'x', papel, ...PERFIL_COMPLETO },
    });
    const sessao = await prisma.session.create({ data: { usuarioId: usuario.id, refreshHash: 'teste', expiraEm: new Date(Date.now() + 86_400_000) } });
    return { id: usuario.id, token: app.get(JwtService, { strict: false }).sign({ sub: usuario.id, papel, sid: sessao.id }) };
  }

  // Leilao ABERTO que termina daqui a "restanteMs", com um item de preco inicial 100 e incremento 10
  async function criarLeilao(restanteMs: number) {
    const leilao = await prisma.auction.create({
      data: { titulo: 'Leilao anti-sniping', status: 'OPEN', dataInicio: new Date(Date.now() - 3_600_000), dataFim: new Date(Date.now() + restanteMs), vendedorId },
    });
    const item = await prisma.auctionItem.create({
      data: { titulo: 'Peca anti-sniping', precoInicial: 100, incrementoMinimo: 10, cep: '01310100', leilaoId: leilao.id, categoriaId },
    });
    return { leilaoId: leilao.id, itemId: item.id };
  }

  const dar = (itemId: string, valor: number, token = tokenComprador) => api('post', `/auction-items/${itemId}/bids`, token).send({ valor });
  const leilaoDoBanco = (id: string) => prisma.auction.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    const modulo: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CepService)
      .useValue(cepFalso)
      .compile();
    app = modulo.createNestApplication();
    configurarAplicacao(app);
    await app.init();
    chave = app.get(ConfigService).getOrThrow<string>('API_KEY');
    prisma = app.get(PrismaService);
    categoriaId = (await prisma.category.create({ data: { nome: `Categoria Snipe ${SUFIXO}` } })).id;
    vendedorId = (await criarUsuario('vendedor', 'SELLER')).id;
    tokenComprador = (await criarUsuario('comprador', 'BIDDER')).token;
    tokenOutro = (await criarUsuario('outro', 'BIDDER')).token;
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it('lance com bastante prazo (1 hora) NAO estende', async () => {
    const { leilaoId, itemId } = await criarLeilao(3_600_000);
    const antes = await leilaoDoBanco(leilaoId);
    await dar(itemId, 100).expect(201);
    const depois = await leilaoDoBanco(leilaoId);
    expect(depois.dataFim.getTime()).toBe(antes.dataFim.getTime());
    expect(depois.prorrogacoes).toBe(0);
  });

  it('lance faltando 3 minutos (fora da janela de 2) NAO estende', async () => {
    const { leilaoId, itemId } = await criarLeilao(3 * 60_000);
    await dar(itemId, 100).expect(201);
    expect((await leilaoDoBanco(leilaoId)).prorrogacoes).toBe(0);
  });

  it('lance faltando 30 segundos ESTENDE: o fim passa a ser "agora + 2 minutos" e a contagem sobe', async () => {
    const { leilaoId, itemId } = await criarLeilao(30_000);
    await dar(itemId, 100).expect(201);

    const depois = await leilaoDoBanco(leilaoId);
    expect(depois.prorrogacoes).toBe(1);
    const restante = (depois.dataFim.getTime() - Date.now()) / 1000;
    expect(restante).toBeGreaterThan(110);
    expect(restante).toBeLessThanOrEqual(120);

    // o servidor ja informa o novo prazo na peca (e a tela so o exibe)
    const item = await api('get', `/auction-items/${itemId}`).expect(200);
    expect(item.body.prorrogacoes).toBe(1);
    expect(item.body.segundosParaMudanca).toBeGreaterThan(110);
    expect(item.body.situacao).toBe('ABERTO');
  });

  it('cada novo lance na janela estende de novo (varias prorrogacoes seguidas)', async () => {
    const { leilaoId, itemId } = await criarLeilao(20_000);
    await dar(itemId, 100).expect(201); // estende: agora faltam ~120s (dentro da janela? nao: 120s nao e < 120s)
    const primeira = await leilaoDoBanco(leilaoId);
    expect(primeira.prorrogacoes).toBe(1);

    // simula o tempo passando: faltam 10s para o novo fim
    await prisma.auction.update({ where: { id: leilaoId }, data: { dataFim: new Date(Date.now() + 10_000) } });
    await dar(itemId, 110, tokenOutro).expect(201);
    const segunda = await leilaoDoBanco(leilaoId);
    expect(segunda.prorrogacoes).toBe(2);
    expect(segunda.dataFim.getTime()).toBeGreaterThan(Date.now() + 100_000);
  });

  it('lance REJEITADO na janela final nao estende o prazo', async () => {
    const { leilaoId, itemId } = await criarLeilao(30_000);
    await dar(itemId, 50).expect(409); // abaixo do preco inicial
    const depois = await leilaoDoBanco(leilaoId);
    expect(depois.prorrogacoes).toBe(0);
    expect(depois.dataFim.getTime() - Date.now()).toBeLessThanOrEqual(30_000);
  });

  it('a prorrogacao fica na auditoria e o leilao continua ABERTO depois do prazo original', async () => {
    const { leilaoId, itemId } = await criarLeilao(5_000);
    await dar(itemId, 100).expect(201);
    const registro = await prisma.auditLog.findFirst({ where: { acao: 'LEILAO_PRAZO_ESTENDIDO', entidadeId: leilaoId } });
    expect(registro).not.toBeNull();
    expect(registro?.resultado).toBe('SUCCESS');

    // o robo de encerramento so fecha quem passou do prazo ATUAL: este ainda nao passou
    const vencidos = await prisma.auction.count({ where: { id: leilaoId, status: 'OPEN', dataFim: { lte: new Date() } } });
    expect(vencidos).toBe(0);
  });
});
