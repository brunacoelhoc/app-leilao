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
  async function leilaoAberto(comLance: boolean) {
    const leilao = await prisma.auction.create({
      data: { titulo: 'Leilao cancelamento', status: 'OPEN', dataInicio: new Date(Date.now() - 3_600_000), dataFim: new Date(Date.now() + 3_600_000), vendedorId: vendedor.id },
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
    licitanteId = (await criarUsuario('licitante', 'BIDDER')).id;
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
});
