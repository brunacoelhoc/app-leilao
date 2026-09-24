import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { CepService } from './../src/cep/cep.service';
import { cepFalso } from './cep-falso';
import { configurarAplicacao } from './../src/configurar-aplicacao';
import { DestaquesService } from './../src/destaques/destaques.service';
import { PrismaService } from './../src/prisma/prisma.service';

interface Destaque {
  id: string;
  status: string;
  etiqueta: string;
  totalItens: number;
  itemUnicoId: string | null;
}

describe('Destaques (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let chave: string;
  let vendedorId: string;
  let categoriaId: string;
  const criados: string[] = [];

  async function criarLeilao(titulo: string, status: 'OPEN' | 'SCHEDULED' | 'DRAFT' | 'CLOSED', comItem: boolean) {
    const agora = Date.now();
    const leilao = await prisma.auction.create({
      data: {
        titulo,
        status,
        dataInicio: new Date(agora - 3600_000),
        dataFim: new Date(agora + 3600_000),
        vendedorId,
      },
    });
    criados.push(leilao.id);
    if (comItem) {
      await prisma.auctionItem.create({
        data: { titulo: `${titulo} item`, precoInicial: 10, incrementoMinimo: 1, cep: '01310100', leilaoId: leilao.id, categoriaId },
      });
    }
    return leilao.id;
  }

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CepService)
      .useValue(cepFalso)
      .compile();
    app = modulo.createNestApplication();
    configurarAplicacao(app);
    await app.init();
    chave = app.get(ConfigService).getOrThrow<string>('API_KEY');
    prisma = app.get(PrismaService);

    const sufixo = Date.now();
    const vendedor = await prisma.user.create({
      data: { nome: 'Vend Destaque', email: `dest.${sufixo}@teste.com`, senha: 'x', papel: 'SELLER' },
    });
    vendedorId = vendedor.id;
    categoriaId = (await prisma.category.create({ data: { nome: `Dest Cat ${sufixo}` } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('lista abertos e em breve com etiqueta, e nunca rascunho', async () => {
    const aberto = await criarLeilao('Dest Aberto', 'OPEN', true);
    const breve = await criarLeilao('Dest Breve', 'SCHEDULED', false);
    const rascunho = await criarLeilao('Dest Rascunho', 'DRAFT', false);

    // Direto no service com limite alto: o banco de desenvolvimento tem outros
    // leiloes e o endpoint limita a 10
    const lista = (await app.get(DestaquesService).listar(500)) as unknown as Destaque[];
    const porId = new Map(lista.map((d) => [d.id, d]));

    expect(porId.get(aberto)).toMatchObject({ etiqueta: 'Aberto', totalItens: 1 });
    expect(porId.get(aberto)?.itemUnicoId).not.toBeNull();
    expect(porId.get(breve)).toMatchObject({ etiqueta: 'Em breve', totalItens: 0, itemUnicoId: null });
    expect(porId.has(rascunho)).toBe(false);
  });

  it('abertos vem antes de em breve; respeita o limite', async () => {
    const res = await request(app.getHttpServer()).get('/api/destaques?limite=3').set('X-API-KEY', chave).expect(200);
    const lista = res.body as Destaque[];
    expect(lista.length).toBeLessThanOrEqual(3);
    const rank = { OPEN: 0, SCHEDULED: 1, CLOSED: 2 } as Record<string, number>;
    const ranks = lista.map((d) => rank[d.status]);
    expect([...ranks].sort()).toEqual(ranks);
  });

  it('exige a X-API-KEY como o resto da API', async () => {
    await request(app.getHttpServer()).get('/api/destaques').expect(401);
  });
});
