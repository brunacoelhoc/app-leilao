import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { CepService } from './../src/cep/cep.service';
import { configurarAplicacao } from './../src/configurar-aplicacao';

describe('CEP (e2e)', () => {
  let app: INestApplication<App>;
  let chave: string;
  const buscar = jest.fn();

  beforeAll(async () => {
    // ViaCEP e mockado: o teste nao pode depender de internet
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CepService)
      .useValue({ buscar })
      .compile();
    app = modulo.createNestApplication();
    configurarAplicacao(app);
    await app.init();
    chave = app.get(ConfigService).getOrThrow<string>('API_KEY');
  });

  afterAll(async () => {
    await app.close();
  });

  const consultar = (cep: string) => request(app.getHttpServer()).get(`/api/cep/${cep}`).set('X-API-KEY', chave);

  it('devolve o endereco do CEP (aceita hifen)', async () => {
    buscar.mockResolvedValueOnce({ logradouro: 'Avenida Paulista', cidade: 'São Paulo', uf: 'SP' });
    const res = await consultar('01310-100').expect(200);
    expect(res.body).toEqual({ logradouro: 'Avenida Paulista', cidade: 'São Paulo', uf: 'SP' });
    expect(buscar).toHaveBeenCalledWith('01310100');
  });

  it('CEP mal formado -> 400 sem consultar o ViaCEP', async () => {
    buscar.mockClear();
    await consultar('123').expect(400);
    expect(buscar).not.toHaveBeenCalled();
  });

  it('exige a X-API-KEY', async () => {
    await request(app.getHttpServer()).get('/api/cep/01310100').expect(401);
  });
});
