import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configurarAplicacao } from './../src/configurar-aplicacao';
import { EmailSimuladoService } from './../src/auth/email-simulado.service';
import { RecuperacaoSenhaService } from './../src/auth/recuperacao-senha.service';
import { SessaoService } from './../src/auth/sessao.service';
import { PrismaService } from './../src/prisma/prisma.service';

// Sessoes: access token curto + refresh token rotativo + logout que invalida. Tudo decidido no servidor.
describe('Sessoes, refresh token e logout (e2e)', () => {
  let app: INestApplication<App>;
  let chave: string;
  let prisma: PrismaService;
  let sessoes: SessaoService;
  let jwt: JwtService;
  let recuperacao: RecuperacaoSenhaService;

  const codigos: { email: string; codigo: string }[] = [];
  const SUFIXO = Date.now();
  const SENHA = 'Sessao123!';
  const NOVA_SENHA = 'Nova12345@';

  const api = (metodo: 'get' | 'post' | 'patch', rota: string, token?: string) => {
    const req = request(app.getHttpServer())[metodo](`/api${rota}`).set('X-API-KEY', chave);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  async function criarConta(quem: string, extra: { ativo?: boolean } = {}) {
    return prisma.user.create({
      data: { nome: `Sessao ${quem}`, email: `sessao.${quem}.${SUFIXO}@teste.com`, senha: await bcrypt.hash(SENHA, 4), ...extra },
    });
  }

  // Abre uma sessao direto pelo servico (sem passar pelo limite de 10 logins por minuto)
  async function abrirSessao(usuario: { id: string; papel: string }) {
    const { sessaoId, refreshToken } = await sessoes.criar(usuario.id);
    const accessToken = jwt.sign({ sub: usuario.id, papel: usuario.papel, sid: sessaoId });
    return { sessaoId, accessToken, refreshToken };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailSimuladoService)
      .useValue({
        enviarCodigoDeRecuperacao: (email: string, _nome: string, codigo: string) => {
          codigos.push({ email, codigo });
        },
      })
      .compile();
    app = moduleFixture.createNestApplication();
    configurarAplicacao(app);
    await app.init();
    chave = app.get(ConfigService).getOrThrow<string>('API_KEY');
    prisma = app.get(PrismaService);
    sessoes = app.get(SessaoService);
    jwt = app.get(JwtService);
    recuperacao = app.get(RecuperacaoSenhaService);
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it('login devolve access token E refresh token; o servidor guarda so o hash do refresh', async () => {
    const conta = await criarConta('login');
    const res = await api('post', '/auth/login').send({ email: conta.email, senha: SENHA }).expect(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toMatch(/^[0-9a-f-]{36}\.[0-9a-f]{64}$/);
    await api('get', '/users/me', res.body.accessToken).expect(200);

    const [sessaoId, segredo] = (res.body.refreshToken as string).split('.');
    const sessao = await prisma.session.findUniqueOrThrow({ where: { id: sessaoId } });
    expect(sessao.refreshHash).not.toBe(segredo); // nunca o segredo em si
    expect(sessao.revogadaEm).toBeNull();
    const dias = (sessao.expiraEm.getTime() - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(6.9);
  });

  it('refresh: troca o par (rotacao) e o access novo funciona', async () => {
    const conta = await criarConta('refresh');
    const s = await abrirSessao(conta);
    const res = await api('post', '/auth/refresh').send({ refreshToken: s.refreshToken }).expect(200);
    expect(res.body.refreshToken).not.toBe(s.refreshToken);
    expect(res.body.usuario.email).toBe(conta.email);
    await api('get', '/users/me', res.body.accessToken).expect(200);
    // e o novo refresh token tambem renova
    await api('post', '/auth/refresh').send({ refreshToken: res.body.refreshToken }).expect(200);
  });

  it('reuso de um refresh token JA USADO (possivel roubo) derruba a sessao inteira', async () => {
    const conta = await criarConta('reuso');
    const s = await abrirSessao(conta);
    const r1 = await api('post', '/auth/refresh').send({ refreshToken: s.refreshToken }).expect(200);

    // alguem apresenta o refresh token antigo de novo
    await api('post', '/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);

    // resultado: nem o par novo, nem o access token da sessao funcionam mais
    await api('post', '/auth/refresh').send({ refreshToken: r1.body.refreshToken }).expect(401);
    await api('get', '/users/me', r1.body.accessToken).expect(401);
    const sessao = await prisma.session.findUniqueOrThrow({ where: { id: s.sessaoId } });
    expect(sessao.revogadaEm).not.toBeNull();
  });

  it('logout invalida o access token na hora e o refresh token da mesma sessao', async () => {
    const conta = await criarConta('logout');
    const s = await abrirSessao(conta);
    await api('get', '/users/me', s.accessToken).expect(200);

    await api('post', '/auth/logout', s.accessToken).expect(204);

    const depois = await api('get', '/users/me', s.accessToken).expect(401);
    expect(depois.body.mensagem).toMatch(/Sessão encerrada/);
    await api('post', '/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
    // logout de novo (ja sem sessao) e sem token -> 401
    await api('post', '/auth/logout', s.accessToken).expect(401);
    await api('post', '/auth/logout').expect(401);
  });

  it('logout derruba so a PROPRIA sessao: a de outro aparelho continua', async () => {
    const conta = await criarConta('doisaparelhos');
    const a = await abrirSessao(conta);
    const b = await abrirSessao(conta);
    await api('post', '/auth/logout', a.accessToken).expect(204);
    await api('get', '/users/me', b.accessToken).expect(200);
  });

  it('trocar a senha derruba as OUTRAS sessoes e mantem a atual', async () => {
    const conta = await criarConta('trocasenha');
    const atual = await abrirSessao(conta);
    const outra = await abrirSessao(conta);

    await api('patch', '/users/me/senha', atual.accessToken).send({ senhaAtual: SENHA, novaSenha: NOVA_SENHA }).expect(204);

    await api('get', '/users/me', atual.accessToken).expect(200);
    await api('get', '/users/me', outra.accessToken).expect(401);
    await api('post', '/auth/refresh').send({ refreshToken: outra.refreshToken }).expect(401);
  });

  it('redefinir a senha (recuperacao) derruba TODAS as sessoes', async () => {
    const conta = await criarConta('recuperou');
    const a = await abrirSessao(conta);
    const b = await abrirSessao(conta);

    await recuperacao.solicitar({ email: conta.email });
    const { codigo } = [...codigos].reverse().find((c) => c.email === conta.email)!;
    await recuperacao.redefinir({ email: conta.email, codigo, novaSenha: NOVA_SENHA });

    await api('get', '/users/me', a.accessToken).expect(401);
    await api('get', '/users/me', b.accessToken).expect(401);
    await api('post', '/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
  });

  it('sessao expirada (7 dias sem uso) nao vale nem para acessar nem para renovar', async () => {
    const conta = await criarConta('expirada');
    const s = await abrirSessao(conta);
    await prisma.session.update({ where: { id: s.sessaoId }, data: { expiraEm: new Date(Date.now() - 1000) } });
    await api('get', '/users/me', s.accessToken).expect(401);
    await api('post', '/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
  });

  it('token sem sessao (formato antigo) e recusado; refresh invalido -> 401; corpo ruim -> 400', async () => {
    const conta = await criarConta('semsessao');
    const semSid = jwt.sign({ sub: conta.id, papel: conta.papel });
    await api('get', '/users/me', semSid).expect(401);

    await api('post', '/auth/refresh').send({ refreshToken: 'lixo' }).expect(401);
    await api('post', '/auth/refresh').send({ refreshToken: `${conta.id}.${'a'.repeat(64)}` }).expect(401);
    await api('post', '/auth/refresh').send({}).expect(400);
  });

  it('conta desativada nao renova a sessao (e o token dela tambem deixa de valer)', async () => {
    const conta = await criarConta('desativada');
    const s = await abrirSessao(conta);
    await prisma.user.update({ where: { id: conta.id }, data: { ativo: false } });
    await api('post', '/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
    await api('get', '/users/me', s.accessToken).expect(401);
  });
});
