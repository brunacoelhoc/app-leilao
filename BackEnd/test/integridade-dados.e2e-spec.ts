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

// QA passo 5 (banco de dados): as regras que o PRÓPRIO BANCO impõe (a última defesa, para qualquer caminho que
// escape da API) e três defeitos achados: TRUNCATE apagava as tabelas "imutáveis", e-mail com maiúscula deixava a
// conta sem login, e desativar não derrubava as sessões
describe('Integridade dos dados (e2e)', () => {
  let app: INestApplication<App>;
  let chave: string;
  let prisma: PrismaService;
  let categoriaId: string;
  let vendedor: { id: string };
  let licitante: { id: string };
  let itemId: string;
  let itemDisponivelId: string;
  let leilaoId: string;
  let lanceId: string;

  const SUFIXO = Date.now();
  const SENHA = 'Abc12345!';

  async function criarUsuario(quem: string, papel: 'BIDDER' | 'SELLER' | 'ADMIN', email = `integridade.${quem}.${SUFIXO}@teste.com`) {
    const usuario = await prisma.user.create({ data: { nome: `Integridade ${quem}`, email, senha: 'x', papel, ...PERFIL_COMPLETO } });
    const sessao = await prisma.session.create({ data: { usuarioId: usuario.id, refreshHash: 'teste', expiraEm: new Date(Date.now() + 86_400_000) } });
    return { id: usuario.id, sessaoId: sessao.id, token: app.get(JwtService, { strict: false }).sign({ sub: usuario.id, papel, sid: sessao.id }) };
  }

  const api = (metodo: 'get' | 'post' | 'patch', caminho: string, token?: string) => {
    const req = request(app.getHttpServer())[metodo](`/api${caminho}`).set('X-API-KEY', chave);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  // Roda um SQL que o banco DEVE recusar. Se ele passar, a transação é desfeita (nada fica gravado) e o teste falha
  const bancoRecusa = (sql: string, mensagem: RegExp) =>
    expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(sql);
        throw new Error('O BANCO ACEITOU O QUE DEVIA RECUSAR');
      }),
    ).rejects.toThrow(mensagem);

  beforeAll(async () => {
    const modulo: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarAplicacao(app);
    await app.init();
    chave = app.get(ConfigService).getOrThrow<string>('API_KEY');
    prisma = app.get(PrismaService);

    categoriaId = (await prisma.category.create({ data: { nome: `Categoria Integridade ${SUFIXO}` } })).id;
    vendedor = await criarUsuario('vendedor', 'SELLER');
    licitante = await criarUsuario('licitante', 'BIDDER');
    leilaoId = (
      await prisma.auction.create({
        data: { titulo: 'Leilao integridade', status: 'OPEN', dataInicio: new Date(Date.now() - 3_600_000), dataFim: new Date(Date.now() + 3_600_000), vendedorId: vendedor.id },
      })
    ).id;
    itemId = (await prisma.auctionItem.create({ data: { titulo: 'Peca com lance', precoInicial: 50, incrementoMinimo: 10, cep: '01310100', leilaoId, categoriaId, lanceAtual: 60 } })).id;
    itemDisponivelId = (await prisma.auctionItem.create({ data: { titulo: 'Peca disponivel', precoInicial: 50, incrementoMinimo: 10, cep: '01310100', leilaoId, categoriaId } })).id;
    lanceId = (await prisma.bid.create({ data: { valor: 60, itemId, licitanteId: licitante.id } })).id;
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  describe('imutabilidade: lances, auditoria e histórico só entram, nunca mudam nem somem', () => {
    it('UPDATE e DELETE de lance -> recusado pelo banco', async () => {
      await bancoRecusa(`UPDATE "Bid" SET valor = valor + 1 WHERE id = '${lanceId}'`, /somente de insercao/);
      await bancoRecusa(`DELETE FROM "Bid" WHERE id = '${lanceId}'`, /somente de insercao/);
    });

    it('TRUNCATE nas três tabelas (antes era uma brecha: apagava tudo de uma vez) -> recusado', async () => {
      await bancoRecusa('TRUNCATE TABLE "Bid" CASCADE', /somente de insercao: TRUNCATE/);
      await bancoRecusa('TRUNCATE TABLE "AuditLog"', /somente de insercao: TRUNCATE/);
      await bancoRecusa('TRUNCATE TABLE "AuctionStatusHistory"', /somente de insercao: TRUNCATE/);
    });

    it('TRUNCATE em cascata a partir de outra tabela também é barrado (o lance está no caminho)', async () => {
      await bancoRecusa('TRUNCATE TABLE "User" CASCADE', /somente de insercao: TRUNCATE/);
      expect(await prisma.bid.count({ where: { id: lanceId } })).toBe(1);
    });
  });

  describe('regras de negócio que o banco também garante (CHECK)', () => {
    it.each([
      ['item vendido sem vencedor', `UPDATE "AuctionItem" SET status = 'SOLD', "vencedorId" = NULL WHERE id = '{item}'`, /vencedor_coerente/],
      ['vencedor num item não vendido', `UPDATE "AuctionItem" SET "vencedorId" = '{licitante}' WHERE id = '{item}'`, /vencedor_coerente/],
      ['preço inicial zero', `UPDATE "AuctionItem" SET "precoInicial" = 0 WHERE id = '{item}'`, /precoInicial_positivo/],
      ['incremento negativo', `UPDATE "AuctionItem" SET "incrementoMinimo" = -1 WHERE id = '{item}'`, /incrementoMinimo_positivo/],
      ['CEP com letras', `UPDATE "AuctionItem" SET cep = 'abc' WHERE id = '{item}'`, /cep_formato/],
      ['UF em minúscula', `UPDATE "AuctionItem" SET uf = 'sp' WHERE id = '{item}'`, /uf_formato/],
      ['preço acima de 9.999.999.999,99', `UPDATE "AuctionItem" SET "precoInicial" = 10000000000 WHERE id = '{item}'`, /overflow|22003/i],
      ['fim do leilão igual ao início', `UPDATE "Auction" SET "dataFim" = "dataInicio" WHERE id = '{leilao}'`, /periodo_valido/],
      ['prorrogações negativas', `UPDATE "Auction" SET prorrogacoes = -1 WHERE id = '{leilao}'`, /prorrogacoes_check/],
      ['lance de valor zero', `INSERT INTO "Bid"(id, valor, "itemId", "licitanteId") VALUES (gen_random_uuid(), 0, '{item}', '{licitante}')`, /Bid_valor_positivo/],
    ])('%s -> recusado', async (_nome, sql, mensagem) => {
      const pronto = sql.replaceAll('{item}', itemDisponivelId).replaceAll('{licitante}', licitante.id).replaceAll('{leilao}', leilaoId);
      await bancoRecusa(pronto, mensagem);
    });
  });

  describe('e-mail é único sem diferenciar maiúscula de minúscula', () => {
    const inserir = (email: string) =>
      `INSERT INTO "User"(id, nome, email, senha, "atualizadoEm") VALUES (gen_random_uuid(), 'Dup', '${email}', 'x', now())`;

    it('o banco recusa "ADMIN@x" quando "admin@x" já existe (antes o índice único aceitava)', async () => {
      const base = `caixa.${SUFIXO}@teste.com`;
      await prisma.user.create({ data: { nome: 'Caixa', email: base, senha: 'x' } });
      await bancoRecusa(inserir(base.toUpperCase()), /User_email_minusculo_key/);
      await bancoRecusa(inserir(base), /User_email_key/);
    });
  });

  describe('trocar o e-mail pelo perfil (antes gravava com maiúscula e o login nunca mais achava a conta)', () => {
    const email = `perfil.troca.${SUFIXO}@teste.com`;
    const novoEmail = `novo.email.${SUFIXO}@teste.com`;
    let token: string;

    beforeAll(async () => {
      await api('post', '/auth/registrar').send({ nome: 'Troca De Email', email, senha: SENHA, aceiteTermos: true }).expect(201);
      const login = await api('post', '/auth/login').send({ email, senha: SENHA }).expect(200);
      token = login.body.accessToken as string;
    }, 20_000);

    it('e-mail com maiúsculas e espaços é gravado normalizado, e o login com o e-mail novo funciona', async () => {
      const res = await api('patch', '/users/me', token)
        .send({ email: `  ${novoEmail.toUpperCase()}  `, senhaAtual: SENHA })
        .expect(200);
      expect(res.body.email).toBe(novoEmail);

      const login = await api('post', '/auth/login').send({ email: novoEmail, senha: SENHA });
      expect(login.status).toBe(200);
    });

    it('e-mail que só difere de outro pela caixa -> 409 (não vira uma conta duplicada)', async () => {
      const outro = await criarUsuario('emuso', 'BIDDER');
      const emailDoOutro = (await prisma.user.findUniqueOrThrow({ where: { id: outro.id } })).email;
      const res = await api('patch', '/users/me', token)
        .send({ email: emailDoOutro.toUpperCase(), senhaAtual: SENHA })
        .expect(409);
      expect(res.body.mensagem).toContain('já cadastrado');
    });
  });

  describe('desativar uma conta derruba as sessões dela na hora', () => {
    it('todas as sessões ficam revogadas e o token antigo deixa de valer', async () => {
      const admin = await criarUsuario('admin', 'ADMIN');
      const alvo = await criarUsuario('alvo', 'BIDDER');
      const segundaSessao = await prisma.session.create({ data: { usuarioId: alvo.id, refreshHash: 'outra', expiraEm: new Date(Date.now() + 86_400_000) } });
      await api('get', '/users/me', alvo.token).expect(200); // antes: o token funciona

      await api('patch', `/users/${alvo.id}/desativar`, admin.token).expect(200);

      const vivas = await prisma.session.count({ where: { usuarioId: alvo.id, revogadaEm: null } });
      expect(vivas).toBe(0);
      expect((await prisma.session.findUniqueOrThrow({ where: { id: segundaSessao.id } })).revogadaEm).not.toBeNull();
      await api('get', '/users/me', alvo.token).expect(401);
    });
  });
});
