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

// Desativar quem esta disputando leilao: trava + (se forcado) o fechamento pula o lance dele
describe('Desativacao de usuario em disputa (e2e)', () => {
  let app: INestApplication<App>;
  let chave: string;
  let prisma: PrismaService;
  let categoriaId: string;
  let tokenAdmin: string;
  let vendedor: { id: string; token: string };

  const SUFIXO = Date.now();

  const api = (metodo: 'get' | 'patch', rota: string, token: string) =>
    request(app.getHttpServer())[metodo](`/api${rota}`).set('X-API-KEY', chave).set('Authorization', `Bearer ${token}`);

  async function criarUsuario(quem: string, papel: 'BIDDER' | 'SELLER' | 'ADMIN') {
    const usuario = await prisma.user.create({
      data: { nome: `Desativ ${quem}`, email: `desativ.${quem}.${SUFIXO}@teste.com`, senha: 'x', papel, ...PERFIL_COMPLETO },
    });
    const sessao = await prisma.session.create({ data: { usuarioId: usuario.id, refreshHash: 'teste', expiraEm: new Date(Date.now() + 86_400_000) } });
    return { id: usuario.id, token: app.get(JwtService, { strict: false }).sign({ sub: usuario.id, papel, sid: sessao.id }) };
  }

  // Leilao ABERTO com um item que ja recebeu os lances informados (valor -> quem), gravados direto no banco
  async function leilaoComLances(lances: { valor: number; quem: string }[]) {
    const leilao = await prisma.auction.create({
      data: { titulo: 'Leilao desativacao', status: 'OPEN', dataInicio: new Date(Date.now() - 3_600_000), dataFim: new Date(Date.now() + 3_600_000), vendedorId: vendedor.id },
    });
    const maior = Math.max(...lances.map((l) => l.valor));
    const item = await prisma.auctionItem.create({
      data: { titulo: 'Peca desativacao', precoInicial: 50, incrementoMinimo: 10, cep: '01310100', leilaoId: leilao.id, categoriaId, lanceAtual: maior },
    });
    let anterior: number | null = null;
    for (const l of [...lances].sort((a, b) => a.valor - b.valor)) {
      await prisma.bid.create({ data: { valor: l.valor, lanceAnterior: anterior, itemId: item.id, licitanteId: l.quem } });
      anterior = l.valor;
    }
    return { leilaoId: leilao.id, itemId: item.id };
  }

  const fechar = (leilaoId: string) => api('patch', `/auctions/${leilaoId}/status`, vendedor.token).send({ status: 'CLOSED' }).expect(200);
  const itemDoBanco = (id: string) => prisma.auctionItem.findUniqueOrThrow({ where: { id } });
  const desativarNoBanco = (id: string) => prisma.user.update({ where: { id }, data: { ativo: false } });

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
    categoriaId = (await prisma.category.create({ data: { nome: `Categoria Desativ ${SUFIXO}` } })).id;
    tokenAdmin = (await criarUsuario('admin', 'ADMIN')).token;
    vendedor = await criarUsuario('vendedor', 'SELLER');
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  describe('trava ao desativar', () => {
    it('quem esta disputando peca em leilao ABERTO nao pode ser desativado -> 409', async () => {
      const licitante = await criarUsuario('disputando', 'BIDDER');
      await leilaoComLances([{ valor: 60, quem: licitante.id }]);

      const res = await api('patch', `/users/${licitante.id}/desativar`, tokenAdmin).expect(409);
      expect(res.body.mensagem).toMatch(/disputando 1 peca/);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: licitante.id } })).ativo).toBe(true);
    });

    it('sem disputa em andamento, desativa normalmente (nunca deu lance, ou o leilao ja fechou)', async () => {
      const semLance = await criarUsuario('semlance', 'BIDDER');
      await api('patch', `/users/${semLance.id}/desativar`, tokenAdmin).expect(200);

      const aposFechar = await criarUsuario('aposfechar', 'BIDDER');
      const { leilaoId } = await leilaoComLances([{ valor: 60, quem: aposFechar.id }]);
      await fechar(leilaoId);
      await api('patch', `/users/${aposFechar.id}/desativar`, tokenAdmin).expect(200);
    });

    it('vendedor com leilao ABERTO ou AGENDADO nao pode ser desativado -> 409; sem leiloes em andamento, pode', async () => {
      const dono = await criarUsuario('donoleilao', 'SELLER');
      const leilao = await prisma.auction.create({
        data: { titulo: 'Leilao do dono', status: 'OPEN', dataInicio: new Date(Date.now() - 3_600_000), dataFim: new Date(Date.now() + 3_600_000), vendedorId: dono.id },
      });
      const res = await api('patch', `/users/${dono.id}/desativar`, tokenAdmin).expect(409);
      expect(res.body.mensagem).toMatch(/dono de 1 leilao/);

      // agendado tambem conta
      await prisma.auction.update({ where: { id: leilao.id }, data: { status: 'SCHEDULED' } });
      await api('patch', `/users/${dono.id}/desativar`, tokenAdmin).expect(409);

      // encerrado/cancelado: libera
      await prisma.auction.update({ where: { id: leilao.id }, data: { status: 'CANCELED' } });
      await api('patch', `/users/${dono.id}/desativar`, tokenAdmin).expect(200);
    });

    it('forcar=true tambem libera o vendedor com leilao em andamento (o leilao segue e fecha pelo horario)', async () => {
      const dono = await criarUsuario('donoforcado', 'SELLER');
      const leilao = await prisma.auction.create({
        data: { titulo: 'Leilao forcado', status: 'OPEN', dataInicio: new Date(Date.now() - 3_600_000), dataFim: new Date(Date.now() + 3_600_000), vendedorId: dono.id },
      });
      await api('patch', `/users/${dono.id}/desativar?forcar=true`, tokenAdmin).expect(200);
      expect((await prisma.auction.findUniqueOrThrow({ where: { id: leilao.id } })).status).toBe('OPEN');
    });

    it('forcar=true (emergencia, ex.: fraude) desativa mesmo em disputa e fica na auditoria', async () => {
      const fraudador = await criarUsuario('fraudador', 'BIDDER');
      await leilaoComLances([{ valor: 60, quem: fraudador.id }]);

      await api('patch', `/users/${fraudador.id}/desativar?forcar=true`, tokenAdmin).expect(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: fraudador.id } })).ativo).toBe(false);
      const registro = await prisma.auditLog.findFirst({ where: { acao: 'USUARIO_DESATIVADO_FORCADO', entidadeId: fraudador.id } });
      expect(registro).not.toBeNull();
    });
  });

  describe('fechamento pula o lance de conta desativada', () => {
    it('o lider foi desativado: vence o SEGUNDO maior lance, pelo valor dele', async () => {
      const a = await criarUsuario('a2', 'BIDDER');
      const b = await criarUsuario('b2', 'BIDDER');
      const { leilaoId, itemId } = await leilaoComLances([
        { valor: 100, quem: a.id },
        { valor: 120, quem: b.id },
      ]);
      await desativarNoBanco(b.id); // o lider (120) foi desativado

      await fechar(leilaoId);

      const item = await itemDoBanco(itemId);
      expect(item.status).toBe('SOLD');
      expect(item.vencedorId).toBe(a.id);
      expect(item.lanceAtual?.toString()).toBe('100');
      const registro = await prisma.auditLog.findFirst({ where: { acao: 'ITEM_VENCEDOR_SUBSTITUIDO', entidadeId: itemId } });
      expect(registro?.motivo).toMatch(/desativado/);

      // transparencia: o detalhe da peca explica por que o valor final e menor que o lance mais alto do historico
      const detalhe = await request(app.getHttpServer()).get(`/api/auction-items/${itemId}`).set('X-API-KEY', chave).expect(200);
      expect(detalhe.body.avisoResultado).toMatch(/desconsiderado.*conta.*desativada/);
      expect(detalhe.body.avisoResultado).toContain('120,00');
    });

    it('pula QUANTOS desativados forem necessarios (o terceiro maior vence)', async () => {
      const a = await criarUsuario('a3', 'BIDDER');
      const b = await criarUsuario('b3', 'BIDDER');
      const c = await criarUsuario('c3', 'BIDDER');
      const { leilaoId, itemId } = await leilaoComLances([
        { valor: 100, quem: a.id },
        { valor: 110, quem: b.id },
        { valor: 130, quem: c.id },
      ]);
      await desativarNoBanco(c.id);
      await desativarNoBanco(b.id);

      await fechar(leilaoId);
      const item = await itemDoBanco(itemId);
      expect(item.vencedorId).toBe(a.id);
      expect(item.lanceAtual?.toString()).toBe('100');
    });

    it('todos os licitantes desativados: a peca fica NAO VENDIDA, sem vencedor', async () => {
      const a = await criarUsuario('a4', 'BIDDER');
      const b = await criarUsuario('b4', 'BIDDER');
      const { leilaoId, itemId } = await leilaoComLances([
        { valor: 100, quem: a.id },
        { valor: 120, quem: b.id },
      ]);
      await desativarNoBanco(a.id);
      await desativarNoBanco(b.id);

      await fechar(leilaoId);
      const item = await itemDoBanco(itemId);
      expect(item.status).toBe('UNSOLD');
      expect(item.vencedorId).toBeNull();
    });

    it('sem desativados, o maior lance vence como sempre (nenhuma substituicao)', async () => {
      const a = await criarUsuario('a5', 'BIDDER');
      const b = await criarUsuario('b5', 'BIDDER');
      const { leilaoId, itemId } = await leilaoComLances([
        { valor: 100, quem: a.id },
        { valor: 120, quem: b.id },
      ]);
      await fechar(leilaoId);

      const item = await itemDoBanco(itemId);
      expect(item.vencedorId).toBe(b.id);
      expect(item.lanceAtual?.toString()).toBe('120');
      expect(await prisma.auditLog.count({ where: { acao: 'ITEM_VENCEDOR_SUBSTITUIDO', entidadeId: itemId } })).toBe(0);
      const detalhe = await request(app.getHttpServer()).get(`/api/auction-items/${itemId}`).set('X-API-KEY', chave).expect(200);
      expect(detalhe.body.avisoResultado).toBeNull(); // sem lance desconsiderado, sem aviso
    });
  });
});
