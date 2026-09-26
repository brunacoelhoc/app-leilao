import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
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
import { EsqueciSenhaDto } from './dto/esqueci-senha.dto';
import { RedefinirSenhaDto } from './dto/redefinir-senha.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { RecuperacaoSenhaService } from './recuperacao-senha.service';
import { LoginDto } from './dto/login.dto';
import { RegistrarUsuarioDto } from './dto/registrar-usuario.dto';

// Rotas publicas: exigem X-API-KEY (guard global), mas nao exigem JWT
@ApiTags('Auth')
@ApiSecurity('api-key')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly recuperacaoSenhaService: RecuperacaoSenhaService,
  ) {}

  // POST devolve 201 por padrao, e faz sentido aqui: um usuario novo foi criado
  // Limite proprio, mais baixo que o geral: rota publica e alvo comum de bots de cadastro em massa
  @Post('registrar')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Cria uma conta nova',
    description:
      'Sempre nasce como BIDDER -- não existe campo "papel" aceito aqui, ' +
      'de propósito (evita autopromoção a ADMIN/SELLER pelo cadastro).',
  })
  @ApiCreatedResponse({ description: 'Conta criada (sem a senha na resposta)', type: UsuarioEntity, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Corpo inválido (nome curto, e-mail inválido, senha fora do padrão, campo desconhecido como "papel")', type: ErroResposta })
  @ApiConflictResponse({ description: 'Já existe uma conta com este e-mail', type: ErroResposta })
  @ApiTooManyRequestsResponse({ description: 'Mais de 10 tentativas de registro no último minuto', type: ErroResposta, headers: HEADER_RETRY_AFTER })
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
      'A mesma mensagem genérica ("Credenciais inválidas") sai tanto para ' +
      'e-mail inexistente quanto para senha errada, e o tempo de resposta e ' +
      'igual nos dois casos -- ninguém descobre quais e-mails estão cadastrados.',
  })
  @ApiOkResponse({ description: 'Login ok: devolve { accessToken, usuário }', headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Corpo inválido (e-mail inválido, senha ausente)', type: ErroResposta })
  @ApiUnauthorizedResponse({ description: 'E-mail inexistente ou senha errada (mensagem genérica, de propósito)', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Senha certa, mas a conta foi desativada pelo ADMIN', type: ErroResposta })
  @ApiTooManyRequestsResponse({ description: 'Mais de 10 tentativas de login no último minuto', type: ErroResposta, headers: HEADER_RETRY_AFTER })
  login(
    @Body() dto: LoginDto,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<RespostaLogin> {
    return this.authService.login(dto, contexto);
  }

  // Recuperacao de senha em 2 passos. A resposta do 1o passo e sempre a mesma (o e-mail existindo ou nao)
  @Post('esqueci-senha')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Pede um código de recuperação de senha (passo 1)',
    description:
      'Gera um código de 6 dígitos válido por 15 minutos (guardado só como hash) e o "envia" por e-mail ' +
      '(entrega simulada: o código aparece no log do servidor). A resposta e SEMPRE a mesma, exista o e-mail ou não. ' +
      'Limite de 3 pedidos por hora por conta; um pedido novo cancela o anterior.',
  })
  @ApiOkResponse({ description: 'Resposta genérica: { mensagem }', headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'E-mail com formato inválido', type: ErroResposta })
  @ApiTooManyRequestsResponse({ description: 'Mais de 5 pedidos no último minuto (por IP)', type: ErroResposta, headers: HEADER_RETRY_AFTER })
  esqueciSenha(
    @Body() dto: EsqueciSenhaDto,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<{ mensagem: string }> {
    return this.recuperacaoSenhaService.solicitar(dto, contexto);
  }

  @Post('redefinir-senha')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Troca a senha com o código recebido (passo 2)',
    description:
      'O código e de uso único, vale 15 minutos e aceita no máximo 5 tentativas (depois disso e queimado e e preciso pedir outro). ' +
      'Todo erro de código devolve a mesma mensagem. A nova senha segue a mesma regra de força do cadastro.',
  })
  @ApiOkResponse({ description: 'Senha trocada: { mensagem }', headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Corpo inválido (código fora de 6 dígitos, senha fraca) ou código incorreto/expirado/usado', type: ErroResposta })
  @ApiTooManyRequestsResponse({ description: 'Mais de 10 tentativas no último minuto (por IP)', type: ErroResposta, headers: HEADER_RETRY_AFTER })
  redefinirSenha(
    @Body() dto: RedefinirSenhaDto,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<{ mensagem: string }> {
    return this.recuperacaoSenhaService.redefinir(dto, contexto);
  }

  // Renova o acesso com o refresh token (de uso unico: cada renovacao devolve um refresh token novo)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Renova o access token com o refresh token',
    description:
      'O access token dura poucos minutos. O refresh token é rotativo e de uso único: a resposta traz um par novo e o ' +
      'anterior deixa de valer. Se um refresh token já usado aparecer de novo (possível roubo), a sessão inteira e revogada. ' +
      'A sessão expira após 7 dias sem uso.',
  })
  @ApiOkResponse({ description: 'Par novo: { accessToken, refreshToken, usuário }', headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'refreshToken ausente ou mal formado', type: ErroResposta })
  @ApiUnauthorizedResponse({ description: 'Refresh token inválido, já usado, revogado ou expirado (mensagem única)', type: ErroResposta })
  @ApiTooManyRequestsResponse({ description: 'Mais de 20 renovações no último minuto (por IP)', type: ErroResposta, headers: HEADER_RETRY_AFTER })
  renovar(
    @Body() dto: RefreshDto,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<RespostaLogin> {
    return this.authService.renovar(dto, contexto);
  }

  // Logout de verdade: revoga a sessao no servidor (o token deixa de funcionar na hora)
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Encerra a sessão atual (logout que invalida o token)',
    description: 'O access token usado e o refresh token da mesma sessão param de funcionar imediatamente.',
  })
  @ApiNoContentResponse({ description: 'Sessão encerrada', headers: HEADER_REQUEST_ID })
  @ApiUnauthorizedResponse({ description: 'Token ausente, inválido ou sessão já encerrada', type: ErroResposta })
  async sair(
    @CurrentUser() usuario: UsuarioAutenticado,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<void> {
    await this.authService.encerrarSessao(usuario, contexto);
  }
}
