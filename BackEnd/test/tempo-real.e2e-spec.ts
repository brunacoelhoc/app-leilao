import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { EncerramentoAutomaticoService } from './../src/auctions/encerramento-automatico.service';
import { configurarAplicacao } from './../src/configurar-aplicacao';
import { PrismaService } from './../src/prisma/prisma.service';
import { CorsIoAdapter } from './../src/realtime/cors-io.adapter';

// Espera o proximo evento de um socket (ou falha em 5s)
function esperar<T>(socket: Socket, evento: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const limite = setTimeout(() => reject(new Error(`Timeout esperando "${evento}"`)), 5000);
    socket.once(evento, (dados: T) => {
      clearTimeout(limite);
      resolve(dados);
    });
  });
}

describe('Tempo real (e2e)', () => {
  jest.setTimeout(20000);
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let chave: string;
  let socket: Socket;
  let tokenSeller: string;
  let tokenBidder: string;
  let leilaoId: string;
  let itemId: string;

  const SENHA = 'Abc12345!';

  async function criarUsuario(nome: string, email: string, papel?: 'SELLER') {
    await request(app.getHttpServer())
      .post('/api/auth/registrar')
      .set('X-API-KEY', chave)
      .send({ nome, email, senha: SENHA });
    if (papel) await prisma.user.update({ where: { email }, data: { papel } });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-API-KEY', chave)
      .send({ email, senha: SENHA });
    return (login.body as { accessToken: string }).accessToken;
  }

  const api = (metodo: 'post' | 'patch', url: string, token: string) =>
    request(app.getHttpServer())[metodo](url).set('X-API-KEY', chave).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarAplicacao(app);
    app.useWebSocketAdapter(new CorsIoAdapter(app));
    await app.listen(0); // porta livre qualquer: o socket precisa de servidor de verdade
    const porta = (app.getHttpServer().address() as { port: number }).port;

    chave = app.get(ConfigService).getOrThrow<string>('API_KEY');
    prisma = app.get(PrismaService);

    const sufixo = Date.now();
    tokenSeller = await criarUsuario('Vendedor Realtime', `rt.seller.${sufixo}@teste.com`, 'SELLER');
    tokenBidder = await criarUsuario('Maria Ganhadora Silva', `rt.bidder.${sufixo}@teste.com`);
    const categoria = await prisma.category.create({ data: { nome: `RT Categoria ${sufixo}` } });

    const agora = Date.now();
    const leilao = await api('post', '/api/auctions', tokenSeller).send({
      titulo: 'RT Leilao',
      dataInicio: new Date(agora - 86400000).toISOString(),
      dataFim: new Date(agora + 86400000).toISOString(),
    });
    leilaoId = (leilao.body as { id: string }).id;
    const item = await api('post', '/api/auction-items', tokenSeller).send({
      titulo: 'RT Item',
      precoInicial: 100,
      incrementoMinimo: 10,
      cep: '01310100',
      leilaoId,
      categoriaId: categoria.id,
    });
    itemId = (item.body as { id: string }).id;
    await api('patch', `/api/auctions/${leilaoId}/status`, tokenSeller).send({ status: 'SCHEDULED' });
    await api('patch', `/api/auctions/${leilaoId}/status`, tokenSeller).send({ status: 'OPEN' });

    socket = io(`http://localhost:${porta}/lances`, { transports: ['websocket'] });
    await esperar(socket, 'connect');
    socket.emit('entrar-item', itemId);
    await new Promise((r) => setTimeout(r, 200)); // tempo do servidor registrar a sala
  });

  afterAll(async () => {
    socket.disconnect();
    await app.close();
  });

  it('avisa a sala do item quando chega um lance novo', async () => {
    const chegou = esperar<{ lance: { valor: string; itemId: string }; licitanteNome: string; lanceAtual: string; lanceMinimo: string }>(
      socket,
      'lance-novo',
    );
    await api('post', `/api/auction-items/${itemId}/bids`, tokenBidder).send({ valor: 150 }).expect(201);

    const evento = await chegou;
    expect(evento.lance.itemId).toBe(itemId);
    expect(evento.lanceAtual).toBe('150');
    expect(evento.lanceMinimo).toBe('160');
    expect(evento.licitanteNome).toBe('Maria Ganhadora Silva');
  });

  it('fecha sozinho quando o prazo acaba e avisa o ganhador', async () => {
    // Simula o tempo passando: o fim do leilao vira "1 segundo atras"
    await prisma.auction.update({ where: { id: leilaoId }, data: { dataFim: new Date(Date.now() - 1000) } });

    const finalizado = esperar<{ itemId: string; status: string; vencedorNome: string; valorFinal: string }>(
      socket,
      'item-finalizado',
    );
    await app.get(EncerramentoAutomaticoService).verificar();

    const evento = await finalizado;
    expect(evento).toMatchObject({ itemId, status: 'SOLD', vencedorNome: 'Maria Ganhadora Silva', valorFinal: '150' });

    const leilao = await prisma.auction.findUniqueOrThrow({ where: { id: leilaoId } });
    expect(leilao.status).toBe('CLOSED');
  });

  it('depois de finalizado, rejeita novos lances (item indisponivel)', async () => {
    await api('post', `/api/auction-items/${itemId}/bids`, tokenBidder).send({ valor: 500 }).expect(409);
  });

  it('a API de item devolve situacao, lance minimo e o nome do vencedor', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/auction-items/${itemId}`)
      .set('X-API-KEY', chave)
      .set('Authorization', `Bearer ${tokenBidder}`)
      .expect(200);
    expect(res.body).toMatchObject({ situacao: 'VENDIDO', lanceMinimo: '160', segundosParaMudanca: null });
  });

  it('item de leilao aberto vem como ABERTO com contagem regressiva do servidor', async () => {
    const sufixo = Date.now();
    const cat = await prisma.category.create({ data: { nome: `RT Cat2 ${sufixo}` } });
    const agora = Date.now();
    const leilao = await api('post', '/api/auctions', tokenSeller).send({
      titulo: 'RT Leilao 2',
      dataInicio: new Date(agora - 60000).toISOString(),
      dataFim: new Date(agora + 600000).toISOString(),
    });
    const id2 = (leilao.body as { id: string }).id;
    const item = await api('post', '/api/auction-items', tokenSeller).send({
      titulo: 'RT Item 2', precoInicial: 100, incrementoMinimo: 10, cep: '01310100', leilaoId: id2, categoriaId: cat.id,
    });
    const item2 = (item.body as { id: string }).id;
    await api('patch', `/api/auctions/${id2}/status`, tokenSeller).send({ status: 'SCHEDULED' });
    await api('patch', `/api/auctions/${id2}/status`, tokenSeller).send({ status: 'OPEN' });

    const res = await request(app.getHttpServer())
      .get(`/api/auction-items/${item2}`)
      .set('X-API-KEY', chave)
      .set('Authorization', `Bearer ${tokenBidder}`)
      .expect(200);
    const corpo = res.body as { situacao: string; lanceMinimo: string; segundosParaMudanca: number };
    expect(corpo.situacao).toBe('ABERTO');
    expect(corpo.lanceMinimo).toBe('100');
    expect(corpo.segundosParaMudanca).toBeGreaterThan(590);
    expect(corpo.segundosParaMudanca).toBeLessThanOrEqual(600);
  });

  it('a API de item devolve o nome do vencedor', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/auction-items/${itemId}`)
      .set('X-API-KEY', chave)
      .set('Authorization', `Bearer ${tokenBidder}`)
      .expect(200);
    expect((res.body as { vencedorNome: string }).vencedorNome).toBe('Maria Ganhadora Silva');
  });
});
