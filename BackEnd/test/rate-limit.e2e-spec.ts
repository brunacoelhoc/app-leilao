import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configurarAplicacao } from './../src/configurar-aplicacao';

describe('Rate limiting (e2e)', () => {
  let app: INestApplication<App>;
  let chaveCorreta: string;

  beforeEach(async () => {
    // O ConfigModule le o RATE_LIMIT_MAX direto do arquivo .env, entao mudar
    // o process.env em tempo de teste nao adianta: aqui usamos um limite
    // baixo (5) so para este teste, sem mexer no .env real.
    // Guarda o metodo ORIGINAL antes de substituir, senao o mock chamaria a si mesmo.
    // eslint-disable-next-line @typescript-eslint/unbound-method -- guardado so para chamar via .apply(this, ...) logo abaixo
    const getOrThrowOriginal = ConfigService.prototype.getOrThrow as (
      this: ConfigService,
      chave: string,
      ...resto: unknown[]
    ) => unknown;

    jest
      .spyOn(ConfigService.prototype, 'getOrThrow')
      .mockImplementation(function (
        this: ConfigService,
        chave: string,
        ...resto: unknown[]
      ) {
        if (chave === 'RATE_LIMIT_MAX') return 5 as never;
        return getOrThrowOriginal.apply(this, [chave, ...resto]);
      });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configurarAplicacao(app);
    await app.init();

    chaveCorreta = app.get(ConfigService).getOrThrow<string>('API_KEY');
  }, 15_000);

  afterEach(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  it('bloqueia (429) apos passar do limite, mesmo com a chave certa', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .get('/api/saude')
        .set('X-API-KEY', chaveCorreta)
        .expect(200);
    }

    const bloqueado = await request(app.getHttpServer())
      .get('/api/saude')
      .set('X-API-KEY', chaveCorreta)
      .expect(429);

    expect((bloqueado.body as { erro: string }).erro).toBe(
      'Muitas requisicoes',
    );
    expect(bloqueado.headers['retry-after']).toBeDefined();
  });

  it('tambem bloqueia (429) quem fica tentando SEM a chave (protege contra forca bruta)', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).get('/api/saude').expect(401);
    }

    await request(app.getHttpServer()).get('/api/saude').expect(429);
  });
});
