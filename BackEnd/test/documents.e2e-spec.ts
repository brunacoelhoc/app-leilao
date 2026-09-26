import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { unlink } from 'fs/promises';
import { join } from 'path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { CepService } from './../src/cep/cep.service';
import { cepFalso } from './cep-falso';
import { configurarAplicacao } from './../src/configurar-aplicacao';
import { PrismaService } from './../src/prisma/prisma.service';
import { PERFIL_COMPLETO } from './perfil-teste';

describe('Documents (e2e)', () => {
  let app: INestApplication<App>;
  let chave: string;
  let prisma: PrismaService;
  let tokenSeller: string;
  let tokenOutroSeller: string;
  let tokenBidder: string;
  let emailSeller: string;
  let emailOutroSeller: string;
  let emailBidder: string;
  let categoriaId: string;
  let leilaoId: string;
  let itemId: string;
  const nomesArquivosGerados: string[] = [];

  const SENHA_TESTE = 'Abc12345!';
  // Comeca com a assinatura real de um JPEG (FF D8 FF): o servidor confere os primeiros bytes
  const BUFFER_FOTO = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('conteudo de uma foto, so para o teste')]);

  async function criarUsuario(nome: string, email: string, papel?: 'BIDDER' | 'SELLER' | 'ADMIN') {
    await request(app.getHttpServer())
      .post('/api/auth/registrar')
      .set('X-API-KEY', chave)
      .send({ nome, email, senha: SENHA_TESTE, aceiteTermos: true });
    await prisma.user.update({ where: { email }, data: { ...PERFIL_COMPLETO, ...(papel ? { papel } : {}) } });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-API-KEY', chave)
      .send({ email, senha: SENHA_TESTE });
    return (login.body as { accessToken: string }).accessToken;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CepService)
      .useValue(cepFalso)
      .compile();

    app = moduleFixture.createNestApplication();
    configurarAplicacao(app);
    await app.init();

    chave = app.get(ConfigService).getOrThrow<string>('API_KEY');
    prisma = app.get(PrismaService);

    const agora = Date.now();
    emailSeller = `documents.seller.${agora}@teste.com`;
    emailOutroSeller = `documents.outro.seller.${agora}@teste.com`;
    emailBidder = `documents.bidder.${agora}@teste.com`;

    tokenSeller = await criarUsuario('Seller Documents', emailSeller, 'SELLER');
    tokenOutroSeller = await criarUsuario(
      'Outro Seller Documents',
      emailOutroSeller,
      'SELLER',
    );
    tokenBidder = await criarUsuario('Bidder Documents', emailBidder);

    const categoria = await prisma.category.create({
      data: { nome: `Documents E2E Categoria ${agora}` },
    });
    categoriaId = categoria.id;

    const leilao = await request(app.getHttpServer())
      .post('/api/auctions')
      .set('X-API-KEY', chave)
      .set('Authorization', `Bearer ${tokenSeller}`)
      .send({
        titulo: 'Documents E2E Leilao',
        dataInicio: '2099-01-01T00:00:00.000Z',
        dataFim: '2099-01-02T00:00:00.000Z',
      });
    leilaoId = (leilao.body as { id: string }).id;

    const item = await request(app.getHttpServer())
      .post('/api/auction-items')
      .set('X-API-KEY', chave)
      .set('Authorization', `Bearer ${tokenSeller}`)
      .send({
        titulo: 'Documents E2E Item',
        precoInicial: 100,
        incrementoMinimo: 10,
        cep: '01310100',
        leilaoId,
        categoriaId,
      });
    itemId = (item.body as { id: string }).id;
  }, 30_000); // varios registros/logins reais (bcrypt) -- 5s padrao do Jest e curto demais

  afterAll(async () => {
    // Remove os arquivos escritos em disco durante o teste
    for (const nomeArquivo of nomesArquivosGerados) {
      await unlink(join(process.cwd(), 'uploads', nomeArquivo)).catch(
        () => undefined,
      );
    }

    // Um item com Document nunca mais pode ser apagado (onDelete: Restrict);
    // o mesmo vale para o leilao (o item ainda aponta para ele) e para quem
    // enviou o arquivo/fez login. Tentativa best-effort, sem quebrar o teste
    await prisma.auctionItem
      .deleteMany({ where: { id: itemId } })
      .catch(() => undefined);
    await prisma.auction
      .deleteMany({ where: { id: leilaoId, status: 'DRAFT' } })
      .catch(() => undefined);
    await prisma.category
      .deleteMany({ where: { id: categoriaId } })
      .catch(() => undefined);
    await prisma.user
      .deleteMany({
        where: { email: { in: [emailSeller, emailOutroSeller, emailBidder] } },
      })
      .catch(() => undefined);
    await app.close();
  });

  describe('autorizacao', () => {
    it('sem token -> 401', async () => {
      const resposta = await request(app.getHttpServer())
        .post(`/api/auction-items/${itemId}/documents`)
        .set('X-API-KEY', chave)
        .field('tipo', 'PHOTO')
        .attach('arquivo', BUFFER_FOTO, 'foto.jpg');
      expect(resposta.status).toBe(401);
    });

    it('BIDDER tentando enviar -> 403', async () => {
      const resposta = await request(app.getHttpServer())
        .post(`/api/auction-items/${itemId}/documents`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenBidder}`)
        .field('tipo', 'PHOTO')
        .attach('arquivo', BUFFER_FOTO, 'foto.jpg');
      expect(resposta.status).toBe(403);
    });

    it('outro SELLER (nao dono do leilao) tentando enviar -> 403', async () => {
      const resposta = await request(app.getHttpServer())
        .post(`/api/auction-items/${itemId}/documents`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenOutroSeller}`)
        .field('tipo', 'PHOTO')
        .attach('arquivo', BUFFER_FOTO, 'foto.jpg');
      expect(resposta.status).toBe(403);
    });
  });

  describe('upload invalido -> 400', () => {
    it('sem nenhum arquivo anexado -> 400', async () => {
      const resposta = await request(app.getHttpServer())
        .post(`/api/auction-items/${itemId}/documents`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenSeller}`)
        .field('tipo', 'PHOTO');
      expect(resposta.status).toBe(400);
      expect(resposta.body.mensagem).toContain('Arquivo e obrigatório');
    });

    it('executavel disfarcado de foto (mimetype image/jpeg, conteudo "MZ") -> 400 pela assinatura real', async () => {
      const executavel = Buffer.concat([Buffer.from('MZ'), Buffer.from('programa disfarcado')]);
      const resposta = await request(app.getHttpServer())
        .post(`/api/auction-items/${itemId}/documents`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenSeller}`)
        .field('tipo', 'PHOTO')
        .attach('arquivo', executavel, 'foto.jpg');
      expect(resposta.status).toBe(400);
      expect(resposta.body.mensagem).toContain('não corresponde');
    });

    it('PNG enviado como .jpg (tipo diferente do conteudo) -> 400', async () => {
      const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('dados')]);
      const resposta = await request(app.getHttpServer())
        .post(`/api/auction-items/${itemId}/documents`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenSeller}`)
        .field('tipo', 'PHOTO')
        .attach('arquivo', png, 'foto.jpg');
      expect(resposta.status).toBe(400);
      expect(resposta.body.mensagem).toContain('não corresponde');
    });

    it('PDF de verdade (comeca com %PDF-) e aceito como DOCUMENT', async () => {
      const pdf = Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.from('laudo de teste')]);
      const resposta = await request(app.getHttpServer())
        .post(`/api/auction-items/${itemId}/documents`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenSeller}`)
        .field('tipo', 'DOCUMENT')
        .attach('arquivo', pdf, 'laudo.pdf');
      expect(resposta.status).toBe(201);
    });

    it('tipo de arquivo nao aceito (.exe) -> 400', async () => {
      const resposta = await request(app.getHttpServer())
        .post(`/api/auction-items/${itemId}/documents`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenSeller}`)
        .field('tipo', 'PHOTO')
        .attach('arquivo', BUFFER_FOTO, 'virus.exe');
      expect(resposta.status).toBe(400);
      expect(resposta.body.mensagem).toContain('não permitido');
    });

    it('arquivo maior que o limite configurado (UPLOAD_MAX_SIZE_MB) -> 400', async () => {
      const bufferGigante = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(6 * 1024 * 1024, 'x')]); // 6MB > limite de 5MB do .env
      const resposta = await request(app.getHttpServer())
        .post(`/api/auction-items/${itemId}/documents`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenSeller}`)
        .field('tipo', 'PHOTO')
        .attach('arquivo', bufferGigante, 'grande.jpg');
      expect(resposta.status).toBe(400);
      expect(resposta.body.mensagem).toContain('maior que o permitido');
    });

    it('tipo do formulario invalido (nem PHOTO nem DOCUMENT) -> 400', async () => {
      const resposta = await request(app.getHttpServer())
        .post(`/api/auction-items/${itemId}/documents`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenSeller}`)
        .field('tipo', 'INVALIDO')
        .attach('arquivo', BUFFER_FOTO, 'foto.jpg');
      expect(resposta.status).toBe(400);
    });
  });

  describe('item inexistente ou id malformado', () => {
    it('item inexistente (uuid valido) -> 404', async () => {
      const resposta = await request(app.getHttpServer())
        .post('/api/auction-items/24afe5fe-9857-44e7-866c-c814971433ea/documents')
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenSeller}`)
        .field('tipo', 'PHOTO')
        .attach('arquivo', BUFFER_FOTO, 'foto.jpg');
      expect(resposta.status).toBe(404);
    });

    it('id malformado -> 400 em portugues', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/api/auction-items/nao-e-um-uuid/documents')
        .set('X-API-KEY', chave);
      expect(resposta.status).toBe(400);
      expect(resposta.body.mensagem).toBe('id deve ser um uuid válido');
    });
  });

  describe('fluxo principal: envio, listagem e download', () => {
    it('SELLER dono envia uma foto valida -> 201, com hash SHA-256 e nome de arquivo seguro', async () => {
      const resposta = await request(app.getHttpServer())
        .post(`/api/auction-items/${itemId}/documents`)
        .set('X-API-KEY', chave)
        .set('Authorization', `Bearer ${tokenSeller}`)
        .field('tipo', 'PHOTO')
        .attach('arquivo', BUFFER_FOTO, 'foto-original.jpg')
        .expect(201);

      expect(resposta.body.tipo).toBe('PHOTO');
      expect(resposta.body.nomeOriginal).toBe('foto-original.jpg');
      expect(resposta.body.nomeArquivo).not.toBe('foto-original.jpg');
      expect(resposta.body.mimeType).toBe('image/jpeg');
      expect(resposta.body.tamanho).toBe(BUFFER_FOTO.length);
      expect(resposta.body.hash).toMatch(/^[a-f0-9]{64}$/); // sha256 em hexadecimal

      nomesArquivosGerados.push(resposta.body.nomeArquivo as string);
    });

    it('consulta por relacionamento: GET /auction-items/:itemId/documents lista o arquivo enviado, paginado', async () => {
      const resposta = await request(app.getHttpServer())
        .get(`/api/auction-items/${itemId}/documents`)
        .set('X-API-KEY', chave)
        .expect(200);

      expect(resposta.body.pagina).toBe(1);
      const documentos = resposta.body.dados as { nomeOriginal: string }[];
      expect(documentos.some((d) => d.nomeOriginal === 'foto-original.jpg')).toBe(
        true,
      );
    });


    it('a listagem PUBLICA nao mostra quem enviou (id de usuario) nem o nome do arquivo em disco', async () => {
      const resposta = await request(app.getHttpServer())
        .get(`/api/auction-items/${itemId}/documents`)
        .set('X-API-KEY', chave)
        .expect(200);

      const documento = (resposta.body.dados as Record<string, unknown>[])[0];
      expect(documento).not.toHaveProperty('enviadoPorId');
      expect(documento).not.toHaveProperty('nomeArquivo');
      expect(documento.hash).toMatch(/^[a-f0-9]{64}$/); // o hash e intencional: prova de integridade do arquivo
    });
    it('GET /documents/:id/download baixa o arquivo com o nome original', async () => {
      const lista = await request(app.getHttpServer())
        .get(`/api/auction-items/${itemId}/documents`)
        .set('X-API-KEY', chave);
      const documento = (lista.body.dados as { id: string; nomeOriginal: string }[])[0];

      const resposta = await request(app.getHttpServer())
        .get(`/api/documents/${documento.id}/download`)
        .set('X-API-KEY', chave)
        .expect(200);

      expect(resposta.headers['content-disposition']).toContain(
        documento.nomeOriginal,
      );
      expect(Number(resposta.headers['content-length'])).toBe(
        BUFFER_FOTO.length,
      );
    });

    it('download de documento inexistente -> 404', () => {
      return request(app.getHttpServer())
        .get('/api/documents/24afe5fe-9857-44e7-866c-c814971433ea/download')
        .set('X-API-KEY', chave)
        .expect(404);
    });
  });
});
