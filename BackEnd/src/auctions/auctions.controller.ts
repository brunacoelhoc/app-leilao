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
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiPaginacaoQuery, ApiRespostaPaginada } from '../common/dto/api-resposta-paginada.decorator';
import { ContextoDaRequisicao } from '../common/decorators/contexto-requisicao.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ParseUuidPipePt } from '../common/pipes/parse-uuid.pipe';
import type { ContextoRequisicao } from '../common/interfaces/contexto-requisicao.interface';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { HEADER_REQUEST_ID } from '../common/swagger-headers';
import { ErroResposta } from '../common/dto/erro-resposta.dto';
import type { RespostaPaginada } from '../common/utils/paginacao.util';
import type { Auction } from '../generated/prisma/client';
import { AuctionsService } from './auctions.service';
import { AtualizarAuctionDto } from './dto/atualizar-auction.dto';
import { AuctionResposta } from './dto/auction-resposta.dto';
import { CriarAuctionDto } from './dto/criar-auction.dto';
import { IndicadoresAuctionResposta } from './dto/indicadores-auction-resposta.dto';
import { ListarAuctionsQueryDto } from './dto/listar-auctions-query.dto';
import { MudarStatusDto } from './dto/mudar-status.dto';
import { proximosStatus } from './transicoes-status';

// Id de um leilao DRAFT real do seed (editar/mudar status/remover so
// funcionam em DRAFT) -- serve so de exemplo no Swagger, nao e obrigatorio usar
const PARAM_ID = {
  name: 'id',
  description: 'Id (uuid) do leilao',
  example: '8e9d06c4-98be-4ef2-950e-1e2a71408212',
};

// Leitura (GET) e livre (so a X-API-KEY global). Escrever exige login.
// So o SELLER dono do leilao (ou um ADMIN) pode editar, mudar o status ou remover
// Acrescenta a resposta o que o leilao pode fazer agora: o front so exibe
function comTransicoes(leilao: Auction): AuctionResposta {
  return {
    ...leilao,
    transicoesPermitidas: proximosStatus(leilao.status),
    // Regra do servidor: so rascunho aceita editar dados, itens e remocao
    editavel: leilao.status === 'DRAFT',
  };
}

