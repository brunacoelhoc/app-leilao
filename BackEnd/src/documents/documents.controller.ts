import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiExcludeController, ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { SemChaveApi } from '../common/decorators/sem-chave-api.decorator';
import { DocumentType } from '../generated/prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiPaginacaoQuery, ApiRespostaPaginada } from '../common/dto/api-resposta-paginada.decorator';
import { ContextoDaRequisicao } from '../common/decorators/contexto-requisicao.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PaginacaoQueryDto } from '../common/dto/paginacao-query.dto';
import type { ContextoRequisicao } from '../common/interfaces/contexto-requisicao.interface';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { ParseUuidPipePt } from '../common/pipes/parse-uuid.pipe';
import { HEADER_REQUEST_ID } from '../common/swagger-headers';
import { ErroResposta } from '../common/dto/erro-resposta.dto';
import type { RespostaPaginada } from '../common/utils/paginacao.util';
import { DocumentsService } from './documents.service';
import { DocumentoResposta } from './dto/documento-resposta.dto';
import { EnviarDocumentoDto } from './dto/enviar-documento.dto';
import type { Document } from '../generated/prisma/client';

// Id de um item real do seed -- so de exemplo no Swagger
const PARAM_ITEM_ID = {
  name: 'itemId',
  description: 'Id (uuid) do item',
  example: 'b9e2a0f4-25a4-44b0-a33e-f804a9a8d0e7',
};

// So o SELLER dono do leilao do item (ou ADMIN) envia arquivo. Listar e
// baixar sao livres (as fotos ajudam a atrair lances, nao faz sentido esconder)
@ApiExcludeController()
@ApiTags('Documents')
@ApiSecurity('api-key')
@Controller()
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);

  constructor(private readonly documentsService: DocumentsService) {}

  @Post('auction-items/:itemId/documents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SELLER', 'ADMIN')
  @ApiBearerAuth('jwt')
  // Sem "limits" configuravel aqui (o decorator roda antes do Nest subir e
  // nao tem acesso ao ConfigService) -- so um teto fixo, bem acima do
  // maximo que o .env pode configurar (50MB), so para nao aceitar um
  // arquivo absurdamente grande. O limite de verdade e conferido no service
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: 50 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        arquivo: { type: 'string', format: 'binary' },
        tipo: { type: 'string', enum: ['PHOTO', 'DOCUMENT'] },
      },
    },
  })
  @ApiOperation({
    summary: 'Envia uma foto/documento do item (dono do leilao ou ADMIN)',
    description:
      'Tipos aceitos: image/jpeg, image/png, application/pdf (mimetype e assinatura real do arquivo, ' +
      'real, nao a extensao do nome). Tamanho maximo configuravel via ' +
      'UPLOAD_MAX_SIZE_MB do .env. Nome de arquivo salvo em disco e sempre ' +
      'gerado (UUID), nunca o nome original.',
  })
  @ApiParam(PARAM_ITEM_ID)
  @ApiCreatedResponse({ description: 'Arquivo salvo (com hash SHA-256, tamanho e mimetype gravados)', type: DocumentoResposta, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Sem arquivo, tipo nao aceito, arquivo maior que o limite, ou "tipo" invalido', type: ErroResposta })
  @ApiUnauthorizedResponse({ description: 'Sem token, token invalido, ou X-API-KEY ausente/errada', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas nao e o dono do leilao nem ADMIN', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Item inexistente', type: ErroResposta })
  enviar(
    @Param('itemId', ParseUuidPipePt) itemId: string,
    @Body() dto: EnviarDocumentoDto,
    @UploadedFile() arquivo: Express.Multer.File | undefined,
    @CurrentUser() usuario: UsuarioAutenticado,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<Document> {
    return this.documentsService.enviar(itemId, dto, arquivo, usuario, contexto);
  }

  @Get('auction-items/:itemId/documents')
  @ApiOperation({ summary: 'Lista os documentos/fotos de um item, paginado (livre, sem login)' })
  @ApiParam(PARAM_ITEM_ID)
  @ApiPaginacaoQuery()
  @ApiRespostaPaginada(DocumentoResposta)
  @ApiBadRequestResponse({ description: 'itemId nao e um uuid valido', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Item inexistente', type: ErroResposta })
  listarPorItem(
    @Param('itemId', ParseUuidPipePt) itemId: string,
    @Query() query: PaginacaoQueryDto,
  ): Promise<RespostaPaginada<Document>> {
    return this.documentsService.listarPorItem(itemId, query);
  }

  // 🔎 Foto da peca para a tag <img> (o front so aponta a URL; quem serve, valida e faz cache e o
  // servidor). So PHOTO: certificados e laudos continuam exigindo a chave em /download
  @Get('documents/:id/foto')
  @SemChaveApi()
  @ApiOperation({
    summary: 'Foto de uma peca, para exibir direto no navegador (livre, sem chave nem login)',
    description: 'So documentos do tipo PHOTO. Documentos (certificados, laudos) NAO saem por aqui.',
  })
  @ApiParam({ name: 'id', description: 'Id (uuid) do documento do tipo PHOTO' })
  @ApiNotFoundResponse({ description: 'Nao existe, nao e foto, ou o arquivo sumiu do disco', type: ErroResposta })
  async foto(
    @Param('id', ParseUuidPipePt) id: string,
    @Res() resposta: Response,
  ): Promise<void> {
    const { documento, caminhoArquivo } = await this.documentsService.buscarParaDownload(id);
    if (documento.tipo !== DocumentType.PHOTO) {
      throw new NotFoundException('Foto nao encontrada');
    }
    resposta.setHeader('Content-Type', documento.mimeType);
    // O front (outra origem) precisa poder exibir a imagem; o Helmet, por padrao, bloqueia
    resposta.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    resposta.setHeader('Cache-Control', 'public, max-age=300');
    resposta.sendFile(caminhoArquivo, (erro) => {
      if (erro) this.logger.error(`Falha ao enviar foto ${id}: ${erro.message}`);
    });
  }

  @Get('documents/:id/download')
  @ApiOperation({ summary: 'Baixa o arquivo (livre, sem login)' })
  @ApiParam({ name: 'id', description: 'Id (uuid) do documento' })
  @ApiOkResponse({
    description: 'Arquivo (stream), com o nome original no Content-Disposition',
    headers: HEADER_REQUEST_ID,
    content: {
      'image/jpeg': { schema: { type: 'string', format: 'binary' } },
      'image/png': { schema: { type: 'string', format: 'binary' } },
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiBadRequestResponse({ description: 'Id nao e um uuid valido', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Documento inexistente, ou o registro existe mas o arquivo sumiu do disco', type: ErroResposta })
  async baixar(
    @Param('id', ParseUuidPipePt) id: string,
    @Res() resposta: Response,
  ): Promise<void> {
    const { documento, caminhoArquivo } =
      await this.documentsService.buscarParaDownload(id);

    resposta.download(caminhoArquivo, documento.nomeOriginal, (erro) => {
      // Chegou aqui depois que a resposta ja comecou a ser enviada (ou
      // falhou no meio do caminho) -- tarde demais para trocar por um erro
      // formatado pelo filtro global, so registra no log
      if (erro) {
        this.logger.error(`Falha ao baixar documento ${id}: ${erro.message}`);
      }
    });
  }
}
