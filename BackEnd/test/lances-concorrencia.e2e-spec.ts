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

// QA passo 4: lances com MUITOS usuários ao mesmo tempo. O que importa aqui não é um lance isolado (isso já
// está em bids.e2e-spec), e sim as garantias sob disputa: ninguém leva 5xx, o lance vencedor é coerente com o
// banco, a cadeia de lances nunca "pula" o incremento e fechar/cancelar no meio da disputa não corrompe nada
describe('Lances: concorrência (e2e)', () => {
  let app: INestApplication<App>;
  let chave: string;
  let prisma: PrismaService;
  let categoriaId: string;
  let vendedor: { id: string; token: string };
  let admin: { id: string; token: string };
  let licitantes: { id: string; token: string }[] = [];

  const SUFIXO = Date.now();
  const QUANTOS = 30;
  const leiloesCriados: string[] = [];

  async function criarUsuario(quem: string, papel: 'BIDDER' | 'SELLER' | 'ADMIN') {
    const usuario = await prisma.user.create({
      data: { nome: `Disputa ${quem}`, email: `disputa.${quem}.${SUFIXO}@teste.com`, senha: 'x', papel, ...PERFIL_COMPLETO },
    });
    const sessao = await prisma.session.create({ data: { usuarioId: usuario.id, refreshHash: 'teste', expiraEm: new Date(Date.now() + 86_400_000) } });
    return { id: usuario.id, token: app.get(JwtService, { strict: false }).sign({ sub: usuario.id, papel, sid: sessao.id }) };
  }

  // Leilão já ABERTO com N itens. "segundosParaFim" curto (< 120) coloca o leilão na janela do anti-sniping:
  // todo lance aceito também atualiza a linha do leilão (é a situação em que duas transações disputam as mesmas linhas)
  async function leilaoAberto(itens: number, opcoes: { segundosParaFim?: number; preco?: number; incremento?: number } = {}) {
    const { segundosParaFim = 3600, preco = 100, incremento = 10 } = opcoes;
    const leilao = await prisma.auction.create({
      data: { titulo: 'Disputa', status: 'OPEN', dataInicio: new Date(Date.now() - 3_600_000), dataFim: new Date(Date.now() + segundosParaFim * 1000), vendedorId: vendedor.id },
    });
    leiloesCriados.push(leilao.id);
    const ids: string[] = [];
    for (let i = 0; i < itens; i++) {
      ids.push((await prisma.auctionItem.create({ data: { titulo: `Peca ${i}`, precoInicial: preco, incrementoMinimo: incremento, cep: '01310100', leilaoId: leilao.id, categoriaId } })).id);
    }
    return { leilaoId: leilao.id, itens: ids };
  }

  const lance = (itemId: string, quem: { token: string }, valor: number) =>
    request(app.getHttpServer()).post(`/api/auction-items/${itemId}/bids`).set('X-API-KEY', chave).set('Authorization', `Bearer ${quem.token}`).send({ valor });

  const mudarStatus = (leilaoId: string, status: 'CLOSED' | 'CANCELED') =>
    request(app.getHttpServer())
      .patch(`/api/auctions/${leilaoId}/status`)
      .set('X-API-KEY', chave)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status, motivo: 'Teste de disputa' });

  const semErroDeServidor = (respostas: { status: number; body: unknown }[]) => {
    const ruins = respostas.filter((r) => r.status >= 500);
    expect({ quantidade: ruins.length, exemplo: ruins[0]?.body }).toEqual({ quantidade: 0, exemplo: undefined });
  };

  // A cadeia gravada tem que ser coerente: cada lance supera o anterior em pelo menos o incremento e aponta para ele
  async function conferirCadeia(itemId: string, incremento: number, precoInicial: number) {
    const lances = await prisma.bid.findMany({ where: { itemId }, orderBy: { criadoEm: 'asc' } });
    let anterior: number | null = null;
    for (const l of lances) {
      const valor = Number(l.valor);
      const minimo: number = anterior === null ? precoInicial : Math.round((anterior + incremento) * 100) / 100;
      expect(valor).toBeGreaterThanOrEqual(minimo);
      expect(l.lanceAnterior === null ? null : Number(l.lanceAnterior)).toBe(anterior);
      anterior = valor;
    }
    const item = await prisma.auctionItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.lanceAtual === null ? null : Number(item.lanceAtual)).toBe(anterior); // o item mostra exatamente o último lance aceito
    return { lances, item };
  }

  beforeAll(async () => {
    // o limite geral (100 req/min) não pode contaminar um teste que dispara centenas de chamadas
    // eslint-disable-next-line @typescript-eslint/unbound-method -- guardado só para chamar via .apply(this, ...) abaixo
    const original = ConfigService.prototype.getOrThrow as (this: ConfigService, chave: string, ...resto: unknown[]) => unknown;
    jest.spyOn(ConfigService.prototype, 'getOrThrow').mockImplementation(function (this: ConfigService, chave: string, ...resto: unknown[]) {
      if (chave === 'RATE_LIMIT_MAX') return 1_000_000 as never;
      return original.apply(this, [chave, ...resto]);
    });

    const modulo: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarAplicacao(app);
    await app.listen(0); // porta real: dezenas de chamadas simultâneas reaproveitam o mesmo servidor
    chave = app.get(ConfigService).getOrThrow<string>('API_KEY');
    prisma = app.get(PrismaService);

    categoriaId = (await prisma.category.create({ data: { nome: `Categoria Disputa ${SUFIXO}` } })).id;
    vendedor = await criarUsuario('vendedor', 'SELLER');
    admin = await criarUsuario('admin', 'ADMIN');
    for (let i = 0; i < QUANTOS; i++) licitantes.push(await criarUsuario(`licitante${i}`, 'BIDDER'));
  }, 60_000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  it(`${QUANTOS} lances SIMULTÂNEOS no mesmo item: nenhum 5xx, um vencedor coerente e cadeia sem furos`, async () => {
    const { itens: [itemId] } = await leilaoAberto(1);

    // Valores todos distintos e válidos contra o preço inicial (100): quem chegar depois precisa superar o anterior + 10
    const respostas = await Promise.all(licitantes.map((l, i) => lance(itemId, l, 100 + i * 11)));

    semErroDeServidor(respostas);
    expect(respostas.every((r) => r.status === 201 || r.status === 409)).toBe(true);
    const aceitos = respostas.filter((r) => r.status === 201);
    expect(aceitos.length).toBeGreaterThanOrEqual(1);

    const { lances } = await conferirCadeia(itemId, 10, 100);
    expect(lances.length).toBe(aceitos.length); // o que foi respondido 201 é exatamente o que está gravado
    // o maior lance recebido pelo servidor com sucesso é o que está no item
    const maiorAceito = Math.max(...aceitos.map((r) => Number(r.body.valor)));
    expect(Number(lances[lances.length - 1].valor)).toBeLessThanOrEqual(maiorAceito);
  }, 60_000);

  it('PICO: 120 requisições simultâneas no mesmo item (30 usuários x 4 tentativas): sem 5xx e tudo coerente', async () => {
    const { itens: [itemId] } = await leilaoAberto(1);
    const requisicoes = licitantes.flatMap((l, i) => [0, 1, 2, 3].map((k) => lance(itemId, l, 100 + i * 11 + k * 400)));

    const respostas = await Promise.all(requisicoes);

    semErroDeServidor(respostas);
    expect(respostas.every((r) => r.status === 201 || r.status === 409)).toBe(true);
    const aceitos = respostas.filter((r) => r.status === 201);
    const { lances } = await conferirCadeia(itemId, 10, 100);
    expect(lances.length).toBe(aceitos.length);
    expect(new Set(lances.map((l) => l.licitanteId)).size).toBeGreaterThan(1); // vários usuários entraram na disputa
  }, 90_000);

  it('duplo clique: o MESMO usuário manda o mesmo lance duas vezes juntas -> um 201 e um 409', async () => {
    const { itens: [itemId] } = await leilaoAberto(1);
    const respostas = await Promise.all([lance(itemId, licitantes[0], 150), lance(itemId, licitantes[0], 150)]);
    semErroDeServidor(respostas);
    expect(respostas.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.bid.count({ where: { itemId } })).toBe(1);
  });

  it('o MESMO usuário dispara 10 lances crescentes ao mesmo tempo -> só o primeiro entra (ninguém cobre a si mesmo)', async () => {
    const { itens: [itemId] } = await leilaoAberto(1);
    const respostas = await Promise.all(Array.from({ length: 10 }, (_, i) => lance(itemId, licitantes[1], 100 + i * 20)));
    semErroDeServidor(respostas);
    expect(respostas.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await prisma.bid.count({ where: { itemId } })).toBe(1);
  });

  it('lances em itens DIFERENTES do mesmo leilão ao mesmo tempo (anti-sniping): cada lance aceito conta uma prorrogação', async () => {
    const { leilaoId, itens } = await leilaoAberto(6, { segundosParaFim: 60 }); // dentro da janela de 2 minutos
    const respostas = await Promise.all(itens.flatMap((itemId, i) => [lance(itemId, licitantes[2 * i], 100), lance(itemId, licitantes[2 * i + 1], 110)]));

    semErroDeServidor(respostas);
    const aceitos = respostas.filter((r) => r.status === 201).length;
    expect(aceitos).toBeGreaterThanOrEqual(itens.length); // ao menos um por item
    const leilao = await prisma.auction.findUniqueOrThrow({ where: { id: leilaoId } });
    expect(leilao.prorrogacoes).toBe(aceitos); // nenhuma prorrogação se perdeu na disputa pela mesma linha do leilão
    expect(leilao.dataFim.getTime()).toBeGreaterThan(Date.now() + 100_000); // o prazo foi de fato estendido
  }, 60_000);

  describe('lances CONTRA o fechamento e o cancelamento do leilão', () => {
    it('fechar no meio da disputa: nada é aceito depois do fechamento e o vencedor é o maior lance', async () => {
      for (let rodada = 0; rodada < 3; rodada++) {
        const { leilaoId, itens: [itemId] } = await leilaoAberto(1);
        const [fechamento, ...respostas] = await Promise.all([
          mudarStatus(leilaoId, 'CLOSED'),
          ...licitantes.slice(0, 20).map((l, i) => lance(itemId, l, 100 + i * 11)),
        ]);

        semErroDeServidor([fechamento, ...respostas]);
        expect(fechamento.status).toBe(200);

        const item = await prisma.auctionItem.findUniqueOrThrow({ where: { id: itemId } });
        const lances = await prisma.bid.findMany({ where: { itemId }, orderBy: { valor: 'desc' } });
        expect(lances.length).toBe(respostas.filter((r) => r.status === 201).length);
        if (lances.length === 0) {
          expect(item.status).toBe('UNSOLD');
        } else {
          // o vencedor gravado é exatamente quem deu o maior lance gravado, pelo valor dele
          expect(item.status).toBe('SOLD');
          expect(item.vencedorId).toBe(lances[0].licitanteId);
          expect(Number(item.lanceAtual)).toBe(Number(lances[0].valor));
        }
        // e depois de fechado, ninguém mais consegue lançar
        expect((await lance(itemId, licitantes[25], 5000)).status).toBe(409);
      }
    }, 60_000);

    it('cancelar no meio da disputa, JÁ na janela do anti-sniping: sem 5xx (nada de deadlock) e os itens ficam indisponíveis', async () => {
      for (let rodada = 0; rodada < 6; rodada++) {
        const { leilaoId, itens } = await leilaoAberto(3, { segundosParaFim: 60 });
        const [cancelamento, ...respostas] = await Promise.all([
          mudarStatus(leilaoId, 'CANCELED'),
          ...itens.flatMap((itemId, i) => licitantes.slice(i * 6, i * 6 + 6).map((l, j) => lance(itemId, l, 100 + j * 11))),
        ]);

        semErroDeServidor([cancelamento, ...respostas]);
        expect(cancelamento.status).toBe(200);
        expect((await prisma.auction.findUniqueOrThrow({ where: { id: leilaoId } })).status).toBe('CANCELED');
        const restantes = await prisma.auctionItem.count({ where: { leilaoId, status: 'AVAILABLE' } });
        expect(restantes).toBe(0);
      }
    }, 90_000);
  });

  it('centavos: 30 lances de R$ 0,01 em sequência, sem erro de arredondamento', async () => {
    const { itens: [itemId] } = await leilaoAberto(1, { preco: 1, incremento: 0.01 });
    let valor = 1;
    for (let i = 0; i < 30; i++) {
      const quem = licitantes[i % 2]; // dois usuários alternando (ninguém cobre a si mesmo)
      const res = await lance(itemId, quem, Math.round(valor * 100) / 100);
      expect(res.status).toBe(201);
      expect(res.body.valor).toBe((Math.round(valor * 100) / 100).toString());
      valor += 0.01;
    }
    const { item } = await conferirCadeia(itemId, 0.01, 1);
    expect(item.lanceAtual?.toString()).toBe('1.29');
  }, 60_000);

  it('lance com valor exato no mínimo entra; um centavo abaixo é recusado com o mínimo na mensagem', async () => {
    const { itens: [itemId] } = await leilaoAberto(1, { preco: 100, incremento: 10 });
    expect((await lance(itemId, licitantes[3], 100)).status).toBe(201);
    const abaixo = await lance(itemId, licitantes[4], 109.99);
    expect(abaixo.status).toBe(409);
    expect(JSON.stringify(abaixo.body.mensagem)).toContain('110');
    expect((await lance(itemId, licitantes[4], 110)).status).toBe(201);
  });
});
