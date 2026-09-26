import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configurarAplicacao } from './../src/configurar-aplicacao';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let chave: string;
  let prisma: PrismaService;

  // Precisa ser unico a cada execucao: como o login grava auditoria (nunca
  // apagavel), o usuario de um teste anterior pode ficar preso no banco, e um
  // e-mail fixo faria o "registrar" desta rodada falhar com 409 (duplicado)
  const EMAIL_TESTE = `auth.e2e.${Date.now()}@teste.com`;
  const SENHA_TESTE = 'Abc12345!';

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
    // Todo login grava uma linha em AuditLog (auditoria), que nunca pode ser
    // apagada -- por isso este usuario, que fez login varias vezes neste
    // teste, provavelmente ficou "preso" para sempre (onDelete: Restrict).
    // Tentativa best-effort, sem quebrar o teste se nao der
    await prisma.user
      .deleteMany({ where: { email: EMAIL_TESTE } })
      .catch(() => undefined);
    await app.close();
  });

  describe('fluxo principal: registrar e logar', () => {
    it('POST /auth/registrar cria a conta como BIDDER, sem a senha na resposta (201)', async () => {
      const resposta = await request(app.getHttpServer())
        .post('/api/auth/registrar')
        .set('X-API-KEY', chave)
        .send({ nome: 'Auth E2E', email: EMAIL_TESTE, senha: SENHA_TESTE, aceiteTermos: true })
        .expect(201);

      expect(resposta.body.papel).toBe('BIDDER');
      expect(resposta.body.ativo).toBe(true);
      expect(resposta.body.senha).toBeUndefined();
      // O servidor grava quando os termos foram aceitos
      expect(resposta.body.termosAceitosEm).toBeTruthy();
    });

    it('registro sem aceitar os termos -> 400 (regra do servidor, nao da tela)', async () => {
      const semAceite = { nome: 'Sem Aceite', email: 'sem.aceite.e2e@teste.com', senha: SENHA_TESTE };
      await request(app.getHttpServer()).post('/api/auth/registrar').set('X-API-KEY', chave).send(semAceite).expect(400);
      await request(app.getHttpServer())
        .post('/api/auth/registrar')
        .set('X-API-KEY', chave)
        .send({ ...semAceite, aceiteTermos: false })
        .expect(400);
    });

    it('POST /auth/login com a mesma senha devolve o token (200, nao 201)', async () => {
      const resposta = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-API-KEY', chave)
        .send({ email: EMAIL_TESTE, senha: SENHA_TESTE })
        .expect(200);

      expect(resposta.body.accessToken).toBeDefined();
      expect(resposta.body.usuario.email).toBe(EMAIL_TESTE);
      expect(resposta.body.usuario.senha).toBeUndefined();
    });
  });

  describe('body invalido -> 400', () => {
    it('registro com nome curto, e-mail invalido e senha fraca -> 400 com uma mensagem por campo', async () => {
      const resposta = await request(app.getHttpServer())
        .post('/api/auth/registrar')
        .set('X-API-KEY', chave)
        .send({ nome: 'A', email: 'nao-e-email', senha: '123', aceiteTermos: true })
        .expect(400);

      expect(resposta.body.mensagem).toEqual([
        'nome deve ter no mínimo 3 caracteres',
        'email deve ser um e-mail válido',
        'senha deve ter no mínimo 8 caracteres',
      ]);
    });

    it('login sem enviar a senha -> 400', () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-API-KEY', chave)
        .send({ email: EMAIL_TESTE })
        .expect(400);
    });
  });

  describe('conflito de negocio -> 409', () => {
    it('registrar com um e-mail ja cadastrado -> 409', () => {
      return request(app.getHttpServer())
        .post('/api/auth/registrar')
        .set('X-API-KEY', chave)
        .send({ nome: 'Outra Pessoa', email: EMAIL_TESTE, senha: SENHA_TESTE, aceiteTermos: true })
        .expect(409);
    });
  });

  describe('credenciais invalidas -> 401', () => {
    it('login com senha errada -> 401, mensagem generica', async () => {
      const resposta = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-API-KEY', chave)
        .send({ email: EMAIL_TESTE, senha: 'SenhaErrada9!' })
        .expect(401);

      expect(resposta.body.mensagem).toBe('Credenciais inválidas');
    });

    it('login com e-mail inexistente -> 401, MESMA mensagem generica', async () => {
      const resposta = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-API-KEY', chave)
        .send({ email: 'nao-existe-de-verdade@teste.com', senha: 'qualquer coisa' })
        .expect(401);

      expect(resposta.body.mensagem).toBe('Credenciais inválidas');
    });
  });

  describe('conta desativada -> 403', () => {
    it('login com a senha certa mas a conta desativada -> 403', async () => {
      await prisma.user.update({
        where: { email: EMAIL_TESTE },
        data: { ativo: false },
      });

      const resposta = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-API-KEY', chave)
        .send({ email: EMAIL_TESTE, senha: SENHA_TESTE })
        .expect(403);

      expect(resposta.body.mensagem).toContain('desativada');

      await prisma.user.update({
        where: { email: EMAIL_TESTE },
        data: { ativo: true },
      });
    });
  });

  describe('nao e possivel virar ADMIN pelo registro', () => {
    it('mandar "papel: ADMIN" no body -> 400 (whitelist recusa o campo)', () => {
      return request(app.getHttpServer())
        .post('/api/auth/registrar')
        .set('X-API-KEY', chave)
        .send({
          nome: 'Tentando Admin',
          email: 'tentando.admin.e2e@teste.com',
          senha: SENHA_TESTE,
          aceiteTermos: true,
          papel: 'ADMIN',
        })
        .expect(400);
    });
  });
});