@ApiTags('Auctions')
@ApiSecurity('api-key')
@Controller('auctions')
export class AuctionsController {
  constructor(private readonly auctionsService: AuctionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SELLER')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Cria um leilao (SELLER); nasce sempre em DRAFT' })
  @ApiCreatedResponse({
    description: 'Leilao criado (DRAFT)',
    type: AuctionResposta,
    headers: HEADER_REQUEST_ID,
    // Links do OpenAPI: usam o "id" da resposta para alimentar outras
    // rotas direto no Swagger UI (aba "Links", embaixo da resposta 201)
    links: {
      buscarLeilao: {
        operationId: 'AuctionsController_buscarPorId',
        parameters: { id: '$response.body#/id' },
        description: 'Busca este leilao pelo id',
      },
      mudarStatusDoLeilao: {
        operationId: 'AuctionsController_mudarStatus',
        parameters: { id: '$response.body#/id' },
        description: 'Muda o status deste leilao (ex.: DRAFT -> SCHEDULED)',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Corpo invalido (titulo curto, dataFim antes de dataInicio, datas invalidas)', type: ErroResposta })
  @ApiUnauthorizedResponse({ description: 'Sem token, token invalido, ou X-API-KEY ausente/errada', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas nao e SELLER', type: ErroResposta })
  criar(
    @Body() dto: CriarAuctionDto,
    @CurrentUser() usuario: UsuarioAutenticado,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<AuctionResposta> {
    return this.auctionsService.criar(dto, usuario, contexto).then(comTransicoes);
  }

  @Get()
  @ApiOperation({
    summary: 'Lista os leiloes, paginado (livre, sem login)',
    description: '"vendedorId" e opcional (consulta por relacionamento: leiloes de um vendedor).',
  })
  @ApiPaginacaoQuery()
  @ApiQuery({ name: 'vendedorId', required: false, description: 'Filtra pelos leiloes de um vendedor' })
  @ApiRespostaPaginada(AuctionResposta)
  listarTodos(
    @Query() query: ListarAuctionsQueryDto,
  ): Promise<RespostaPaginada<AuctionResposta>> {
    return this.auctionsService
      .listarTodos(query)
      .then((r) => ({ ...r, dados: r.dados.map(comTransicoes) }));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca um leilao pelo id (livre, sem login)' })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ description: 'Leilao encontrado', type: AuctionResposta, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Id nao e um uuid valido', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Leilao inexistente', type: ErroResposta })
  buscarPorId(@Param('id', ParseUuidPipePt) id: string): Promise<AuctionResposta> {
    return this.auctionsService.buscarPorId(id).then(comTransicoes);
  }

  @Get(':id/indicadores')
  @ApiOperation({
    summary: 'Indicadores do leilao: total de itens/lances, maior lance, itens vendidos e total arrecadado (livre, sem login)',
    description: 'Resumo calculado na hora a partir dos itens e lances do leilao.',
  })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ description: 'Indicadores do leilao', type: IndicadoresAuctionResposta, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Id nao e um uuid valido', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Leilao inexistente', type: ErroResposta })
  obterIndicadores(
    @Param('id', ParseUuidPipePt) id: string,
  ): Promise<IndicadoresAuctionResposta> {
    return this.auctionsService.obterIndicadores(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SELLER', 'ADMIN')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Atualiza titulo/descricao/datas (dono ou ADMIN, so em DRAFT)' })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ description: 'Leilao atualizado', type: AuctionResposta, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Id invalido ou corpo invalido', type: ErroResposta })
  @ApiUnauthorizedResponse({ description: 'Sem token, token invalido, ou X-API-KEY ausente/errada', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas nao e o dono nem ADMIN', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Leilao inexistente', type: ErroResposta })
  @ApiConflictResponse({ description: 'O leilao ja saiu de DRAFT (nao pode mais editar)', type: ErroResposta })
  atualizar(
    @Param('id', ParseUuidPipePt) id: string,
    @Body() dto: AtualizarAuctionDto,
    @CurrentUser() usuario: UsuarioAutenticado,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<AuctionResposta> {
    return this.auctionsService.atualizar(id, dto, usuario, contexto).then(comTransicoes);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SELLER', 'ADMIN')
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Muda o status do leilao (dono ou ADMIN)',
    description:
      'Maquina de estados: DRAFT -> SCHEDULED -> OPEN -> CLOSED; CANCELED a ' +
      'partir de qualquer estado nao-final. "motivo" e obrigatorio so para CANCELED. ' +
      'Ao fechar (CLOSED), cada item do leilao vira SOLD (com vencedor) ou UNSOLD.',
  })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ description: 'Status alterado (e historico gravado)', type: AuctionResposta, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Id invalido, status desconhecido, ou motivo ausente ao cancelar', type: ErroResposta })
  @ApiUnauthorizedResponse({ description: 'Sem token, token invalido, ou X-API-KEY ausente/errada', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas nao e o dono nem ADMIN', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Leilao inexistente', type: ErroResposta })
  @ApiConflictResponse({ description: 'Transicao de status invalida para o estado atual', type: ErroResposta })
  mudarStatus(
    @Param('id', ParseUuidPipePt) id: string,
    @Body() dto: MudarStatusDto,
    @CurrentUser() usuario: UsuarioAutenticado,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<AuctionResposta> {
    return this.auctionsService.mudarStatus(id, dto, usuario, contexto).then(comTransicoes);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SELLER', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Remove um leilao (dono ou ADMIN, so em DRAFT)' })
  @ApiParam(PARAM_ID)
  @ApiNoContentResponse({ description: 'Leilao removido', headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Id nao e um uuid valido', type: ErroResposta })
  @ApiUnauthorizedResponse({ description: 'Sem token, token invalido, ou X-API-KEY ausente/errada', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas nao e o dono nem ADMIN', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Leilao inexistente', type: ErroResposta })
  @ApiConflictResponse({ description: 'O leilao ja saiu de DRAFT (nao pode mais remover)', type: ErroResposta })
  remover(
    @Param('id', ParseUuidPipePt) id: string,
    @CurrentUser() usuario: UsuarioAutenticado,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<void> {
    return this.auctionsService.remover(id, usuario, contexto);
  }
}
