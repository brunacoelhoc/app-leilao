import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { access, mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { AuditLogService } from '../audit/audit-log.service';
import type { ContextoRequisicao } from '../common/interfaces/contexto-requisicao.interface';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { tipoRealDoArquivo } from '../common/utils/assinatura-arquivo.util';
import {
  calcularPaginacao,
  paginar,
  type ParametrosPaginacao,
  type RespostaPaginada,
} from '../common/utils/paginacao.util';
import { AuditResult, type Document, type Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { EnviarDocumentoDto } from './dto/enviar-documento.dto';

// So estes tipos de arquivo sao aceitos (fotos e documentos do item).
// Confere o mimetype de verdade enviado pelo multer, nunca a extensao do nome
const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'application/pdf'];

// Fica fora do projeto versionado (uploads/ esta no .gitignore)
const PASTA_UPLOADS = join(process.cwd(), 'uploads');

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async enviar(
    itemId: string,
    dto: EnviarDocumentoDto,
    arquivo: Express.Multer.File | undefined,
    usuario: UsuarioAutenticado,
    contexto: ContextoRequisicao,
  ): Promise<Document> {
    try {
      // Presenca do arquivo
      if (!arquivo) {
        throw new BadRequestException('Arquivo e obrigatorio');
      }

      if (!TIPOS_ACEITOS.includes(arquivo.mimetype)) {
        throw new BadRequestException(
          `Tipo de arquivo nao permitido. Aceitos: ${TIPOS_ACEITOS.join(', ')}`,
        );
      }

      // O mimetype vem do cliente e pode mentir: o CONTEUDO (magic bytes) tem que ser do mesmo tipo
      if (tipoRealDoArquivo(arquivo.buffer) !== arquivo.mimetype) {
        throw new BadRequestException('O conteudo do arquivo nao corresponde ao tipo informado');
      }

      // Tamanho maximo configuravel pelo .env (o FileInterceptor ja tem um
      // teto fixo mais alto, so para nao deixar um arquivo gigante nem chegar
      // aqui; este e o limite de verdade do negocio)
      const limiteMb = this.configService.getOrThrow<number>('UPLOAD_MAX_SIZE_MB');
      if (arquivo.size > limiteMb * 1024 * 1024) {
        throw new BadRequestException(
          `Arquivo maior que o permitido (${limiteMb}MB)`,
        );
      }

      // So o dono do leilao do item (ou ADMIN) pode enviar arquivo para ele
      const item = await this.prisma.auctionItem.findUnique({
        where: { id: itemId },
        include: { leilao: true },
      });
      if (!item) {
        throw new NotFoundException('Item nao encontrado');
      }
      if (usuario.papel !== 'ADMIN' && item.leilao.vendedorId !== usuario.id) {
        throw new ForbiddenException(
          'Voce so pode enviar arquivos para itens dos seus proprios leiloes',
        );
      }

      // Nome de arquivo seguro: nunca usa o nome original (evita path
      // traversal e colisao de nomes), so mantem a extensao
      const nomeArquivo = `${randomUUID()}${extname(arquivo.originalname)}`;
      const hash = createHash('sha256').update(arquivo.buffer).digest('hex');

      await mkdir(PASTA_UPLOADS, { recursive: true });
      await writeFile(join(PASTA_UPLOADS, nomeArquivo), arquivo.buffer);

      const documento = await this.prisma.document.create({
        data: {
          tipo: dto.tipo,
          nomeOriginal: arquivo.originalname,
          nomeArquivo,
          mimeType: arquivo.mimetype,
          tamanho: arquivo.size,
          hash,
          itemId,
          enviadoPorId: usuario.id,
        },
      });
      await this.registrarAuditoria(
        itemId,
        usuario,
        contexto,
        AuditResult.SUCCESS,
        201,
      );
      return documento;
    } catch (erro) {
      await this.registrarAuditoria(
        itemId,
        usuario,
        contexto,
        AuditResult.REJECTED,
        this.statusDoErro(erro),
        this.motivoDoErro(erro),
      );
      throw erro;
    }
  }

  private statusDoErro(erro: unknown): number {
    return erro instanceof HttpException ? erro.getStatus() : 500;
  }

  private motivoDoErro(erro: unknown): string {
    return erro instanceof HttpException
      ? erro.message
      : 'Erro interno ao processar o upload';
  }

  private registrarAuditoria(
    itemId: string,
    usuario: UsuarioAutenticado,
    contexto: ContextoRequisicao,
    resultado: AuditResult,
    statusHttp: number,
    motivo?: string,
  ): Promise<void> {
    return this.auditLogService.registrar({
      usuarioId: usuario.id,
      papel: usuario.papel as Role,
      acao: 'DOCUMENTO_ENVIADO',
      entidade: 'AuctionItem',
      entidadeId: itemId,
      resultado,
      motivo,
      statusHttp,
      ...contexto,
    });
  }

  // Consulta por relacionamento: documentos de um item
  async listarPorItem(
    itemId: string,
    params: ParametrosPaginacao,
  ): Promise<RespostaPaginada<Document>> {
    const item = await this.prisma.auctionItem.findUnique({
      where: { id: itemId },
    });
    if (!item) {
      throw new NotFoundException('Item nao encontrado');
    }

    const paginacao = calcularPaginacao(params);
    const [documentos, total] = await Promise.all([
      this.prisma.document.findMany({
        where: { itemId },
        orderBy: { criadoEm: 'desc' },
        skip: paginacao.skip,
        take: paginacao.take,
      }),
      this.prisma.document.count({ where: { itemId } }),
    ]);
    return paginar(documentos, total, paginacao);
  }

  // Devolve o registro e o caminho do arquivo em disco, para o controller baixar
  async buscarParaDownload(
    id: string,
  ): Promise<{ documento: Document; caminhoArquivo: string }> {
    const documento = await this.prisma.document.findUnique({
      where: { id },
    });
    if (!documento) {
      throw new NotFoundException('Documento nao encontrado');
    }

    const caminhoArquivo = join(PASTA_UPLOADS, documento.nomeArquivo);
    try {
      await access(caminhoArquivo);
    } catch {
      // O registro existe no banco, mas o arquivo sumiu do disco
      throw new NotFoundException('Arquivo nao encontrado no servidor');
    }

    return { documento, caminhoArquivo };
  }
}
