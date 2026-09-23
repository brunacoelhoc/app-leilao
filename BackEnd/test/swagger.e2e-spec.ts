import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configurarAplicacao } from './../src/configurar-aplicacao';
import { configurarSwagger } from './../src/configurar-swagger';

// Este e o UNICO arquivo de teste que tambem chama configurarSwagger (os
// outros so chamam configurarAplicacao) -- exatamente como o main.ts real,
// para provar de verdade o que a API em produção faz. Fica separado dos
// demais para nao gerar o documento OpenAPI em toda suite, so aqui
describe('Swagger (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configurarAplicacao(app);
    configurarSwagger(app);
    await app.init();
  }, 15_000);

  afterAll(async () => {
    await app.close();
  });

  it('GET /docs abre sem X-API-KEY (a documentacao nao e uma rota de negocio)', () => {
    return request(app.getHttpServer()).get('/docs').expect(200);
  });

  it('GET /docs-json abre sem X-API-KEY e descreve a API real', async () => {
    const resposta = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);

    const documento = resposta.body as {
      components: { securitySchemes: Record<string, unknown> };
      paths: Record<string, Record<string, { security?: unknown[] }>>;
    };

    // Os dois esquemas de seguranca existem (api-key e jwt)
    expect(Object.keys(documento.components.securitySchemes).sort()).toEqual([
      'api-key',
      'jwt',
    ]);

    // Rota publica: so exige api-key
    expect(documento.paths['/api/auth/login']?.post?.security).toEqual([
      { 'api-key': [] },
    ]);
    // Rota autenticada: exige api-key E jwt
    expect(documento.paths['/api/auctions']?.post?.security).toEqual([
      { 'api-key': [] },
      { jwt: [] },
    ]);
  });

  it('rota de negocio real (/api/saude) continua exigindo X-API-KEY normalmente -- so o Swagger e a excecao', () => {
    return request(app.getHttpServer()).get('/api/saude').expect(401);
  });
});
