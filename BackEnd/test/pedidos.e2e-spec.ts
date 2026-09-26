import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configurarAplicacao } from './../src/configurar-aplicacao';
import { PrismaService } from './../src/prisma/prisma.service';
import { PERFIL_COMPLETO } from './perfil-teste';

// Pos-leilao: so o VENCEDOR mexe no pedido, em ordem (pagar -> retirada/entrega). Consultar (GET) nao grava nada
describe('Pedidos (e2e)', () => {
  let app: INestApplication<App>;
  let chave: string;
  let prisma: PrismaService;
  let categoriaId: string;
  let leilaoId: string;
  let itemVendidoId: string;
  let itemAbertoId: string;
  let vendedor: { id: string; token: string };
  let vencedor: { id: string; token: string };
  let outro: { id: string; token: string };
  let admin: { id: string; token: string };

  const SUFIXO = Date.now();

  async function criarUsuario(quem: string, papel: 'BIDDER' | 'SELLER' | 'ADMIN') {
    const usuario = await prisma.user.create({
      data: { nome: `Pedido ${quem}`, email: `pedido.${quem}.${SUFIXO}@teste.com`, senha: 'x', papel, ...PERFIL_COMPLETO },
    });
    const sessao = await prisma.session.create({ data: { usuarioId: usuario.id, refreshHash: 'teste', expiraEm: new Date(Date.now() + 86_400_000) } });
    return { id: usuario.id, token: app.get(JwtService, { strict: false }).sign({ sub: usuario.id, papel, sid: sessao.id }) };
  }

  const api = (metodo: 'get' | 'post', caminho: string, token?: string) => {
    const req = request(app.getHttpServer())[metodo](`/api/auction-items/${caminho}`).set('X-API-KEY', chave);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  const pedidosNoBanco = (itemId: string) => prisma.pedido.count({ where: { itemId } });

  beforeAll(async () => {
    const modulo: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarAplicacao(app);
    await app.init();
    chave = app.get(ConfigService).getOrThrow<string>('API_KEY');
    prisma = app.get(PrismaService);

    categoriaId = (await prisma.category.create({ data: { nome: `Categoria Pedido ${SUFIXO}` } })).id;
    vendedor = await criarUsuario('vendedor', 'SELLER');
    vencedor = await criarUsuario('vencedor', 'BIDDER');
    outro = await criarUsuario('outro', 'BIDDER');
    admin = await criarUsuario('admin', 'ADMIN');

    // Leilao ja encerrado, com um item VENDIDO ao "vencedor" e outro que ainda nao foi vendido
    leilaoId = (
      await prisma.auction.create({
        data: { titulo: 'Leilao pedido', status: 'CLOSED', dataInicio: new Date(Date.now() - 7_200_000), dataFim: new Date(Date.now() - 3_600_000), vendedorId: vendedor.id },
      })
    ).id;
    itemVendidoId = (
      await prisma.auctionItem.create({
        data: { titulo: 'Peca vendida', precoInicial: 50, incrementoMinimo: 10, cep: '01310100', cidade: 'Sao Paulo', uf: 'SP', leilaoId, categoriaId, status: 'SOLD', lanceAtual: 120, vencedorId: vencedor.id },
      })
    ).id;
    itemAbertoId = (
      await prisma.auctionItem.create({
        data: { titulo: 'Peca sem venda', precoInicial: 50, incrementoMinimo: 10, cep: '01310100', leilaoId, categoriaId },
      })
    ).id;
  }, 30_000);

  afterAll(async () => {
    // Usuarios criados direto no banco (sem login/auditoria): da para limpar tudo
    await prisma.pedido.deleteMany({ where: { itemId: { in: [itemVendidoId, itemAbertoId] } } });
    await prisma.auctionItem.deleteMany({ where: { leilaoId } });
    await prisma.auction.deleteMany({ where: { id: leilaoId } });
    const ids = [vendedor.id, vencedor.id, outro.id, admin.id];
    await prisma.session.deleteMany({ where: { usuarioId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
    await prisma.category.deleteMany({ where: { id: categoriaId } }).catch(() => undefined);
    await app.close();
  });

  describe('quem pode ver o pedido', () => {
    it('sem login -> 401', async () => {
      await api('get', `${itemVendidoId}/pedido`).expect(401);
    });

    it('item que ainda nao foi vendido -> 409', async () => {
      await api('get', `${itemAbertoId}/pedido`, vencedor.token).expect(409);
    });

    it('item inexistente -> 404', async () => {
      await api('get', '00000000-0000-0000-0000-000000000000/pedido', vencedor.token).expect(404);
    });

    it('quem NAO e o vencedor (outro comprador, o vendedor, o ADMIN) -> 403, e nada e gravado', async () => {
      for (const quem of [outro, vendedor, admin]) {
        await api('get', `${itemVendidoId}/pedido`, quem.token).expect(403);
      }
      expect(await pedidosNoBanco(itemVendidoId)).toBe(0);
    });

    it('nao vencedor tambem nao paga nem escolhe entrega (403)', async () => {
      await api('post', `${itemVendidoId}/pedido/pagamento`, outro.token).send({ formaPagamento: 'PIX' }).expect(403);
      await api('post', `${itemVendidoId}/pedido/entrega`, outro.token).send({ tipoEntrega: 'RETIRADA' }).expect(403);
      expect(await pedidosNoBanco(itemVendidoId)).toBe(0);
    });
  });

  describe('fluxo do vencedor: consultar, pagar, escolher retirada/entrega', () => {
    it('GET so CONSULTA: mostra o que sera cobrado, sem id, e NAO cria o pedido', async () => {
      const res = await api('get', `${itemVendidoId}/pedido`, vencedor.token).expect(200);
      expect(res.body).toMatchObject({ id: null, itemId: itemVendidoId, valor: '120.00', status: 'AGUARDANDO_PAGAMENTO', tipoEntrega: null, codigoRetirada: null });
      expect(res.body.localRetirada).toContain('Sao Paulo/SP');

      await api('get', `${itemVendidoId}/pedido`, vencedor.token).expect(200); // repetir tambem nao grava
      expect(await pedidosNoBanco(itemVendidoId)).toBe(0);
    });

    it('escolher retirada antes de pagar -> 409', async () => {
      await api('post', `${itemVendidoId}/pedido/entrega`, vencedor.token).send({ tipoEntrega: 'RETIRADA' }).expect(409);
      expect(await pedidosNoBanco(itemVendidoId)).toBe(0);
    });

    it('forma de pagamento invalida -> 400', async () => {
      await api('post', `${itemVendidoId}/pedido/pagamento`, vencedor.token).send({ formaPagamento: 'DINHEIRO' }).expect(400);
      await api('post', `${itemVendidoId}/pedido/pagamento`, vencedor.token).send({}).expect(400);
    });

    it('pagar cria o pedido (PAGO) e pagar de novo -> 409', async () => {
      const res = await api('post', `${itemVendidoId}/pedido/pagamento`, vencedor.token).send({ formaPagamento: 'PIX' }).expect(200);
      expect(res.body).toMatchObject({ status: 'PAGO', formaPagamento: 'PIX' });
      expect(res.body.id).toEqual(expect.any(String));
      expect(await pedidosNoBanco(itemVendidoId)).toBe(1);

      await api('post', `${itemVendidoId}/pedido/pagamento`, vencedor.token).send({ formaPagamento: 'CARTAO' }).expect(409);
      expect(await pedidosNoBanco(itemVendidoId)).toBe(1);
    });

    it('depois de criado, o GET devolve o pedido com id', async () => {
      const res = await api('get', `${itemVendidoId}/pedido`, vencedor.token).expect(200);
      expect(res.body.id).toEqual(expect.any(String));
      expect(res.body.status).toBe('PAGO');
    });

    it('entrega sem endereco -> 400; retirada gera o codigo; escolher de novo -> 409', async () => {
      await api('post', `${itemVendidoId}/pedido/entrega`, vencedor.token).send({ tipoEntrega: 'ENTREGA' }).expect(400);

      const res = await api('post', `${itemVendidoId}/pedido/entrega`, vencedor.token).send({ tipoEntrega: 'RETIRADA' }).expect(200);
      expect(res.body.status).toBe('FINALIZADO');
      expect(res.body.codigoRetirada).toMatch(/^[0-9A-F]{8}$/);

      await api('post', `${itemVendidoId}/pedido/entrega`, vencedor.token).send({ tipoEntrega: 'ENTREGA', enderecoEntrega: 'Rua A, 1' }).expect(409);
    });
  });
});
