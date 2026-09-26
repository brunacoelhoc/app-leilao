import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { CepService } from './../src/cep/cep.service';
import { configurarAplicacao } from './../src/configurar-aplicacao';
import { PrismaService } from './../src/prisma/prisma.service';
import { cepFalso } from './cep-falso';
import { PERFIL_COMPLETO } from './perfil-teste';

// Achados do QA (passo 3, validação de entrada). Antes destes casos a API aceitava título em branco e respondia 500
// para caractere nulo, valor acima do banco e página gigante
describe('Validação de entrada (e2e)', () => {
  let app: INestApplication<App>;
  let chave: string;
  let prisma: PrismaService;
  let categoriaId: string;
  let vendedor: { id: string; token: string };
  let admin: { id: string; token: string };
  let comprador: { id: string; token: string };
  const criados = { leiloes: [] as string[], itens: [] as string[] };

  const SUFIXO = Date.now();
  const ID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';
  const inicio = () => new Date(Date.now() + 3_600_000).toISOString();
  const fim = () => new Date(Date.now() + 7_200_000).toISOString();

  async function criarUsuario(quem: string, papel: 'BIDDER' | 'SELLER' | 'ADMIN') {
    const usuario = await prisma.user.create({
      data: { nome: `Validacao ${quem}`, email: `validacao.${quem}.${SUFIXO}@teste.com`, senha: 'x', papel, ...PERFIL_COMPLETO },
    });
    const sessao = await prisma.session.create({ data: { usuarioId: usuario.id, refreshHash: 'teste', expiraEm: new Date(Date.now() + 86_400_000) } });
    return { id: usuario.id, token: app.get(JwtService, { strict: false }).sign({ sub: usuario.id, papel, sid: sessao.id }) };
  }

  const api = (metodo: 'get' | 'post' | 'patch', caminho: string, token?: string) => {
    const req = request(app.getHttpServer())[metodo](`/api${caminho}`).set('X-API-KEY', chave);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

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

    categoriaId = (await prisma.category.create({ data: { nome: `Categoria Validacao ${SUFIXO}` } })).id;
    vendedor = await criarUsuario('vendedor', 'SELLER');
    admin = await criarUsuario('admin', 'ADMIN');
    comprador = await criarUsuario('comprador', 'BIDDER');
  }, 30_000);

  afterAll(async () => {
    // Leilão em rascunho (sem histórico) pode ser apagado; os itens vão junto
    await prisma.auctionItem.deleteMany({ where: { leilaoId: { in: criados.leiloes } } });
    await prisma.auction.deleteMany({ where: { id: { in: criados.leiloes } } });
    const ids = [vendedor.id, admin.id, comprador.id];
    await prisma.session.deleteMany({ where: { usuarioId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
    await prisma.category.deleteMany({ where: { id: categoriaId } }).catch(() => undefined);
    await app.close();
  });

  const criarLeilao = (titulo: unknown) =>
    api('post', '/auctions', vendedor.token).send({ titulo, dataInicio: inicio(), dataFim: fim() });

  describe('título e nome só com espaços', () => {
    it('leilão com título "   " -> 400 (antes virava um título em branco)', async () => {
      const res = await criarLeilao('   ').expect(400);
      expect(res.body.mensagem).toContain('título e obrigatório'); // aparado, vira vazio
    });

    it('título com espaços nas pontas é aparado', async () => {
      const res = await criarLeilao('   Arte Sacra   ').expect(201);
      criados.leiloes.push(res.body.id as string);
      expect(res.body.titulo).toBe('Arte Sacra');
    });

    it('categoria, perfil e cadastro com nome só de espaços -> 400', async () => {
      await api('post', '/categories', admin.token).send({ nome: '   ' }).expect(400);
      await api('patch', '/users/me', comprador.token).send({ nome: '     ' }).expect(400);
      await api('post', '/auth/registrar').send({ nome: '   ', email: `branco.${SUFIXO}@teste.com`, senha: 'Abc12345!', aceiteTermos: true }).expect(400);
    });
  });

  describe('caractere nulo (\\u0000) nunca chega ao banco', () => {
    it('no corpo: leilão, chat e categoria -> 400 (antes era 500)', async () => {
      await criarLeilao('ab\u0000cd').expect(400);
      await api('post', `/auctions/${ID_INEXISTENTE}/chat`, comprador.token).send({ texto: 'a\u0000b' }).expect(400);
      await api('post', '/categories', admin.token).send({ nome: 'ca\u0000t' }).expect(400);
    });

    it('na query e no parâmetro de rota -> 400', async () => {
      await api('get', '/auctions?busca=a%00b').expect(400);
      await api('get', '/cep/0131%000100').expect(400);
    });

    it('texto normal, com acento e emoji, continua passando', async () => {
      const res = await criarLeilao('Leilão de Arte 🖼️ Ação').expect(201);
      criados.leiloes.push(res.body.id as string);
    });
  });

  describe('valores acima do que o banco guarda (9.999.999.999,99) -> 400, não 500', () => {
    let leilaoId: string;
    const item = (extra: object) => ({
      titulo: 'Peça de teste', precoInicial: 100, incrementoMinimo: 10, cep: '01310100', leilaoId, categoriaId, ...extra,
    });

    beforeAll(async () => {
      const res = await criarLeilao('Leilão de valores').expect(201);
      leilaoId = res.body.id as string;
      criados.leiloes.push(leilaoId);
    });

    it.each([
      ['precoInicial 10000000000', { precoInicial: 10000000000 }],
      ['precoInicial 1e21', { precoInicial: 1e21 }],
      ['incrementoMinimo 10000000000', { incrementoMinimo: 10000000000 }],
    ])('item com %s -> 400', async (_nome, extra) => {
      const res = await api('post', '/auction-items', vendedor.token).send(item(extra)).expect(400);
      expect(res.body.mensagem[0]).toContain('no máximo 9.999.999.999,99');
    });

    it('o teto exato (9.999.999.999,99) e o mínimo (0,01) ainda são aceitos', async () => {
      const teto = await api('post', '/auction-items', vendedor.token).send(item({ precoInicial: 9999999999.99 })).expect(201);
      const minimo = await api('post', '/auction-items', vendedor.token).send(item({ precoInicial: 0.01, incrementoMinimo: 0.01 })).expect(201);
      criados.itens.push(teto.body.id as string, minimo.body.id as string);
      expect(teto.body.precoInicial).toBe('9999999999.99');
    });

    it('lance acima do teto -> 400 (o DTO agora tem limite); no teto passa da validação (404 = item inexistente)', async () => {
      await api('post', `/auction-items/${ID_INEXISTENTE}/bids`, comprador.token).send({ valor: 10000000000 }).expect(400);
      await api('post', `/auction-items/${ID_INEXISTENTE}/bids`, comprador.token).send({ valor: 1e21 }).expect(400);
      await api('post', `/auction-items/${ID_INEXISTENTE}/bids`, comprador.token).send({ valor: 9999999999.99 }).expect(404);
    });
  });

  describe('paginação gigante', () => {
    it('pagina=1e30 -> 400 (antes era 500)', async () => {
      const res = await api('get', '/auctions?pagina=1e30').expect(400);
      expect(res.body.mensagem).toContain('página deve ser no máximo 100000');
    });

    it('pagina=100000 -> 200 vazio; 100001 -> 400', async () => {
      const res = await api('get', '/auctions?pagina=100000').expect(200);
      expect(res.body.dados).toEqual([]);
      await api('get', '/auctions?pagina=100001').expect(400);
    });
  });
});
