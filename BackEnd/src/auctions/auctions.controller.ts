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
import { JwtOpcionalGuard } from '../auth/jwt-opcional.guard';
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
import { ReativarAuctionDto } from './dto/reativar-auction.dto';
import { capaPadrao } from '../common/utils/capa-padrao.util';
import { proximosStatus } from './transicoes-status';

// Id de um leilao DRAFT real do seed (editar/mudar status/remover so
// funcionam em DRAFT) -- serve so de exemplo no Swagger, nao e obrigatorio usar
const PARAM_ID = {
  name: 'id',
  description: 'Id (uuid) do leilão',
  example: '8e9d06c4-98be-4ef2-950e-1e2a71408212',
};

// Leitura (GET) e livre (so a X-API-KEY global). Escrever exige login.
// So o SELLER dono do leilao (ou um ADMIN) pode editar, mudar o status ou remover
// Acrescenta a resposta o que o leilao pode fazer agora: o front so exibe
function comTransicoes(leilao: Auction & { capaDocumentoId?: string | null; capaPadrao?: string }): AuctionResposta {
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
  @ApiOperation({ summary: 'Cria um leilão (SELLER); nasce sempre em DRAFT' })
  @ApiCreatedResponse({
    description: 'Leilão criado (DRAFT)',
    type: AuctionResposta,
    headers: HEADER_REQUEST_ID,
    // Links do OpenAPI: usam o "id" da resposta para alimentar outras
    // rotas direto no Swagger UI (aba "Links", embaixo da resposta 201)
    links: {
      buscarLeilao: {
        operationId: 'AuctionsController_buscarPorId',
        parameters: { id: '$response.body#/id' },
        description: 'Busca este leilão pelo id',
      },
      mudarStatusDoLeilao: {
        operationId: 'AuctionsController_mudarStatus',
        parameters: { id: '$response.body#/id' },
        description: 'Muda o status deste leilão (ex.: DRAFT -> SCHEDULED)',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Corpo inválido (título curto, dataFim antes de dataInicio, datas inválidas)', type: ErroResposta })
  @ApiUnauthorizedResponse({ description: 'Sem token, token inválido, ou X-API-KEY ausente/errada', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas não é SELLER', type: ErroResposta })
  criar(
    @Body() dto: CriarAuctionDto,
    @CurrentUser() usuario: UsuarioAutenticado,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<AuctionResposta> {
    return this.auctionsService.criar(dto, usuario, contexto).then(comTransicoes);
  }

  @Get()
  @ApiOperation({
    summary: 'Lista os leilões, paginado (livre, sem login)',
    description: '"vendedorId" é opcional (consulta por relacionamento: leilões de um vendedor).',
  })
  @ApiPaginacaoQuery()
  @ApiQuery({ name: 'vendedorId', required: false, description: 'Filtra pelos leilões de um vendedor' })
  @ApiRespostaPaginada(AuctionResposta)
  @UseGuards(JwtOpcionalGuard)
  listarTodos(
    @Query() query: ListarAuctionsQueryDto,
    @CurrentUser() usuario?: UsuarioAutenticado,
  ): Promise<RespostaPaginada<AuctionResposta>> {
    return this.auctionsService
      .listarTodos(query, usuario)
      .then((r) => ({ ...r, dados: r.dados.map(comTransicoes) }));
  }

  // Vem ANTES de ":id", senao "resumo" seria lido como um id
  @Get('resumo')
  @ApiOperation({
    summary: 'Quantidade de leilões por status (livre, sem login)',
    description: '"vendedorId" é opcional: sem ele, conta todos os leilões.',
  })
  @ApiQuery({ name: 'vendedorId', required: false, description: 'Só os leilões deste vendedor' })
  @UseGuards(JwtOpcionalGuard)
  resumo(
    @Query('vendedorId') vendedorId?: string,
    @CurrentUser() usuario?: UsuarioAutenticado,
  ): Promise<Record<string, number>> {
    return this.auctionsService.resumoPorStatus(vendedorId || undefined, usuario);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca um leilão pelo id (livre, sem login)' })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ description: 'Leilão encontrado', type: AuctionResposta, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Id não é um uuid válido', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Leilão inexistente', type: ErroResposta })
  @UseGuards(JwtOpcionalGuard)
  buscarPorId(
    @Param('id', ParseUuidPipePt) id: string,
    @CurrentUser() usuario?: UsuarioAutenticado,
  ): Promise<AuctionResposta> {
    // O detalhe tambem traz a capa (o front nao precisa procurar a foto nos itens)
    return Promise.all([this.auctionsService.buscarVisivelPorId(id, usuario), this.auctionsService.capaDoLeilao(id)]).then(
      ([leilao, capaDocumentoId]) => comTransicoes({ ...leilao, capaDocumentoId, capaPadrao: capaPadrao(id) }),
    );
  }

  @Get(':id/indicadores')
  @ApiOperation({
    summary: 'Indicadores do leilão: total de itens/lances, maior lance, itens vendidos e total arrecadado (livre, sem login)',
    description: 'Resumo calculado na hora a partir dos itens e lances do leilão.',
  })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ description: 'Indicadores do leilão', type: IndicadoresAuctionResposta, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Id não é um uuid válido', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Leilão inexistente', type: ErroResposta })
  obterIndicadores(
    @Param('id', ParseUuidPipePt) id: string,
  ): Promise<IndicadoresAuctionResposta> {
    return this.auctionsService.obterIndicadores(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SELLER', 'ADMIN')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Atualiza título/descrição/datas (dono ou ADMIN, só em DRAFT)' })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ description: 'Leilão atualizado', type: AuctionResposta, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Id inválido ou corpo inválido', type: ErroResposta })
  @ApiUnauthorizedResponse({ description: 'Sem token, token inválido, ou X-API-KEY ausente/errada', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas não é o dono nem ADMIN', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Leilão inexistente', type: ErroResposta })
  @ApiConflictResponse({ description: 'O leilão já saiu de DRAFT (não pode mais editar)', type: ErroResposta })
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
    summary: 'Muda o status do leilão (dono ou ADMIN)',
    description:
      'Máquina de estados: DRAFT -> SCHEDULED -> OPEN -> CLOSED; CANCELED a ' +
      'partir de qualquer estado nao-final. "motivo" e obrigatório só para CANCELED. ' +
      'Ao fechar (CLOSED), cada item do leilão vira SOLD (com vencedor) ou UNSOLD.',
  })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ description: 'Status alterado (e histórico gravado)', type: AuctionResposta, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Id inválido, status desconhecido, ou motivo ausente ao cancelar', type: ErroResposta })
  @ApiUnauthorizedResponse({ description: 'Sem token, token inválido, ou X-API-KEY ausente/errada', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas não é o dono nem ADMIN', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Leilão inexistente', type: ErroResposta })
  @ApiConflictResponse({ description: 'Transição de status inválida para o estado atual', type: ErroResposta })
  mudarStatus(
    @Param('id', ParseUuidPipePt) id: string,
    @Body() dto: MudarStatusDto,
    @CurrentUser() usuario: UsuarioAutenticado,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<AuctionResposta> {
    return this.auctionsService.mudarStatus(id, dto, usuario, contexto).then(comTransicoes);
  }

  @Patch(':id/reativar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Reativa um leilão cancelado (só o ADMIN, com motivo)',
    description:
      'Volta ao estado em que o leilão estava antes de ser cancelado. Se estava aberto ou agendado e o prazo ' +
      'já venceu, a data de fim passa a ser daqui a 48 horas. Os itens voltam a ficar disponíveis e os lances continuam guardados.',
  })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ description: 'Leilão reativado (e histórico gravado)', type: AuctionResposta, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Id inválido ou motivo ausente', type: ErroResposta })
  @ApiUnauthorizedResponse({ description: 'Sem token, token inválido, ou X-API-KEY ausente/errada', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas não é ADMIN', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Leilão inexistente', type: ErroResposta })
  @ApiConflictResponse({ description: 'O leilão não está cancelado', type: ErroResposta })
  reativar(
    @Param('id', ParseUuidPipePt) id: string,
    @Body() dto: ReativarAuctionDto,
    @CurrentUser() usuario: UsuarioAutenticado,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<AuctionResposta> {
    return this.auctionsService.reativar(id, dto, usuario, contexto).then(comTransicoes);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SELLER', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Remove um leilão (dono ou ADMIN, só em DRAFT)' })
  @ApiParam(PARAM_ID)
  @ApiNoContentResponse({ description: 'Leilão removido', headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Id não é um uuid válido', type: ErroResposta })
  @ApiUnauthorizedResponse({ description: 'Sem token, token inválido, ou X-API-KEY ausente/errada', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas não é o dono nem ADMIN', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Leilão inexistente', type: ErroResposta })
  @ApiConflictResponse({ description: 'O leilão já saiu de DRAFT (não pode mais remover)', type: ErroResposta })
  remover(
    @Param('id', ParseUuidPipePt) id: string,
    @CurrentUser() usuario: UsuarioAutenticado,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<void> {
    return this.auctionsService.remover(id, usuario, contexto);
  }
}
