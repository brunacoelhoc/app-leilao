import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configurarAplicacao } from './../src/configurar-aplicacao';
import { PrismaService } from './../src/prisma/prisma.service';

// Prova que /auth/login e /auth/registrar tem um limite PROPRIO, mais baixo
// que o limite geral (100/min) da aplicacao -- achado da revisao de
// seguranca de 2026-09-22: o limite geral sozinho e fraco demais contra
// forca bruta de senha. App isolado desta suite (nao interfere na contagem
// de login de nenhum outro arquivo de teste, nem e afetado por eles)
describe('Rate limiting especifico do login/registro (e2e)', () => {
  let app: INestApplication<App>;
  let chave: string;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configurarAplicacao(app);
    await app.init();

    chave = app.get(ConfigService).getOrThrow<string>('API_KEY');
    prisma = app.get(PrismaService);
  }, 30_000);

  afterAll(async () => {
    // Todo registro (sucesso) agora audita, o que deixa o usuario preso
    // para sempre (onDelete: Restrict) -- tentativa best-effort
    await prisma.user
      .deleteMany({ where: { email: { startsWith: 'rate.limit.registrar.' } } })
      .catch(() => undefined);
    await app.close();
  });

  it('login: a 11a tentativa em menos de 1 minuto -> 429 (limite e 10/min, bem abaixo do geral)', async () => {
    let ultimaResposta;
    for (let tentativa = 1; tentativa <= 11; tentativa++) {
      ultimaResposta = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-API-KEY', chave)
        .send({
          email: 'nao-existe-rate-limit@teste.com',
          senha: 'SenhaErrada9!',
        });

      if (tentativa <= 10) {
        // Nenhuma das 10 primeiras pode ser bloqueada pelo limite (podem
        // ser 401, isso e esperado -- so nao pode ser 429)
        expect(ultimaResposta.status).not.toBe(429);
      }
    }

    expect(ultimaResposta?.status).toBe(429);
  }, 15_000);

  it('registrar: a 11a tentativa em menos de 1 minuto -> 429 (limite e 10/min)', async () => {
    let ultimaResposta;
    for (let tentativa = 1; tentativa <= 11; tentativa++) {
      ultimaResposta = await request(app.getHttpServer())
        .post('/api/auth/registrar')
        .set('X-API-KEY', chave)
        .send({
          nome: 'Rate Limit Registrar',
          email: `rate.limit.registrar.${tentativa}.${Date.now()}@teste.com`,
          senha: 'Abc12345!',
        });

      if (tentativa <= 10) {
        expect(ultimaResposta.status).not.toBe(429);
      }
    }

    expect(ultimaResposta?.status).toBe(429);
  }, 15_000);
});
