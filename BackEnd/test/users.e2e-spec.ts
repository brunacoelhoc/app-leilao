import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configurarAplicacao } from './../src/configurar-aplicacao';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let chave: string;
  let prisma: PrismaService;
  let tokenBidder: string;
  let tokenAdmin: string;
  let tokenOutroAdmin: string;
  let idBidder: string;
  let idOutroAdmin: string;

  const agora = Date.now();
  const EMAIL_BIDDER = `users.bidder.${agora}@teste.com`;
  const EMAIL_ADMIN = `users.admin.${agora}@teste.com`;
  const EMAIL_OUTRO_ADMIN = `users.outro.admin.${agora}@teste.com`;
  const SENHA_TESTE = 'Abc12345!';

  async function criarUsuario(nome: string, email: string, papel?: string) {
    await request(app.getHttpServer())
      .post('/api/auth/registrar')
      .set('X-API-KEY', chave)
      .send({ nome, email, senha: SENHA_TESTE });
    if (papel) {
      await prisma.user.update({ where: { email }, data: { papel } });
    }
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-API-KEY', chave)
      .send({ email, senha: SENHA_TESTE });
    return login.body as { accessToken: string; usuario: { id: string } };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configurarAplicacao(app);
    await app.init();

    chave = app.get(ConfigService).getOrThrow<string>('API_KEY');
    prisma = app.get(PrismaService);

    const bidder = await criarUsuario('Bidder Users', EMAIL_BIDDER);
    tokenBidder = bidder.accessToken;
    idBidder = bidder.usuario.id;

    const admin = await criarUsuario('Admin Users', EMAIL_ADMIN, 'ADMIN');
    tokenAdmin = admin.accessToken;

    const outroAdmin = await criarUsuario(
      'Outro Admin Users',
      EMAIL_OUTRO_ADMIN,
      'ADMIN',
    );
    tokenOutroAdmin = outroAdmin.accessToken;
    idOutroAdmin = outroAdmin.usuario.id;
  }, 30_000); // varios registros/logins reais (bcrypt) -- 5s padrao do Jest e curto demais

  afterAll(async () => {
    // Todo login grava AuditLog (onDelete: Restrict) -- tentativa best-effort
    await prisma.user
      .deleteMany({
        where: {
          email: { in: [EMAIL_BIDDER, EMAIL_ADMIN, EMAIL_OUTRO_ADMIN] },
        },
      })
      .catch(() => undefined);
    await app.close();
  });

  describe('GET /users/me', () => {
    it('sem token -> 401', () => {
      return request(app.getHttpServer())
        .get('/api/users/me')
        .set('X-API-KEY', chave)
        .expect(401);
    });

    it('com token -> 200, devolve o proprio perfil sem a senha', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenBidder}`)
        .expect(200);

      expect(resposta.body.id).toBe(idBidder);
      expect(resposta.body.email).toBe(EMAIL_BIDDER);
      expect(resposta.body.senha).toBeUndefined();
    });
  });

  describe('GET /users (gestao pelo ADMIN)', () => {
    it('BIDDER tentando listar -> 403', () => {
      return request(app.getHttpServer())
        .get('/api/users')
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenBidder}`)
        .expect(403);
    });

    it('sem token -> 401', () => {
      return request(app.getHttpServer())
        .get('/api/users')
        .set('X-API-KEY', chave)
        .expect(401);
    });

    it('ADMIN lista todos os usuarios, paginado, sem nenhuma senha na resposta', async () => {
      // limite alto: o banco de dev acumula usuarios de varias rodadas de
      // e2e, entao o padrao (20) poderia nao trazer o idBidder recem-criado
      const resposta = await request(app.getHttpServer())
        .get('/api/users?limite=100')
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      expect(resposta.body.pagina).toBe(1);
      expect(resposta.body.limite).toBe(100);
      const usuarios = resposta.body.dados as { id: string; senha?: string }[];
      expect(Array.isArray(usuarios)).toBe(true);
      expect(usuarios.some((u) => u.id === idBidder)).toBe(true);
      expect(usuarios.every((u) => u.senha === undefined)).toBe(true);
    });

    it('filtro ?papel=BIDDER devolve so usuarios com esse papel', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/api/users?papel=BIDDER&limite=100')
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      const usuarios = resposta.body.dados as { id: string; papel: string }[];
      expect(usuarios.some((u) => u.id === idBidder)).toBe(true);
      expect(usuarios.every((u) => u.papel === 'BIDDER')).toBe(true);
    });

    it('filtro ?ativo=true devolve so usuarios ativos', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/api/users?ativo=true')
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      const usuarios = resposta.body.dados as { ativo: boolean }[];
      expect(usuarios.length).toBeGreaterThan(0);
      expect(usuarios.every((u) => u.ativo === true)).toBe(true);
    });

    it('filtro ?papel=INVALIDO -> 400', () => {
      return request(app.getHttpServer())
        .get('/api/users?papel=INVALIDO')
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(400);
    });

    it('?limite=1 devolve no maximo 1 usuario', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/api/users?limite=1')
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      expect(resposta.body.dados.length).toBeLessThanOrEqual(1);
    });

    it('?pagina=0 -> 400', () => {
      return request(app.getHttpServer())
        .get('/api/users?pagina=0')
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(400);
    });
  });

  describe('PATCH /users/:id/desativar e /reativar (gestao pelo ADMIN)', () => {
    it('BIDDER tentando desativar outro usuario -> 403', () => {
      return request(app.getHttpServer())
        .patch(`/api/users/${idOutroAdmin}/desativar`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenBidder}`)
        .expect(403);
    });

    it('ADMIN tentando desativar a propria conta -> 409', async () => {
      const resposta = await request(app.getHttpServer())
        .patch(`/api/users/${idOutroAdmin}/desativar`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenOutroAdmin}`);

      expect(resposta.status).toBe(409);
      expect(resposta.body.mensagem).toContain('propria conta');
    });

    it('usuario inexistente (uuid valido) -> 404', () => {
      return request(app.getHttpServer())
        .patch('/api/users/24afe5fe-9857-44e7-866c-c814971433ea/desativar')
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(404);
    });

    it('id malformado -> 400 em portugues', async () => {
      const resposta = await request(app.getHttpServer())
        .patch('/api/users/nao-e-um-uuid/desativar')
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(400);
      expect(resposta.body.mensagem).toBe('id deve ser um uuid valido');
    });

    it('ADMIN desativa outro usuario -> 200, ativo=false; login passa a dar 403', async () => {
      const resposta = await request(app.getHttpServer())
        .patch(`/api/users/${idBidder}/desativar`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      expect(resposta.body.ativo).toBe(false);

      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-API-KEY', chave)
        .send({ email: EMAIL_BIDDER, senha: SENHA_TESTE });
      expect(login.status).toBe(403);
    });

    it('ADMIN reativa o mesmo usuario -> 200, ativo=true; login volta a funcionar', async () => {
      const resposta = await request(app.getHttpServer())
        .patch(`/api/users/${idBidder}/reativar`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      expect(resposta.body.ativo).toBe(true);

      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-API-KEY', chave)
        .send({ email: EMAIL_BIDDER, senha: SENHA_TESTE });
      expect(login.status).toBe(200);
    });
  });
});
