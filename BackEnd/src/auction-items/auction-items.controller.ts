import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiSecurity,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtOpcionalGuard } from '../auth/jwt-opcional.guard';
import { ApiPaginacaoQuery, ApiRespostaPaginada } from '../common/dto/api-resposta-paginada.decorator';
import { ContextoDaRequisicao } from '../common/decorators/contexto-requisicao.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { ContextoRequisicao } from '../common/interfaces/contexto-requisicao.interface';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { ParseUuidPipePt } from '../common/pipes/parse-uuid.pipe';
import { HEADER_REQUEST_ID } from '../common/swagger-headers';
import { ErroResposta } from '../common/dto/erro-resposta.dto';
import type { RespostaPaginada } from '../common/utils/paginacao.util';
import { AuctionItemsService } from './auction-items.service';
import { AtualizarAuctionItemDto } from './dto/atualizar-auction-item.dto';
import { AuctionItemResposta } from './dto/auction-item-resposta.dto';
import { CriarAuctionItemDto } from './dto/criar-auction-item.dto';
import { ListarAuctionItemsQueryDto } from './dto/listar-auction-items-query.dto';

// Id de um item real do seed (leilao OPEN) -- so de exemplo no Swagger
const PARAM_ID = {
  name: 'id',
  description: 'Id (uuid) do item',
  example: 'b9e2a0f4-25a4-44b0-a33e-f804a9a8d0e7',
};

// Leitura livre (so a X-API-KEY global). So o SELLER dono do LEILAO (ou um
// ADMIN) pode criar/editar/remover itens, e so enquanto o leilao esta DRAFT
@ApiTags('Auction Items')
@ApiSecurity('api-key')
@Controller('auction-items')
export class AuctionItemsController {
  constructor(private readonly auctionItemsService: AuctionItemsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SELLER', 'ADMIN')
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Cria um item do leilao (dono do leilao ou ADMIN, so em DRAFT)',
    description:
      'O endereco de retirada (logradouro/cidade/uf) e preenchido de ' +
      'verdade pela integracao com o ViaCEP, a partir do "cep" enviado.',
  })
  @ApiCreatedResponse({
    description: 'Item criado (precoInicial/incrementoMinimo/lanceAtual sempre como string)',
    type: AuctionItemResposta,
    headers: HEADER_REQUEST_ID,
    // Links do OpenAPI: usam o "id" da resposta para alimentar outras
    // rotas direto no Swagger UI (aba "Links", embaixo da resposta 201)
    links: {
      buscarItem: {
        operationId: 'AuctionItemsController_buscarPorId',
        parameters: { id: '$response.body#/id' },
        description: 'Busca este item pelo id',
      },
      darLanceNoItem: {
        operationId: 'BidsController_darLance',
        parameters: { itemId: '$response.body#/id' },
        description: 'Da um lance neste item (o leilao precisa estar OPEN)',
      },
      enviarDocumentoDoItem: {
        operationId: 'DocumentsController_enviar',
        parameters: { itemId: '$response.body#/id' },
        description: 'Envia uma foto/documento deste item',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Corpo invalido (preco/incremento negativo, cep com formato invalido)', type: ErroResposta })
  @ApiUnauthorizedResponse({ description: 'Sem token, token invalido, ou X-API-KEY ausente/errada', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas nao e o dono do leilao nem ADMIN', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Leilao/categoria inexistente, ou CEP com formato valido mas nao encontrado no ViaCEP', type: ErroResposta })
  @ApiConflictResponse({ description: 'O leilao ja saiu de DRAFT (nao aceita mais itens novos)', type: ErroResposta })
  @ApiServiceUnavailableResponse({ description: 'ViaCEP fora do ar ou demorou demais para responder', type: ErroResposta })
  criar(
    @Body() dto: CriarAuctionItemDto,
    @CurrentUser() usuario: UsuarioAutenticado,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<AuctionItemResposta> {
    return this.auctionItemsService.criar(dto, usuario, contexto);
  }

  // Consultas por relacionamento: /auction-items?leilaoId=... ou ?categoriaId=...
  @Get()
  @ApiOperation({
    summary: 'Lista itens, paginado (livre, sem login)',
    description: 'Os dois filtros sao opcionais e podem ser combinados (consulta por relacionamento).',
  })
  @ApiPaginacaoQuery()
  @ApiQuery({ name: 'leilaoId', required: false, description: 'Filtra pelos itens de um leilao' })
  @ApiQuery({ name: 'categoriaId', required: false, description: 'Filtra pelos itens de uma categoria' })
  @ApiRespostaPaginada(AuctionItemResposta)
  @UseGuards(JwtOpcionalGuard)
  listarTodos(
    @Query() query: ListarAuctionItemsQueryDto,
    @CurrentUser() usuario?: UsuarioAutenticado,
  ): Promise<RespostaPaginada<AuctionItemResposta>> {
    return this.auctionItemsService.listarTodos(query, usuario);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca um item pelo id (livre, sem login)' })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ description: 'Item encontrado', type: AuctionItemResposta, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Id nao e um uuid valido', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Item inexistente', type: ErroResposta })
  @UseGuards(JwtOpcionalGuard)
  buscarPorId(
    @Param('id', ParseUuidPipePt) id: string,
    @CurrentUser() usuario?: UsuarioAutenticado,
  ): Promise<AuctionItemResposta> {
    return this.auctionItemsService.buscarPorId(id, usuario);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SELLER', 'ADMIN')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Atualiza um item (dono do leilao ou ADMIN, so com o leilao em DRAFT)' })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ description: 'Item atualizado', type: AuctionItemResposta, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Id invalido ou corpo invalido', type: ErroResposta })
  @ApiUnauthorizedResponse({ description: 'Sem token, token invalido, ou X-API-KEY ausente/errada', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas nao e o dono do leilao nem ADMIN', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Item/categoria inexistente, ou CEP nao encontrado (se o cep foi trocado)', type: ErroResposta })
  @ApiConflictResponse({ description: 'O leilao ja saiu de DRAFT', type: ErroResposta })
  @ApiServiceUnavailableResponse({ description: 'ViaCEP fora do ar (so se o cep foi trocado)', type: ErroResposta })
  atualizar(
    @Param('id', ParseUuidPipePt) id: string,
    @Body() dto: AtualizarAuctionItemDto,
    @CurrentUser() usuario: UsuarioAutenticado,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<AuctionItemResposta> {
    return this.auctionItemsService.atualizar(id, dto, usuario, contexto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SELLER', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Remove um item (dono do leilao ou ADMIN, so com o leilao em DRAFT)' })
  @ApiParam(PARAM_ID)
  @ApiNoContentResponse({ description: 'Item removido', headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Id nao e um uuid valido', type: ErroResposta })
  @ApiUnauthorizedResponse({ description: 'Sem token, token invalido, ou X-API-KEY ausente/errada', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas nao e o dono do leilao nem ADMIN', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Item inexistente', type: ErroResposta })
  @ApiConflictResponse({ description: 'O leilao ja saiu de DRAFT', type: ErroResposta })
  remover(
    @Param('id', ParseUuidPipePt) id: string,
    @CurrentUser() usuario: UsuarioAutenticado,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<void> {
    return this.auctionItemsService.remover(id, usuario, contexto);
  }
}
