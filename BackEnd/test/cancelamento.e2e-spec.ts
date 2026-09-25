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

// Cancelar leilao ABERTO com lances: so o ADMIN (com motivo). O vendedor nao pode cancelar quando o preco nao agrada
describe('Cancelamento de leilao com lances (e2e)', () => {
  let app: INestApplication<App>;
  let chave: string;
  let prisma: PrismaService;
  let categoriaId: string;
  let vendedor: { id: string; token: string };
  let outroVendedor: { id: string; token: string };
  let admin: { id: string; token: string };
  let licitanteId: string;
  let licitanteToken: string;

  const SUFIXO = Date.now();

  const cancelar = (leilaoId: string, token: string, motivo = 'Motivo de teste') =>
    request(app.getHttpServer())
      .patch(`/api/auctions/${leilaoId}/status`)
      .set('X-API-KEY', chave)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CANCELED', motivo });

  async function criarUsuario(quem: string, papel: 'BIDDER' | 'SELLER' | 'ADMIN') {
    const usuario = await prisma.user.create({
      data: { nome: `Cancel ${quem}`, email: `cancel.${quem}.${SUFIXO}@teste.com`, senha: 'x', papel, ...PERFIL_COMPLETO },
    });
    const sessao = await prisma.session.create({ data: { usuarioId: usuario.id, refreshHash: 'teste', expiraEm: new Date(Date.now() + 86_400_000) } });
    return { id: usuario.id, token: app.get(JwtService, { strict: false }).sign({ sub: usuario.id, papel, sid: sessao.id }) };
  }

  // Leilao ABERTO do vendedor, com ou sem um lance ja dado
  async function leilaoAberto(comLance: boolean, dataFim = new Date(Date.now() + 3_600_000), status: 'OPEN' | 'DRAFT' = 'OPEN') {
    const leilao = await prisma.auction.create({
      data: { titulo: 'Leilao cancelamento', status, dataInicio: new Date(Date.now() - 3_600_000), dataFim, vendedorId: vendedor.id },
    });
    const item = await prisma.auctionItem.create({
      data: { titulo: 'Peca cancelamento', precoInicial: 50, incrementoMinimo: 10, cep: '01310100', leilaoId: leilao.id, categoriaId, lanceAtual: comLance ? 60 : null },
    });
    if (comLance) await prisma.bid.create({ data: { valor: 60, lanceAnterior: null, itemId: item.id, licitanteId } });
    return leilao.id;
  }

  const statusDoBanco = async (id: string) => (await prisma.auction.findUniqueOrThrow({ where: { id } })).status;

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
    categoriaId = (await prisma.category.create({ data: { nome: `Categoria Cancel ${SUFIXO}` } })).id;
    vendedor = await criarUsuario('vendedor', 'SELLER');
    outroVendedor = await criarUsuario('outro', 'SELLER');
    admin = await criarUsuario('admin', 'ADMIN');
    const licitante = await criarUsuario('licitante', 'BIDDER');
    licitanteId = licitante.id;
    licitanteToken = licitante.token;
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it('vendedor cancela o PROPRIO leilao aberto SEM lances -> 200', async () => {
    const id = await leilaoAberto(false);
    await cancelar(id, vendedor.token).expect(200);
    expect(await statusDoBanco(id)).toBe('CANCELED');
  });

  it('vendedor NAO cancela leilao aberto COM lances -> 403 e o leilao continua aberto', async () => {
    const id = await leilaoAberto(true);
    const res = await cancelar(id, vendedor.token).expect(403);
    expect(res.body.mensagem).toMatch(/ja recebeu 1 lance/);
    expect(await statusDoBanco(id)).toBe('OPEN');
    // a tentativa recusada fica na auditoria
    const registro = await prisma.auditLog.findFirst({ where: { acao: 'LEILAO_MUDANCA_STATUS_REJEITADA', entidadeId: id } });
    expect(registro).not.toBeNull();
  });

  it('ADMIN cancela leilao aberto COM lances (com motivo) -> 200; os lances continuam guardados', async () => {
    const id = await leilaoAberto(true);
    await cancelar(id, admin.token, 'Suspeita de fraude').expect(200);
    expect(await statusDoBanco(id)).toBe('CANCELED');

    const historico = await prisma.auctionStatusHistory.findFirst({ where: { leilaoId: id, statusNovo: 'CANCELED' } });
    expect(historico?.motivo).toBe('Suspeita de fraude');
    expect(historico?.alteradoPorId).toBe(admin.id);
    expect(await prisma.bid.count({ where: { item: { leilaoId: id } } })).toBe(1); // imutavel
  });

  it('cancelar exige motivo (400), e outro vendedor continua sem acesso (403)', async () => {
    const id = await leilaoAberto(false);
    await request(app.getHttpServer())
      .patch(`/api/auctions/${id}/status`)
      .set('X-API-KEY', chave)
      .set('Authorization', `Bearer ${vendedor.token}`)
      .send({ status: 'CANCELED' })
      .expect(400);
    await cancelar(id, outroVendedor.token).expect(403);
    expect(await statusDoBanco(id)).toBe('OPEN');
  });

  it('ao cancelar, os itens ficam indisponiveis (UNSOLD), nunca "disponiveis"', async () => {
    const id = await leilaoAberto(false);
    await cancelar(id, admin.token).expect(200);
    const itens = await prisma.auctionItem.findMany({ where: { leilaoId: id } });
    expect(itens.length).toBe(1);
    expect(itens.every((i) => i.status === 'UNSOLD')).toBe(true);
  });

  describe('quem enxerga o leilao cancelado', () => {
    let idCancelado: string;
    const listar = (token?: string, query = '') => {
      const req = request(app.getHttpServer()).get(`/api/auctions?limite=100${query}`).set('X-API-KEY', chave);
      return token ? req.set('Authorization', `Bearer ${token}`) : req;
    };
    const idsDaLista = async (token?: string, query = '') =>
      ((await listar(token, query).expect(200)).body.dados as { id: string }[]).map((l) => l.id);

    beforeAll(async () => {
      idCancelado = await leilaoAberto(false);
      await cancelar(idCancelado, vendedor.token).expect(200);
    });

    it('visitante (sem login) NAO ve, nem filtrando por status=CANCELED', async () => {
      expect(await idsDaLista()).not.toContain(idCancelado);
      expect(await idsDaLista(undefined, '&status=CANCELED')).not.toContain(idCancelado);
    });

    it('comprador NAO ve na lista de leiloes nem na de itens', async () => {
      expect(await idsDaLista(licitanteToken)).not.toContain(idCancelado);
      const itens = await request(app.getHttpServer())
        .get(`/api/auction-items?leilaoId=${idCancelado}`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${licitanteToken}`)
        .expect(200);
      expect(itens.body.dados).toHaveLength(0);
    });

    it('outro vendedor NAO ve o cancelado do colega', async () => {
      expect(await idsDaLista(outroVendedor.token)).not.toContain(idCancelado);
    });

    it('o vendedor dono VE, com status CANCELED', async () => {
      const dados = (await listar(vendedor.token).expect(200)).body.dados as { id: string; status: string }[];
      expect(dados.find((l) => l.id === idCancelado)?.status).toBe('CANCELED');
      const itens = await request(app.getHttpServer())
        .get(`/api/auction-items?leilaoId=${idCancelado}`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${vendedor.token}`)
        .expect(200);
      expect(itens.body.dados).toHaveLength(1);
    });

    it('o ADMIN VE', async () => {
      expect(await idsDaLista(admin.token)).toContain(idCancelado);
    });

    it('token invalido/expirado nao quebra a lista: vira visitante', async () => {
      expect(await idsDaLista('token-invalido')).not.toContain(idCancelado);
    });

    it('o resumo por status nao conta cancelados para o comprador, mas conta para o ADMIN', async () => {
      const resumo = (token: string) =>
        request(app.getHttpServer()).get('/api/auctions/resumo').set('X-API-KEY', chave).set('Authorization', `Bearer ${token}`);
      expect((await resumo(licitanteToken).expect(200)).body.CANCELED).toBe(0);
      expect((await resumo(admin.token).expect(200)).body.CANCELED).toBeGreaterThan(0);
    });
  });

  describe('reativar leilao cancelado (so o ADMIN)', () => {
    const reativar = (leilaoId: string, token: string, motivo?: string) =>
      request(app.getHttpServer())
        .patch(`/api/auctions/${leilaoId}/reativar`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${token}`)
        .send(motivo === undefined ? {} : { motivo });

    it('leilao aberto cancelado por engano volta para OPEN, com itens disponiveis, mesmo prazo e lances guardados', async () => {
      const id = await leilaoAberto(true);
      const antes = await prisma.auction.findUniqueOrThrow({ where: { id } });
      await cancelar(id, admin.token).expect(200);

      const res = await reativar(id, admin.token, 'Foi engano').expect(200);
      expect(res.body.status).toBe('OPEN');
      const depois = await prisma.auction.findUniqueOrThrow({ where: { id } });
      expect(depois.dataFim.getTime()).toBe(antes.dataFim.getTime()); // prazo ainda valido: nao muda
      const itens = await prisma.auctionItem.findMany({ where: { leilaoId: id } });
      expect(itens.every((i) => i.status === 'AVAILABLE')).toBe(true);
      expect(await prisma.bid.count({ where: { item: { leilaoId: id } } })).toBe(1);

      const historico = await prisma.auctionStatusHistory.findFirst({ where: { leilaoId: id, statusAnterior: 'CANCELED' } });
      expect(historico?.statusNovo).toBe('OPEN');
      expect(historico?.motivo).toContain('Foi engano');
      expect(historico?.alteradoPorId).toBe(admin.id);
      expect(await prisma.auditLog.findFirst({ where: { acao: 'LEILAO_REATIVADO', entidadeId: id } })).not.toBeNull();
    });

    it('prazo ja vencido: ao reativar ganha mais 48 horas', async () => {
      const id = await leilaoAberto(false, new Date(Date.now() - 60_000));
      await cancelar(id, admin.token).expect(200);

      await reativar(id, admin.token, 'Prazo perdido no engano').expect(200);
      const depois = await prisma.auction.findUniqueOrThrow({ where: { id } });
      expect(depois.status).toBe('OPEN');
      const restanteHoras = (depois.dataFim.getTime() - Date.now()) / 3_600_000;
      expect(restanteHoras).toBeGreaterThan(47.9);
      expect(restanteHoras).toBeLessThanOrEqual(48);
    });

    it('cancelado enquanto rascunho volta como rascunho (nao abre sozinho)', async () => {
      const id = await leilaoAberto(false, undefined, 'DRAFT');
      await cancelar(id, admin.token).expect(200);
      await reativar(id, admin.token, 'Engano').expect(200);
      expect(await statusDoBanco(id)).toBe('DRAFT');
    });

    it('o vendedor dono NAO reativa (403); sem motivo -> 400; leilao nao cancelado -> 409', async () => {
      const id = await leilaoAberto(false);
      await cancelar(id, vendedor.token).expect(200);
      await reativar(id, vendedor.token, 'Quero de volta').expect(403);
      await reativar(id, admin.token).expect(400);
      expect(await statusDoBanco(id)).toBe('CANCELED');

      const aberto = await leilaoAberto(false);
      await reativar(aberto, admin.token, 'Nao esta cancelado').expect(409);
    });

    it('depois de reativado o leilao volta a aparecer para o comprador', async () => {
      const id = await leilaoAberto(false);
      await cancelar(id, admin.token).expect(200);
      await reativar(id, admin.token, 'Engano').expect(200);
      const lista = await request(app.getHttpServer())
        .get('/api/auctions?limite=100')
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${licitanteToken}`)
        .expect(200);
      expect((lista.body.dados as { id: string }[]).map((l) => l.id)).toContain(id);
    });
  });
});
