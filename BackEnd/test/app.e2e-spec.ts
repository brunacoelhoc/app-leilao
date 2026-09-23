import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configurarAplicacao } from './../src/configurar-aplicacao';

describe('Infraestrutura da API (e2e)', () => {
  let app: INestApplication<App>;
  let chaveCorreta: string;
  let origemDoFront: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mesma configuracao da producao: prefixo /api, Helmet, CORS, ValidationPipe...
    configurarAplicacao(app);
    await app.init();

    // Pega valores do .env (sem escrever a chave no teste)
    const config = app.get(ConfigService);
    chaveCorreta = config.getOrThrow<string>('API_KEY');
    origemDoFront = config.getOrThrow<string>('FRONTEND_URL');
  }, 15_000);

  describe('X-API-KEY', () => {
    it('bloqueia (401) quando nao envia a chave, no formato padrao de erro', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/api/saude')
        .expect(401);

      expect(Object.keys(resposta.body as object).sort()).toEqual([
        'caminho',
        'dataHora',
        'erro',
        'mensagem',
        'statusCode',
      ]);
    });

    it('bloqueia (401) quando a chave esta errada', () => {
      return request(app.getHttpServer())
        .get('/api/saude')
        .set('X-API-KEY', 'chave-errada')
        .expect(401);
    });

    it('libera (200) quando a chave esta certa e confere o banco', () => {
      return request(app.getHttpServer())
        .get('/api/saude')
        .set('X-API-KEY', chaveCorreta)
        .expect(200)
        .expect((resposta) => {
          expect((resposta.body as { status: string }).status).toBe('ok');
          expect((resposta.body as { banco: string }).banco).toBe('conectado');
        });
    });
  });

  describe('prefixo /api e rotas inexistentes', () => {
    it('rota inexistente dentro de /api devolve 404 em portugues, com o caminho completo', () => {
      return request(app.getHttpServer())
        .get('/api/rota-que-nao-existe?token=segredo')
        .set('X-API-KEY', chaveCorreta)
        .expect(404)
        .expect((resposta) => {
          const corpo = resposta.body as { mensagem: string; caminho: string };
          expect(corpo.mensagem).toBe('Rota nao encontrada');
          // Com o /api e sem a query string (que pode ter segredos)
          expect(corpo.caminho).toBe('/api/rota-que-nao-existe');
        });
    });

    it('a rota sem o prefixo /api nao existe (404)', () => {
      return request(app.getHttpServer())
        .get('/saude')
        .set('X-API-KEY', chaveCorreta)
        .expect(404);
    });
  });

  describe('X-Request-Id', () => {
    it('todas as respostas trazem o X-Request-Id, inclusive o 401 do guard e o 404', async () => {
      const formatoUuid = /^[0-9a-f-]{36}$/;

      const ok = await request(app.getHttpServer())
        .get('/api/saude')
        .set('X-API-KEY', chaveCorreta)
        .expect(200);
      const semChave = await request(app.getHttpServer())
        .get('/api/saude')
        .expect(401);
      const naoExiste = await request(app.getHttpServer())
        .get('/api/rota-que-nao-existe')
        .set('X-API-KEY', chaveCorreta)
        .expect(404);

      expect(ok.headers['x-request-id']).toMatch(formatoUuid);
      expect(semChave.headers['x-request-id']).toMatch(formatoUuid);
      expect(naoExiste.headers['x-request-id']).toMatch(formatoUuid);
    });

    it('cada requisicao recebe um X-Request-Id diferente', async () => {
      const primeira = await request(app.getHttpServer())
        .get('/api/saude')
        .set('X-API-KEY', chaveCorreta);
      const segunda = await request(app.getHttpServer())
        .get('/api/saude')
        .set('X-API-KEY', chaveCorreta);

      expect(primeira.headers['x-request-id']).not.toBe(
        segunda.headers['x-request-id'],
      );
    });
  });

  describe('seguranca dos cabecalhos (Helmet e CORS)', () => {
    it('Helmet ativo e sem o cabecalho X-Powered-By', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/api/saude')
        .set('X-API-KEY', chaveCorreta);

      expect(resposta.headers['x-content-type-options']).toBe('nosniff');
      expect(resposta.headers['x-powered-by']).toBeUndefined();
    });

    it('CORS libera so a origem do front e deixa ler o X-Request-Id', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/api/saude')
        .set('X-API-KEY', chaveCorreta)
        .set('Origin', origemDoFront);

      expect(resposta.headers['access-control-allow-origin']).toBe(
        origemDoFront,
      );
      expect(resposta.headers['access-control-expose-headers']).toContain(
        'X-Request-Id',
      );
    });

    it('CORS nao libera outra origem', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/api/saude')
        .set('X-API-KEY', chaveCorreta)
        .set('Origin', 'http://site-malicioso.com');

      expect(resposta.headers['access-control-allow-origin']).not.toBe(
        'http://site-malicioso.com',
      );
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
