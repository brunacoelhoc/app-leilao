import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configurarAplicacao } from './../src/configurar-aplicacao';

// Antes destes casos a API quebrava com 500: o .trim() do e-mail e o bcrypt esperavam texto.
// Arquivo proprio (app isolado) porque o login tem limite de 10 chamadas por minuto e nao pode
// dividir a contagem com os outros testes de autenticacao
describe('Tipos errados e corpo invalido nunca viram 500 (e2e)', () => {
  let app: INestApplication<App>;
  let chave: string;

  beforeAll(async () => {
    const modulo: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarAplicacao(app);
    await app.init();
    chave = app.get(ConfigService).getOrThrow<string>('API_KEY');
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  const post = (rota: string) => request(app.getHttpServer()).post(`/api/auth/${rota}`).set('X-API-KEY', chave);

  it.each([
    ['e-mail como numero', { email: 123, senha: 'Abc12345!' }],
    ['e-mail como objeto', { email: { $ne: null }, senha: 'x' }],
    ['e-mail como lista', { email: ['a@a.com'], senha: 'x' }],
    ['senha como numero', { email: 'a@a.com', senha: 12345678 }],
    ['senha como objeto', { email: 'a@a.com', senha: { a: 1 } }],
    ['senha com mais de 128 caracteres', { email: 'a@a.com', senha: 'a'.repeat(129) }],
  ])('login com %s -> 400', async (_nome, corpo) => {
    await post('login').send(corpo).expect(400);
  });

  it('esqueci-senha, redefinir-senha e registrar com e-mail que nao e texto -> 400', async () => {
    await post('esqueci-senha').send({ email: 123 }).expect(400);
    await post('redefinir-senha').send({ email: ['a@a.com'], codigo: '123456', novaSenha: 'Abc12345!' }).expect(400);
    await post('registrar').send({ nome: 'Fulano', email: { a: 1 }, senha: 'Abc12345!', aceiteTermos: true }).expect(400);
  });

  it('JSON malformado -> 400 (nao 500)', async () => {
    const resposta = await post('login').set('Content-Type', 'application/json').send('{"email":');
    expect(resposta.status).toBe(400);
  });

  it('corpo grande demais -> 413 (nao 500)', async () => {
    const resposta = await post('login').send({ email: 'a@a.com', senha: 'a'.repeat(2_000_000) });
    expect(resposta.status).toBe(413);
    expect(resposta.body.mensagem).toContain('grande demais');
  });
});
