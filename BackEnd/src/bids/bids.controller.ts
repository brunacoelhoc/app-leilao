import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
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
import { BidsService } from './bids.service';
import { BidResposta } from './dto/bid-resposta.dto';
import { MinhasPecasResposta } from './dto/minha-peca-resposta.dto';
import { MinhaSituacaoResposta } from './dto/minha-situacao-resposta.dto';
import { CriarBidDto } from './dto/criar-bid.dto';

// Id de um item real do seed (leilao OPEN, ja recebeu lance) -- so de exemplo
const PARAM_ITEM_ID = {
  name: 'itemId',
  description: 'Id (uuid) do item',
  example: 'b9e2a0f4-25a4-44b0-a33e-f804a9a8d0e7',
};

// So um BIDDER autenticado da lance. Consultas de listagem sao livres
// (qualquer um pode ver os lances de um item; "meus lances" exige login)
@ApiTags('Bids')
@ApiSecurity('api-key')
@Controller()
export class BidsController {
  constructor(private readonly bidsService: BidsService) {}

  @Post('auction-items/:itemId/bids')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('BIDDER')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Dá um lance em um item (só BIDDER; nunca no próprio leilão)',
    description:
      'Concorrencia protegida por lock pessimista (SELECT ... FOR UPDATE): ' +
      'dois lances simultâneos no mesmo item nunca "vencem" juntos.',
  })
  @ApiParam(PARAM_ITEM_ID)
  @ApiCreatedResponse({ description: 'Lance aceito (valor/lanceAnterior sempre como string)', type: BidResposta, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Corpo inválido (valor negativo ou com mais de 2 casas decimais)', type: ErroResposta })
  @ApiUnauthorizedResponse({ description: 'Sem token, token inválido, ou X-API-KEY ausente/errada', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'ADMIN não participa de leilões; e o dono do leilão nunca dá lance no próprio item', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Item inexistente', type: ErroResposta })
  @ApiConflictResponse({ description: 'Leilão fechado/fora do período, item indisponível, ou valor abaixo do mínimo aceito', type: ErroResposta })
  darLance(
    @Param('itemId', ParseUuidPipePt) itemId: string,
    @Body() dto: CriarBidDto,
    @CurrentUser() usuario: UsuarioAutenticado,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<BidResposta> {
    return this.bidsService.darLance(itemId, dto, usuario, contexto);
  }

  // Consulta por relacionamento: lances de um item
  @Get('auction-items/:itemId/bids')
  @ApiOperation({ summary: 'Lista os lances de um item, paginado, do maior pro menor (livre, sem login)' })
  @ApiParam(PARAM_ITEM_ID)
  @ApiPaginacaoQuery()
  @ApiRespostaPaginada(BidResposta)
  @ApiBadRequestResponse({ description: 'itemId não é um uuid válido', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Item inexistente', type: ErroResposta })
  listarPorItem(
    @Param('itemId', ParseUuidPipePt) itemId: string,
    @Query() query: PaginacaoQueryDto,
  ): Promise<RespostaPaginada<BidResposta>> {
    return this.bidsService.listarPorItem(itemId, query);
  }

  // Posso dar lance nesta peca? (qualquer usuario logado pergunta; a resposta depende do papel)
  @Get('auction-items/:itemId/bids/minha-situacao')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'O que o usuário logado pode fazer nesta peça: pode dar lance? se não, por que? sou dono? venci?',
    description: 'As mesmas regras de POST /auction-items/{itemId}/bids, respondidas antes. A tela só exibe o resultado.',
  })
  @ApiParam(PARAM_ITEM_ID)
  @ApiOkResponse({ type: MinhaSituacaoResposta })
  @ApiUnauthorizedResponse({ description: 'Sem token, token inválido, ou X-API-KEY ausente/errada', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Item inexistente', type: ErroResposta })
  minhaSituacao(
    @Param('itemId', ParseUuidPipePt) itemId: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<MinhaSituacaoResposta> {
    return this.bidsService.minhaSituacao(itemId, usuario);
  }

  // Um card por PECA disputada, com a situacao (arrematei / liderando / superado / perdi)
  @Get('bids/minhas-pecas')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('BIDDER')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Resumo por peça dos lances do usuário logado (BIDDER)' })
  @ApiOkResponse({ type: MinhasPecasResposta })
  @ApiUnauthorizedResponse({ description: 'Sem token, token inválido, ou X-API-KEY ausente/errada', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'ADMIN não participa de leilões', type: ErroResposta })
  minhasPecas(@CurrentUser() usuario: UsuarioAutenticado): Promise<MinhasPecasResposta> {
    return this.bidsService.minhasPecas(usuario.id);
  }

  // Consulta por relacionamento: os lances do proprio usuario logado
  @Get('bids/meus')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('BIDDER')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Lista os lances do próprio usuário logado, paginado, do mais recente pro mais antigo (BIDDER)' })
  @ApiPaginacaoQuery()
  @ApiRespostaPaginada(BidResposta)
  @ApiUnauthorizedResponse({ description: 'Sem token, token inválido, ou X-API-KEY ausente/errada', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'ADMIN não participa de leilões', type: ErroResposta })
  listarMeusLances(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() query: PaginacaoQueryDto,
  ): Promise<RespostaPaginada<BidResposta>> {
    return this.bidsService.listarMeusLances(usuario.id, query);
  }
}
