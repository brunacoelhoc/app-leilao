import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ContextoDaRequisicao } from '../common/decorators/contexto-requisicao.decorator';
import type { ContextoRequisicao } from '../common/interfaces/contexto-requisicao.interface';
import { HEADER_REQUEST_ID, HEADER_RETRY_AFTER } from '../common/swagger-headers';
import { ErroResposta } from '../common/dto/erro-resposta.dto';
import { UsuarioEntity } from '../users/usuario.entity';
import { AuthService, RespostaLogin } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegistrarUsuarioDto } from './dto/registrar-usuario.dto';

// Rotas publicas: exigem X-API-KEY (guard global), mas nao exigem JWT
@ApiTags('Auth')
@ApiSecurity('api-key')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST devolve 201 por padrao, e faz sentido aqui: um usuario novo foi criado
  // Limite proprio, mais baixo que o geral: rota publica e alvo comum de bots de cadastro em massa
  @Post('registrar')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Cria uma conta nova',
    description:
      'Sempre nasce como BIDDER -- nao existe campo "papel" aceito aqui, ' +
      'de proposito (evita autopromocao a ADMIN/SELLER pelo cadastro).',
  })
  @ApiCreatedResponse({ description: 'Conta criada (sem a senha na resposta)', type: UsuarioEntity, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Corpo invalido (nome curto, e-mail invalido, senha fora do padrao, campo desconhecido como "papel")', type: ErroResposta })
  @ApiConflictResponse({ description: 'Ja existe uma conta com este e-mail', type: ErroResposta })
  @ApiTooManyRequestsResponse({ description: 'Mais de 10 tentativas de registro no ultimo minuto', type: ErroResposta, headers: HEADER_RETRY_AFTER })
  registrar(
    @Body() dto: RegistrarUsuarioDto,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<UsuarioEntity> {
    return this.authService.registrar(dto, contexto);
  }

  // Login nao cria nada, entao o correto e 200, nao o 201 padrao do POST
  // Limite proprio, bem mais baixo que o geral (100/min): o login e o alvo
  // classico de forca bruta de senha, e o limite geral sozinho seria fraco
  // demais para essa rota especifica
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Autentica e devolve o token JWT',
    description:
      'A mesma mensagem generica ("Credenciais invalidas") sai tanto para ' +
      'e-mail inexistente quanto para senha errada, e o tempo de resposta e ' +
      'igual nos dois casos -- ninguem descobre quais e-mails estao cadastrados.',
  })
  @ApiOkResponse({ description: 'Login ok: devolve { accessToken, usuario }', headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Corpo invalido (e-mail invalido, senha ausente)', type: ErroResposta })
  @ApiUnauthorizedResponse({ description: 'E-mail inexistente ou senha errada (mensagem generica, de proposito)', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Senha certa, mas a conta foi desativada pelo ADMIN', type: ErroResposta })
  @ApiTooManyRequestsResponse({ description: 'Mais de 10 tentativas de login no ultimo minuto', type: ErroResposta, headers: HEADER_RETRY_AFTER })
  login(
    @Body() dto: LoginDto,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<RespostaLogin> {
    return this.authService.login(dto, contexto);
  }
}
