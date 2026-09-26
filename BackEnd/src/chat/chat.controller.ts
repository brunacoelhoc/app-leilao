import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiExcludeController, ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ErroResposta } from '../common/dto/erro-resposta.dto';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { ParseUuidPipePt } from '../common/pipes/parse-uuid.pipe';
import { ChatService } from './chat.service';
import { CriarMensagemDto } from './dto/criar-mensagem.dto';
import { MensagemResposta } from './dto/mensagem-resposta.dto';

// Ler a conversa e livre (so a X-API-KEY); escrever exige login (qualquer papel)
@ApiExcludeController()
@ApiTags('Chat')
@ApiSecurity('api-key')
@Controller('auctions/:leilaoId/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  @ApiOperation({ summary: 'Últimas mensagens do chat do leilão, da mais antiga para a mais nova (livre, sem login)' })
  @ApiQuery({ name: 'limite', required: false, description: '1 a 100 (padrão 50)' })
  @ApiQuery({ name: 'depois', required: false, description: 'Data ISO: só mensagens mais novas que ela' })
  @ApiOkResponse({ type: MensagemResposta, isArray: true })
  @ApiNotFoundResponse({ description: 'Leilão inexistente', type: ErroResposta })
  listar(
    @Param('leilaoId', ParseUuidPipePt) leilaoId: string,
    @Query('limite') limite?: string,
    @Query('depois') depois?: string,
  ): Promise<MensagemResposta[]> {
    const n = Number.parseInt(limite ?? '', 10);
    const data = depois ? new Date(depois) : undefined;
    return this.chatService.listar(
      leilaoId,
      Number.isNaN(n) ? undefined : n,
      data && !Number.isNaN(data.getTime()) ? data : undefined,
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } }) // anti-spam: 20 mensagens por minuto
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Envia uma mensagem ao chat (qualquer usuário logado, só com o leilão aberto)' })
  @ApiCreatedResponse({ type: MensagemResposta })
  @ApiUnauthorizedResponse({ description: 'Sem token ou token inválido', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Leilão inexistente', type: ErroResposta })
  @ApiConflictResponse({ description: 'Leilão não está aberto', type: ErroResposta })
  enviar(
    @Param('leilaoId', ParseUuidPipePt) leilaoId: string,
    @Body() dto: CriarMensagemDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<MensagemResposta> {
    return this.chatService.enviar(leilaoId, usuario.id, dto.texto);
  }
}
