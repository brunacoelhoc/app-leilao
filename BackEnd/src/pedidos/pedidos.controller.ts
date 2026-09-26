import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ErroResposta } from '../common/dto/erro-resposta.dto';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { ParseUuidPipePt } from '../common/pipes/parse-uuid.pipe';
import { DefinirEntregaDto, PagarPedidoDto, PedidoResposta } from './dto/pedido.dto';
import { PedidosService } from './pedidos.service';

const PARAM_ITEM_ID = { name: 'itemId', description: 'Id (uuid) do item vendido', example: 'b9e2a0f4-25a4-44b0-a33e-f804a9a8d0e7' };

// Pagamento (simulado) e retirada/entrega. Tudo restrito ao VENCEDOR do item
@ApiTags('Pedidos')
@ApiSecurity('api-key')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('auction-items/:itemId/pedido')
export class PedidosController {
  constructor(private readonly pedidosService: PedidosService) {}

  @Get()
  @ApiOperation({ summary: 'Pedido do vencedor (só consulta, não grava). Passo 0: ver o que falta' })
  @ApiParam(PARAM_ITEM_ID)
  @ApiOkResponse({ type: PedidoResposta })
  @ApiUnauthorizedResponse({ description: 'Sem token, token inválido, ou X-API-KEY ausente/errada', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Quem não é o vencedor do item', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Item inexistente', type: ErroResposta })
  @ApiConflictResponse({ description: 'Item ainda não foi vendido', type: ErroResposta })
  obter(@Param('itemId', ParseUuidPipePt) itemId: string, @CurrentUser() usuario: UsuarioAutenticado): Promise<PedidoResposta> {
    return this.pedidosService.obter(itemId, usuario);
  }

  @Post('pagamento')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Passo 1: paga o pedido (SIMULADO: PIX, CARTAO ou BOLETO). Libera a retirada' })
  @ApiParam(PARAM_ITEM_ID)
  @ApiOkResponse({ type: PedidoResposta })
  @ApiBadRequestResponse({ description: 'formaPagamento inválida', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Quem não é o vencedor do item', type: ErroResposta })
  @ApiConflictResponse({ description: 'Item não vendido ou pedido já pago', type: ErroResposta })
  pagar(
    @Param('itemId', ParseUuidPipePt) itemId: string,
    @Body() dto: PagarPedidoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<PedidoResposta> {
    return this.pedidosService.pagar(itemId, dto, usuario);
  }

  @Post('entrega')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Passo 2: escolhe RETIRADA (gera código) ou ENTREGA em casa (exige endereço). Só depois de pagar' })
  @ApiParam(PARAM_ITEM_ID)
  @ApiOkResponse({ type: PedidoResposta })
  @ApiBadRequestResponse({ description: 'tipoEntrega inválido, ou ENTREGA sem enderecoEntrega', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Quem não é o vencedor do item', type: ErroResposta })
  @ApiConflictResponse({ description: 'Pedido ainda não pago, ou entrega já definida', type: ErroResposta })
  definirEntrega(
    @Param('itemId', ParseUuidPipePt) itemId: string,
    @Body() dto: DefinirEntregaDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<PedidoResposta> {
    return this.pedidosService.definirEntrega(itemId, dto, usuario);
  }
}
