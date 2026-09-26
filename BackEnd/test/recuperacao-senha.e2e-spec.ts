import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configurarAplicacao } from './../src/configurar-aplicacao';
import { EmailSimuladoService } from './../src/auth/email-simulado.service';
import { RecuperacaoSenhaService } from './../src/auth/recuperacao-senha.service';
import { PrismaService } from './../src/prisma/prisma.service';

// Recuperacao de senha: tudo decidido no servidor (codigo com hash, validade, tentativas, uso unico).
// O "e-mail" e simulado, entao aqui trocamos o servico por um que so anota o codigo enviado.
describe('Recuperacao de senha (e2e)', () => {
  let app: INestApplication<App>;
  let chave: string;
  let prisma: PrismaService;
  let recuperacao: RecuperacaoSenhaService;

  const enviados: { email: string; codigo: string }[] = [];
  const ultimoCodigo = (email: string): string => [...enviados].reverse().find((e) => e.email === email)!.codigo;

  const SUFIXO = Date.now();
  const SENHA_ANTIGA = 'Antiga123!';
  const SENHA_NOVA = 'Nova12345@';
  const email = (quem: string) => `recuperacao.${quem}.${SUFIXO}@teste.com`;

  async function criarConta(quem: string, extra: { ativo?: boolean } = {}) {
    return prisma.user.create({
      data: { nome: `Conta ${quem}`, email: email(quem), senha: await bcrypt.hash(SENHA_ANTIGA, 4), ...extra },
    });
  }

  const post = (rota: string, corpo: object) =>
    request(app.getHttpServer()).post(`/api/auth/${rota}`).set('X-API-KEY', chave).send(corpo);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailSimuladoService)
      .useValue({
        enviarCodigoDeRecuperacao: (destino: string, _nome: string, codigo: string) => {
          enviados.push({ email: destino, codigo });
        },
      })
      .compile();
    app = moduleFixture.createNestApplication();
    configurarAplicacao(app);
    await app.init();
    chave = app.get(ConfigService).getOrThrow<string>('API_KEY');
    prisma = app.get(PrismaService);
    recuperacao = app.get(RecuperacaoSenhaService);
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it('e-mail que nao existe: resposta identica a de um existente e nada e enviado', async () => {
    const existe = await criarConta('resposta');
    const a = await post('esqueci-senha', { email: email('naoexiste') }).expect(200);
    const b = await post('esqueci-senha', { email: existe.email }).expect(200);
    expect(a.body).toEqual(b.body);
    expect(enviados.some((e) => e.email === email('naoexiste'))).toBe(false);
    expect(enviados.some((e) => e.email === existe.email)).toBe(true);
  });

  it('fluxo completo: o codigo e guardado so como hash, troca a senha e so vale uma vez', async () => {
    const conta = await criarConta('fluxo');
    await post('esqueci-senha', { email: conta.email }).expect(200);
    const codigo = ultimoCodigo(conta.email);
    expect(codigo).toMatch(/^\d{6}$/);

    const pedido = await prisma.passwordReset.findFirstOrThrow({ where: { usuarioId: conta.id } });
    expect(pedido.codigoHash).not.toBe(codigo); // nunca o codigo em si
    expect(await bcrypt.compare(codigo, pedido.codigoHash)).toBe(true);
    // validade de 15 minutos
    const minutos = (pedido.expiraEm.getTime() - pedido.criadoEm.getTime()) / 60_000;
    expect(minutos).toBeGreaterThan(14);
    expect(minutos).toBeLessThanOrEqual(15.1);

    await post('redefinir-senha', { email: conta.email, codigo, novaSenha: SENHA_NOVA }).expect(200);

    // a senha antiga deixa de valer e a nova passa a valer
    await post('login', { email: conta.email, senha: SENHA_ANTIGA }).expect(401);
    await post('login', { email: conta.email, senha: SENHA_NOVA }).expect(200);

    // uso unico: o mesmo codigo nao funciona de novo
    await post('redefinir-senha', { email: conta.email, codigo, novaSenha: 'Outra12345#' }).expect(400);
  });

  it('corpo invalido -> 400 (codigo fora de 6 digitos, senha fraca, e-mail ruim)', async () => {
    await post('redefinir-senha', { email: email('x'), codigo: '12', novaSenha: SENHA_NOVA }).expect(400);
    await post('redefinir-senha', { email: email('x'), codigo: '123456', novaSenha: 'fraca' }).expect(400);
    await post('esqueci-senha', { email: 'nao-e-email' }).expect(400);
  });

  it('conta desativada nao recebe codigo (mesma resposta generica)', async () => {
    const conta = await criarConta('desativada', { ativo: false });
    const antes = enviados.length;
    const res = await recuperacao.solicitar({ email: conta.email });
    expect(res.mensagem).toContain('Se o e-mail estiver cadastrado');
    expect(enviados.length).toBe(antes);
  });

  it('codigo errado conta tentativa; com 5 erros o codigo e queimado ate o correto e recusado', async () => {
    const conta = await criarConta('tentativas');
    await recuperacao.solicitar({ email: conta.email });
    const codigo = ultimoCodigo(conta.email);
    const errado = codigo === '000000' ? '111111' : '000000';

    for (let i = 0; i < 5; i++) {
      await expect(recuperacao.redefinir({ email: conta.email, codigo: errado, novaSenha: SENHA_NOVA })).rejects.toThrow(
        /inválido ou expirado/,
      );
    }
    const pedido = await prisma.passwordReset.findFirstOrThrow({ where: { usuarioId: conta.id } });
    expect(pedido.tentativas).toBe(5);
    expect(pedido.usadoEm).not.toBeNull();

    // agora nem o codigo certo funciona: precisa pedir outro
    await expect(recuperacao.redefinir({ email: conta.email, codigo, novaSenha: SENHA_NOVA })).rejects.toThrow(
      /inválido ou expirado/,
    );
    const semTrocar = await prisma.user.findUniqueOrThrow({ where: { id: conta.id } });
    expect(await bcrypt.compare(SENHA_ANTIGA, semTrocar.senha)).toBe(true);
  });

  it('codigo expirado nao vale', async () => {
    const conta = await criarConta('expirado');
    await recuperacao.solicitar({ email: conta.email });
    const codigo = ultimoCodigo(conta.email);
    await prisma.passwordReset.updateMany({ where: { usuarioId: conta.id }, data: { expiraEm: new Date(Date.now() - 1000) } });
    await expect(recuperacao.redefinir({ email: conta.email, codigo, novaSenha: SENHA_NOVA })).rejects.toThrow(
      /inválido ou expirado/,
    );
  });

  it('pedir um codigo novo cancela o anterior (so o ultimo funciona)', async () => {
    const conta = await criarConta('novopedido');
    await recuperacao.solicitar({ email: conta.email });
    const primeiro = ultimoCodigo(conta.email);
    await recuperacao.solicitar({ email: conta.email });
    const segundo = ultimoCodigo(conta.email);
    expect(segundo).not.toBe(primeiro);

    await expect(recuperacao.redefinir({ email: conta.email, codigo: primeiro, novaSenha: SENHA_NOVA })).rejects.toThrow();
    await expect(recuperacao.redefinir({ email: conta.email, codigo: segundo, novaSenha: SENHA_NOVA })).resolves.toMatchObject({
      mensagem: expect.stringContaining('sucesso') as string,
    });
  });

  it('limite de 3 pedidos por hora por conta: o 4o nao gera codigo (e a resposta continua igual)', async () => {
    const conta = await criarConta('limite');
    for (let i = 0; i < 3; i++) await recuperacao.solicitar({ email: conta.email });
    const enviadosAntes = enviados.filter((e) => e.email === conta.email).length;
    expect(enviadosAntes).toBe(3);

    const quarto = await recuperacao.solicitar({ email: conta.email });
    expect(quarto.mensagem).toContain('Se o e-mail estiver cadastrado');
    expect(enviados.filter((e) => e.email === conta.email).length).toBe(3);
    expect(await prisma.passwordReset.count({ where: { usuarioId: conta.id } })).toBe(3);
  });
});
