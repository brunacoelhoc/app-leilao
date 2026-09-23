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
  let tokenPerfil: string;

  const agora = Date.now();
  const EMAIL_BIDDER = `users.bidder.${agora}@teste.com`;
  const EMAIL_ADMIN = `users.admin.${agora}@teste.com`;
  const EMAIL_OUTRO_ADMIN = `users.outro.admin.${agora}@teste.com`;
  // Usuario dedicado aos testes de perfil/senha, para nao mexer na senha do
  // BIDDER acima (os testes de desativar/reativar fazem login com ela)
  const EMAIL_PERFIL = `users.perfil.${agora}@teste.com`;
  const SENHA_TESTE = 'Abc12345!';
  const SENHA_NOVA = 'Nova@12345';

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

    const perfil = await criarUsuario('Perfil Users', EMAIL_PERFIL);
    tokenPerfil = perfil.accessToken;
  }, 30_000); // varios registros/logins reais (bcrypt) -- 5s padrao do Jest e curto demais

  afterAll(async () => {
    // Todo login grava AuditLog (onDelete: Restrict) -- tentativa best-effort
    await prisma.user
      .deleteMany({
        where: {
          email: { in: [EMAIL_BIDDER, EMAIL_ADMIN, EMAIL_OUTRO_ADMIN, EMAIL_PERFIL] },
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

  describe('PATCH /users/me (autoedicao do perfil)', () => {
    const editar = (corpo: object, token = tokenPerfil) =>
      request(app.getHttpServer())
        .patch('/api/users/me')
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${token}`)
        .send(corpo);

    it('sem token -> 401', () => {
      return request(app.getHttpServer())
        .patch('/api/users/me')
        .set('X-API-KEY', chave)
        .send({ nome: 'Sem Token' })
        .expect(401);
    });

    it('atualiza nome, telefone, endereco, cpf e avatar -> 200, e o GET /me reflete', async () => {
      const resposta = await editar({
        nome: 'Perfil Atualizado',
        telefone: '11987654321',
        endereco: 'Rua das Antiguidades, 120',
        cpf: '12345678900',
        avatarUrl: 'raposa',
      }).expect(200);

      expect(resposta.body.nome).toBe('Perfil Atualizado');
      expect(resposta.body.telefone).toBe('11987654321');
      expect(resposta.body.avatarUrl).toBe('raposa');
      expect(resposta.body.senha).toBeUndefined();

      const me = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenPerfil}`)
        .expect(200);
      expect(me.body.cpf).toBe('12345678900');
    });

    it('telefone com formato invalido -> 400', () => {
      return editar({ telefone: '123' }).expect(400);
    });

    it('cpf com formato invalido -> 400', () => {
      return editar({ cpf: '123.456' }).expect(400);
    });

    it('nao da para se promover: papel no corpo -> 400 (campo nao permitido)', () => {
      return editar({ papel: 'ADMIN' }).expect(400);
    });

    it('nao da para mexer na senha por aqui -> 400 (campo nao permitido)', () => {
      return editar({ senha: 'Hack@12345' }).expect(400);
    });

    it('trocar o e-mail sem a senha atual -> 400', async () => {
      const resposta = await editar({ email: `novo.${Date.now()}@teste.com` });
      expect(resposta.status).toBe(400);
      expect(resposta.body.mensagem).toBe('Para trocar o e-mail, informe a senha atual correta');
    });

    it('trocar o e-mail com senha atual errada -> 400', () => {
      return editar({ email: `novo.${Date.now()}@teste.com`, senhaAtual: 'Errada@123' }).expect(400);
    });

    it('trocar para um e-mail que ja existe -> 409', async () => {
      const resposta = await editar({ email: EMAIL_BIDDER, senhaAtual: SENHA_TESTE });
      expect(resposta.status).toBe(409);
    });

    it('troca o e-mail com a senha certa -> 200; o login passa a usar o novo (e volta ao antigo)', async () => {
      const novo = `trocado.${Date.now()}@teste.com`;
      const resposta = await editar({ email: novo, senhaAtual: SENHA_TESTE }).expect(200);
      expect(resposta.body.email).toBe(novo);
      expect(resposta.body.senhaAtual).toBeUndefined();

      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-API-KEY', chave)
        .send({ email: novo, senha: SENHA_TESTE });
      expect(login.status).toBe(200);

      // volta ao e-mail original para nao atrapalhar os testes seguintes
      await editar({ email: EMAIL_PERFIL, senhaAtual: SENHA_TESTE }).expect(200);
    });
  });

  describe('PATCH /users/me/senha', () => {
    const trocar = (corpo: object) =>
      request(app.getHttpServer())
        .patch('/api/users/me/senha')
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenPerfil}`)
        .send(corpo);

    it('senha atual errada -> 400', async () => {
      const resposta = await trocar({ senhaAtual: 'Errada@123', novaSenha: SENHA_NOVA });
      expect(resposta.status).toBe(400);
      expect(resposta.body.mensagem).toBe('Senha atual incorreta');
    });

    it('nova senha fraca -> 400', () => {
      return trocar({ senhaAtual: SENHA_TESTE, novaSenha: 'fraca' }).expect(400);
    });

    it('troca de verdade -> 204; a senha antiga para de funcionar e a nova passa a funcionar', async () => {
      await trocar({ senhaAtual: SENHA_TESTE, novaSenha: SENHA_NOVA }).expect(204);

      const loginAntigo = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-API-KEY', chave)
        .send({ email: EMAIL_PERFIL, senha: SENHA_TESTE });
      expect(loginAntigo.status).toBe(401);

      const loginNovo = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-API-KEY', chave)
        .send({ email: EMAIL_PERFIL, senha: SENHA_NOVA });
      expect(loginNovo.status).toBe(200);
    });
  });

  describe('dados sensiveis: mascarados na lista, completos so no detalhe do ADMIN', () => {
    it('GET /users devolve e-mail/telefone/cpf/endereco MASCARADOS', async () => {
      // deixa o usuario dedicado com dados completos (o teste de perfil pode rodar depois)
      await request(app.getHttpServer())
        .patch('/api/users/me')
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenPerfil}`)
        .send({ telefone: '11987654321', cpf: '12345678900', endereco: 'Rua das Flores, 10' })
        .expect(200);

      const resposta = await request(app.getHttpServer())
        .get('/api/users?limite=100')
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      const lista = resposta.body.dados as { email: string; cpf: string | null; telefone: string | null }[];
      expect(lista.some((u) => u.email === EMAIL_PERFIL)).toBe(false); // e-mail real nao sai na lista
      const comCpf = lista.find((u) => u.cpf !== null);
      expect(comCpf?.cpf).toMatch(/^•+\.•+\.•+-\d{2}$/);
      expect(JSON.stringify(resposta.body)).not.toContain('12345678900');
    });

    it('GET /users/:id (ADMIN) devolve o dado completo e grava auditoria', async () => {
      const me = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenPerfil}`);
      const id = me.body.id as string;

      const resposta = await request(app.getHttpServer())
        .get(`/api/users/${id}`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);
      expect(resposta.body.email).toBe(EMAIL_PERFIL);
      expect(resposta.body.cpf).toBe('12345678900');
      expect(resposta.body.senha).toBeUndefined();

      const auditoria = await prisma.auditLog.findFirst({
        where: { acao: 'USUARIO_DADOS_VISTOS', entidadeId: id },
      });
      expect(auditoria).not.toBeNull();
    });

    it('GET /users/:id sem ser ADMIN -> 403; id inexistente -> 404; malformado -> 400', async () => {
      const id = idOutroAdmin;
      await request(app.getHttpServer())
        .get(`/api/users/${id}`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenBidder}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/users/24afe5fe-9857-44e7-866c-c814971433ea')
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(404);
      await request(app.getHttpServer())
        .get('/api/users/nao-e-uuid')
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
