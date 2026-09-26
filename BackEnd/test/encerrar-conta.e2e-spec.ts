import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configurarAplicacao } from './../src/configurar-aplicacao';
import { CepService } from './../src/cep/cep.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { UsersService } from './../src/users/users.service';
import { cepFalso } from './cep-falso';
import { PERFIL_COMPLETO } from './perfil-teste';

// LGPD: a propria pessoa encerra a conta; dados pessoais anonimizados, historico imutavel preservado
describe('Encerrar a propria conta (e2e)', () => {
  let app: INestApplication<App>;
  let chave: string;
  let prisma: PrismaService;
  let categoriaId: string;
  let vendedorId: string;

  const SUFIXO = Date.now();
  const SENHA = 'Conta123!';

  const api = (metodo: 'get' | 'post', rota: string, token?: string) => {
    const req = request(app.getHttpServer())[metodo](`/api${rota}`).set('X-API-KEY', chave);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  async function criarUsuario(quem: string, papel: 'BIDDER' | 'SELLER' | 'ADMIN') {
    const usuario = await prisma.user.create({
      data: { nome: `Pessoa ${quem}`, email: `conta.${quem}.${SUFIXO}@teste.com`, senha: await bcrypt.hash(SENHA, 4), papel, ...PERFIL_COMPLETO },
    });
    const sessao = await prisma.session.create({ data: { usuarioId: usuario.id, refreshHash: 'teste', expiraEm: new Date(Date.now() + 86_400_000) } });
    return { id: usuario.id, email: usuario.email, token: app.get(JwtService, { strict: false }).sign({ sub: usuario.id, papel, sid: sessao.id }) };
  }

  // Item de um leilao do vendedor, com um lance da pessoa; o leilao pode estar ABERTO ou ja FECHADO (a pessoa venceu)
  async function itemComLance(licitanteId: string, fechado: boolean) {
    const leilao = await prisma.auction.create({
      data: {
        titulo: 'Leilao encerrar conta',
        status: fechado ? 'CLOSED' : 'OPEN',
        dataInicio: new Date(Date.now() - 7_200_000),
        dataFim: new Date(Date.now() + (fechado ? -3_600_000 : 3_600_000)),
        vendedorId,
      },
    });
    const item = await prisma.auctionItem.create({
      data: {
        titulo: 'Peca encerrar conta', precoInicial: 50, incrementoMinimo: 10, cep: '01310100', leilaoId: leilao.id, categoriaId, lanceAtual: 60,
        ...(fechado ? { status: 'SOLD' as const, vencedorId: licitanteId } : {}),
      },
    });
    await prisma.bid.create({ data: { valor: 60, lanceAnterior: null, itemId: item.id, licitanteId } });
    return item.id;
  }

  const encerrar = (token: string, senhaAtual = SENHA) => api('post', '/users/me/encerrar-conta', token).send({ senhaAtual });

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
    categoriaId = (await prisma.category.create({ data: { nome: `Categoria Conta ${SUFIXO}` } })).id;
    vendedorId = (await criarUsuario('vendedor', 'SELLER')).id;
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it('encerra: dados pessoais anonimizados, conta inativa, login impossivel e token invalido', async () => {
    const pessoa = await criarUsuario('feliz', 'BIDDER');
    const itemId = await itemComLance(pessoa.id, true); // ja fechado: a pessoa venceu a peca

    await encerrar(pessoa.token).expect(204);

    const depois = await prisma.user.findUniqueOrThrow({ where: { id: pessoa.id } });
    expect(depois.ativo).toBe(false);
    expect(depois.nome).toBe('Usuário removido');
    expect(depois.email).toBe(`removido.${pessoa.id}@removido.invalid`);
    expect([depois.telefone, depois.cpf, depois.endereco, depois.avatarUrl]).toEqual([null, null, null, null]);

    // o token e a senha antiga deixam de funcionar
    await api('get', '/users/me', pessoa.token).expect(401);
    await api('post', '/auth/login').send({ email: pessoa.email, senha: SENHA }).expect(401);
    expect(await prisma.session.count({ where: { usuarioId: pessoa.id, revogadaEm: null } })).toBe(0);

    // o historico permanece (imutavel), agora com o nome anonimizado
    expect(await prisma.bid.count({ where: { licitanteId: pessoa.id } })).toBe(1);
    const peca = await api('get', `/auction-items/${itemId}`).expect(200);
    expect(peca.body.vencedorNome).toBe('Usuário removido');
    expect(await prisma.auditLog.count({ where: { acao: 'CONTA_ENCERRADA', entidadeId: pessoa.id } })).toBe(1);
  });

  it('senha atual errada -> 400 e a conta continua intacta', async () => {
    const pessoa = await criarUsuario('senhaerrada', 'BIDDER');
    await encerrar(pessoa.token, 'Errada123!').expect(400);
    await api('get', '/users/me', pessoa.token).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: pessoa.id } })).nome).toBe('Pessoa senhaerrada');
  });

  it('sem senha no corpo -> 400; sem login -> 401', async () => {
    const pessoa = await criarUsuario('semsenha', 'BIDDER');
    await api('post', '/users/me/encerrar-conta', pessoa.token).send({}).expect(400);
    await api('post', '/users/me/encerrar-conta').send({ senhaAtual: SENHA }).expect(401);
  });

  it('ADMIN nao encerra a propria conta por aqui -> 403', async () => {
    const admin = await criarUsuario('admin', 'ADMIN');
    await encerrar(admin.token).expect(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).ativo).toBe(true);
  });

  // Pelo servico (a rota tem limite de 5 tentativas por minuto: senha e verificada nela)
  it('com pendencias nao encerra (409): peca em disputa, leilao em andamento e pedido nao finalizado', async () => {
    const usuarios = app.get(UsersService);

    const disputando = await criarUsuario('disputando', 'BIDDER');
    await itemComLance(disputando.id, false);
    await expect(usuarios.encerrarConta(disputando.id, SENHA)).rejects.toThrow(/em disputa/);

    const dono = await criarUsuario('dono', 'SELLER');
    await prisma.auction.create({
      data: { titulo: 'Leilao do dono', status: 'OPEN', dataInicio: new Date(Date.now() - 3_600_000), dataFim: new Date(Date.now() + 3_600_000), vendedorId: dono.id },
    });
    await expect(usuarios.encerrarConta(dono.id, SENHA)).rejects.toThrow(/em andamento/);

    const comprador = await criarUsuario('devedor', 'BIDDER');
    const itemVendido = await itemComLance(comprador.id, true);
    await prisma.pedido.create({ data: { itemId: itemVendido, compradorId: comprador.id, valor: 60 } }); // AGUARDANDO_PAGAMENTO
    await expect(usuarios.encerrarConta(comprador.id, SENHA)).rejects.toThrow(/pedido/);

    // nada foi anonimizado
    expect((await prisma.user.findUniqueOrThrow({ where: { id: comprador.id } })).nome).toBe('Pessoa devedor');

    // e quando o pedido e finalizado, libera
    await prisma.pedido.update({ where: { itemId: itemVendido }, data: { status: 'FINALIZADO' } });
    await usuarios.encerrarConta(comprador.id, SENHA);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: comprador.id } })).ativo).toBe(false);
  });
});
