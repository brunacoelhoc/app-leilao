import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AuctionsService } from './../src/auctions/auctions.service';
import { EncerramentoAutomaticoService } from './../src/auctions/encerramento-automatico.service';
import { CepService } from './../src/cep/cep.service';
import { configurarAplicacao } from './../src/configurar-aplicacao';
import { PrismaService } from './../src/prisma/prisma.service';
import { cepFalso } from './cep-falso';
import { PERFIL_COMPLETO } from './perfil-teste';

// QA fase 4 (lacunas): o PRAZO do leilão é a fronteira mais perigosa. Aqui: lance fora do período, o robô que fecha
// sozinho disputando com lances no limite do prazo (anti-sniping) e o reinício do servidor com leilões no meio
describe('Lances: prazo, robô de encerramento e reinício (e2e)', () => {
  let app: INestApplication<App>;
  let chave: string;
  let prisma: PrismaService;
  let categoriaId: string;
  let vendedor: { id: string; token: string };
  let admin: { id: string; token: string };
  let licitantes: { id: string; token: string }[] = [];

  const SUFIXO = Date.now();
  const QUANTOS = 6;
  const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function criarUsuario(quem: string, papel: 'BIDDER' | 'SELLER' | 'ADMIN') {
    const usuario = await prisma.user.create({
      data: { nome: `Prazo ${quem}`, email: `prazo.${quem}.${SUFIXO}@teste.com`, senha: 'x', papel, ...PERFIL_COMPLETO },
    });
    const sessao = await prisma.session.create({ data: { usuarioId: usuario.id, refreshHash: 'teste', expiraEm: new Date(Date.now() + 86_400_000) } });
    return { id: usuario.id, token: app.get(JwtService, { strict: false }).sign({ sub: usuario.id, papel, sid: sessao.id }) };
  }

  type Status = 'DRAFT' | 'SCHEDULED' | 'OPEN' | 'CLOSED' | 'CANCELED';
  async function criarLeilao(opcoes: { status?: Status; inicioMs?: number; fimMs: number }) {
    const { status = 'OPEN', inicioMs = -3_600_000, fimMs } = opcoes;
    const leilao = await prisma.auction.create({
      data: { titulo: 'Leilao prazo', status, dataInicio: new Date(Date.now() + inicioMs), dataFim: new Date(Date.now() + fimMs), vendedorId: vendedor.id },
    });
    const item = await prisma.auctionItem.create({
      data: { titulo: 'Peca prazo', precoInicial: 100, incrementoMinimo: 10, cep: '01310100', leilaoId: leilao.id, categoriaId },
    });
    return { leilaoId: leilao.id, itemId: item.id };
  }

  const lance = (itemId: string, quem: { token: string }, valor: number, servidor: INestApplication<App> = app) =>
    request(servidor.getHttpServer()).post(`/api/auction-items/${itemId}/bids`).set('X-API-KEY', chave).set('Authorization', `Bearer ${quem.token}`).send({ valor });

  const robo = () => app.get(EncerramentoAutomaticoService);
  const leilaoDoBanco = (id: string) => prisma.auction.findUniqueOrThrow({ where: { id } });

  function semRateLimit() {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- guardado só para chamar via .apply(this, ...) abaixo
    const original = ConfigService.prototype.getOrThrow as (this: ConfigService, chave: string, ...resto: unknown[]) => unknown;
    jest.spyOn(ConfigService.prototype, 'getOrThrow').mockImplementation(function (this: ConfigService, chave: string, ...resto: unknown[]) {
      if (chave === 'RATE_LIMIT_MAX') return 1_000_000 as never;
      return original.apply(this, [chave, ...resto]);
    });
  }

  async function subirApp(): Promise<INestApplication<App>> {
    const modulo: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(CepService).useValue(cepFalso).compile();
    const nova = modulo.createNestApplication();
    configurarAplicacao(nova);
    await nova.init();
    return nova;
  }

  beforeAll(async () => {
    semRateLimit();
    app = await subirApp();
    chave = app.get(ConfigService).getOrThrow<string>('API_KEY');
    prisma = app.get(PrismaService);
    categoriaId = (await prisma.category.create({ data: { nome: `Categoria Prazo ${SUFIXO}` } })).id;
    vendedor = await criarUsuario('vendedor', 'SELLER');
    admin = await criarUsuario('admin', 'ADMIN');
    for (let i = 0; i < QUANTOS; i++) licitantes.push(await criarUsuario(`licitante${i}`, 'BIDDER'));
  }, 60_000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  describe('lance fora do período do leilão', () => {
    it('leilão ABERTO mas com o prazo já vencido (o robô ainda não fechou) -> 409 "fora do período", nada é gravado', async () => {
      const { itemId } = await criarLeilao({ fimMs: -5_000 });
      const res = await lance(itemId, licitantes[0], 100);
      expect(res.status).toBe(409);
      expect(JSON.stringify(res.body.mensagem)).toContain('Fora do periodo');
      expect(await prisma.bid.count({ where: { itemId } })).toBe(0);
    });

    it('leilão marcado ABERTO mas com início no futuro -> 409', async () => {
      const { itemId } = await criarLeilao({ inicioMs: 3_600_000, fimMs: 7_200_000 });
      const res = await lance(itemId, licitantes[0], 100);
      expect(res.status).toBe(409);
      expect(JSON.stringify(res.body.mensagem)).toContain('Fora do periodo');
    });

    it.each(['DRAFT', 'SCHEDULED', 'CLOSED', 'CANCELED'] as const)('leilão %s -> 409 "não está aberto"', async (status) => {
      const { itemId } = await criarLeilao({ status, fimMs: 3_600_000 });
      const res = await lance(itemId, licitantes[0], 100);
      expect(res.status).toBe(409);
      expect(JSON.stringify(res.body.mensagem)).toContain('nao esta aberto');
    });

    it('o fim do prazo é respeitado depois de uma prorrogação: dentro do novo prazo entra, e o lance de antes já valia', async () => {
      const { leilaoId, itemId } = await criarLeilao({ fimMs: 60_000 }); // na janela do anti-sniping
      expect((await lance(itemId, licitantes[0], 100)).status).toBe(201);
      const depois = await leilaoDoBanco(leilaoId);
      expect(depois.dataFim.getTime()).toBeGreaterThan(Date.now() + 100_000); // estendeu para ~2 minutos
      expect((await lance(itemId, licitantes[1], 110)).status).toBe(201); // segue aceitando
    });
  });

  describe('robô de encerramento x lance no limite do prazo', () => {
    it('DETERMINÍSTICO: o robô leu o leilão, um lance estendeu o prazo, e só depois o robô tenta fechar -> NÃO fecha', async () => {
      const { leilaoId, itemId } = await criarLeilao({ fimMs: 30_000 });
      const leituraAntiga = await leilaoDoBanco(leilaoId); // é o que o robô tinha em mãos ao decidir fechar

      expect((await lance(itemId, licitantes[0], 100)).status).toBe(201); // lance de última hora: prazo vai para ~2 min
      expect((await leilaoDoBanco(leilaoId)).dataFim.getTime()).toBeGreaterThan(leituraAntiga.dataFim.getTime());

      // exatamente o que o robô faz, com a leitura antiga e "exigirMesmoPrazo" ligado
      await expect(
        app.get(AuctionsService).aplicarMudancaStatus(leituraAntiga, 'CLOSED', vendedor.id, 'Encerrado automaticamente', true),
      ).rejects.toThrow(/mudou de estado/);

      const final = await leilaoDoBanco(leilaoId);
      expect(final.status).toBe('OPEN'); // continua aberto
      expect(await prisma.auctionStatusHistory.count({ where: { leilaoId, statusNovo: 'CLOSED' } })).toBe(0);
      expect((await prisma.auctionItem.findUniqueOrThrow({ where: { id: itemId } })).status).toBe('AVAILABLE'); // item não foi vendido nem "encerrado"
    });

    it('sem lance nenhum, o robô fecha o leilão vencido e o item fica não vendido', async () => {
      const { leilaoId, itemId } = await criarLeilao({ fimMs: -2_000 });
      await robo().verificar();
      expect((await leilaoDoBanco(leilaoId)).status).toBe('CLOSED');
      expect((await prisma.auctionItem.findUniqueOrThrow({ where: { id: itemId } })).status).toBe('UNSOLD');
    });

    it('TEMPESTADE: lances e o robô rodando ao mesmo tempo em volta do fim do prazo (várias rodadas) -> sempre coerente', async () => {
      for (let rodada = 0; rodada < 4; rodada++) {
        const { leilaoId, itemId } = await criarLeilao({ fimMs: 600 + rodada * 150 }); // o fim cai no meio da tempestade
        const respostas: { status: number; body: unknown }[] = [];
        let valor = 100;
        let parar = false;

        // o robô confere o relógio sem parar (na vida real, a cada 5s; aqui a cada 40ms para forçar o encontro)
        const loopRobo = (async () => {
          while (!parar) {
            await robo().verificar();
            await dormir(40);
          }
        })();
        // lances em sequência, alternando os licitantes, cobrindo antes, durante e depois do fim original
        const inicio = Date.now();
        let i = 0;
        while (Date.now() - inicio < 1600) {
          const res = await lance(itemId, licitantes[i % QUANTOS], (valor += 10));
          respostas.push({ status: res.status, body: res.body });
          i++;
          await dormir(30);
        }
        parar = true;
        await loopRobo;

        // 1) ninguém levou erro de servidor
        expect(respostas.filter((r) => r.status >= 500)).toEqual([]);
        expect(respostas.every((r) => r.status === 201 || r.status === 409)).toBe(true);

        const leilao = await leilaoDoBanco(leilaoId);
        const lances = await prisma.bid.findMany({ where: { itemId }, orderBy: { criadoEm: 'asc' } });
        expect(lances.length).toBe(respostas.filter((r) => r.status === 201).length); // o que voltou 201 é o que está gravado

        // 2) nenhum lance foi aceito depois de o leilão fechar
        const fechamento = await prisma.auctionStatusHistory.findFirst({ where: { leilaoId, statusNovo: 'CLOSED' } });
        if (fechamento) {
          expect(lances.every((l) => l.criadoEm.getTime() <= fechamento.criadoEm.getTime())).toBe(true);
          // 3) o vencedor é o maior lance, pelo valor dele
          const item = await prisma.auctionItem.findUniqueOrThrow({ where: { id: itemId } });
          if (lances.length === 0) {
            expect(item.status).toBe('UNSOLD');
          } else {
            const maior = lances.reduce((a, b) => (Number(b.valor) > Number(a.valor) ? b : a));
            expect(item.status).toBe('SOLD');
            expect(item.vencedorId).toBe(maior.licitanteId);
            expect(Number(item.lanceAtual)).toBe(Number(maior.valor));
          }
        } else {
          // se o anti-sniping empurrou o prazo, o leilão segue aberto com o prazo no futuro (nunca "aberto e vencido sem motivo")
          expect(leilao.status).toBe('OPEN');
          expect(leilao.dataFim.getTime()).toBeGreaterThan(Date.now());
          expect(leilao.prorrogacoes).toBeGreaterThan(0);
        }
      }
    }, 60_000);
  });

  describe('reinício do servidor com leilões no meio', () => {
    it('o estado está no banco: depois de reiniciar, o próximo lance respeita o lance atual e o prazo prorrogado continua valendo', async () => {
      const { leilaoId, itemId } = await criarLeilao({ fimMs: 60_000 });
      expect((await lance(itemId, licitantes[0], 100)).status).toBe(201);
      expect((await lance(itemId, licitantes[1], 120)).status).toBe(201);
      const antes = await leilaoDoBanco(leilaoId);

      const reiniciado = await subirApp(); // "servidor novo": nada em memória
      try {
        const abaixo = await lance(itemId, licitantes[2], 125, reiniciado); // mínimo agora é 130
        expect(abaixo.status).toBe(409);
        expect((await lance(itemId, licitantes[2], 130, reiniciado)).status).toBe(201);
        const depois = await leilaoDoBanco(leilaoId);
        expect(depois.prorrogacoes).toBe(antes.prorrogacoes + 1); // a contagem de prorrogações continuou de onde parou
        expect(depois.dataFim.getTime()).toBeGreaterThanOrEqual(antes.dataFim.getTime());
      } finally {
        await reiniciado.close();
      }
    });

    it('o que venceu ou começou enquanto o servidor estava fora é resolvido assim que o robô roda: fecha o vencido e abre o agendado', async () => {
      const vencido = await criarLeilao({ fimMs: -600_000 }); // deveria ter fechado há 10 minutos
      await prisma.bid.create({ data: { valor: 100, itemId: vencido.itemId, licitanteId: licitantes[0].id } });
      await prisma.auctionItem.update({ where: { id: vencido.itemId }, data: { lanceAtual: 100 } });
      const agendado = await criarLeilao({ status: 'SCHEDULED', inicioMs: -300_000, fimMs: 3_600_000 }); // deveria ter aberto há 5 minutos

      const reiniciado = await subirApp();
      try {
        await reiniciado.get(EncerramentoAutomaticoService).verificar(); // a primeira rodada depois de subir
        expect((await leilaoDoBanco(vencido.leilaoId)).status).toBe('CLOSED');
        const item = await prisma.auctionItem.findUniqueOrThrow({ where: { id: vencido.itemId } });
        expect(item.status).toBe('SOLD');
        expect(item.vencedorId).toBe(licitantes[0].id);
        expect((await leilaoDoBanco(agendado.leilaoId)).status).toBe('OPEN');
      } finally {
        await reiniciado.close();
      }
    });

    it('o TEMPORIZADOR real do robô (sem chamar verificar() na mão) fecha um leilão vencido sozinho depois de subir', async () => {
      const vencido = await criarLeilao({ fimMs: -60_000 });
      const ambienteAntes = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development'; // nos testes o robô fica desligado de propósito; aqui ele precisa ligar
      let servidor: INestApplication<App> | undefined;
      try {
        servidor = await subirApp();
        let status = 'OPEN';
        for (let tentativa = 0; tentativa < 20 && status !== 'CLOSED'; tentativa++) {
          await dormir(500); // o robô confere a cada 5s
          status = (await leilaoDoBanco(vencido.leilaoId)).status;
        }
        expect(status).toBe('CLOSED');
      } finally {
        process.env.NODE_ENV = ambienteAntes;
        await servidor?.close();
      }
    }, 30_000);
  });
});
