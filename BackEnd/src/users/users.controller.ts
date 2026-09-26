import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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
import { Throttle } from '@nestjs/throttler';
import { AuditLogService } from '../audit/audit-log.service';
import { SessaoService } from '../auth/sessao.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContextoDaRequisicao } from '../common/decorators/contexto-requisicao.decorator';
import type { ContextoRequisicao } from '../common/interfaces/contexto-requisicao.interface';
import { camposFaltandoDaConta } from '../common/utils/perfil-completo.util';
import { mascararCpf, mascararEmail, mascararEndereco, mascararTelefone } from '../common/utils/mascara.util';
import { ApiPaginacaoQuery, ApiRespostaPaginada } from '../common/dto/api-resposta-paginada.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { ParseUuidPipePt } from '../common/pipes/parse-uuid.pipe';
import { HEADER_REQUEST_ID } from '../common/swagger-headers';
import { ErroResposta } from '../common/dto/erro-resposta.dto';
import type { RespostaPaginada } from '../common/utils/paginacao.util';
import { AuditResult, Role, type User } from '../generated/prisma/client';
import { AlterarSenhaDto } from './dto/alterar-senha.dto';
import { AtualizarPerfilDto } from './dto/atualizar-perfil.dto';
import { CriarUsuarioAdminDto } from './dto/criar-usuario-admin.dto';
import { EncerrarContaDto } from './dto/encerrar-conta.dto';
import { TrocarModoDto } from './dto/trocar-modo.dto';
import { ListarUsuariosQueryDto } from './dto/listar-usuarios-query.dto';
import { UsersService } from './users.service';
import { UsuarioEntity } from './usuario.entity';

// Versao MASCARADA de um usuario (dados sensiveis nunca saem completos, exceto em GET /users/:id)
function mascarado(usuario: User): UsuarioEntity {
  return new UsuarioEntity({
    ...usuario,
    email: mascararEmail(usuario.email),
    telefone: mascararTelefone(usuario.telefone),
    cpf: mascararCpf(usuario.cpf),
    endereco: mascararEndereco(usuario.endereco),
    camposFaltando: camposFaltandoDaConta(usuario),
  });
}

// Qualquer autenticado ve o proprio perfil (/me); listar todos e
// (des)ativar sao so do ADMIN. Registrado no AuthModule (nao no
// UsersModule) para nao criar dependencia circular: o AuthModule ja
// importa o UsersModule para usar o UsersService
@ApiTags('Users')
@ApiSecurity('api-key')
@ApiBearerAuth('jwt') // toda rota deste controller exige login
@ApiUnauthorizedResponse({ description: 'Sem token, token inválido/expirado, ou X-API-KEY ausente/errada', type: ErroResposta })
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditLogService: AuditLogService,
    private readonly sessaoService: SessaoService,
  ) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Perfil do próprio usuário logado' })
  @ApiOkResponse({ description: 'Perfil do usuário (sem a senha)', type: UsuarioEntity, headers: HEADER_REQUEST_ID })
  async meuPerfil(
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<UsuarioEntity> {
    const encontrado = await this.usersService.buscarPorIdOuFalhar(usuario.id);
    return new UsuarioEntity(encontrado);
  }

  // Sempre usa o id do TOKEN (@CurrentUser), nunca um id vindo do corpo/URL:
  // ninguem edita o perfil de outra pessoa por aqui
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Edita o próprio perfil (nome, e-mail, telefone, endereço, cpf, avatar)',
    description: 'Todos os campos são opcionais. Não altera papel, ativo nem senha. Trocar o e-mail exige a senha atual em "senhaAtual".',
  })
  @ApiOkResponse({ description: 'Perfil atualizado', type: UsuarioEntity, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Corpo inválido (telefone/cpf com formato errado, campo desconhecido)', type: ErroResposta })
  async atualizarMeuPerfil(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: AtualizarPerfilDto,
  ): Promise<UsuarioEntity> {
    const atualizado = await this.usersService.atualizarPerfil(usuario.id, dto);
    return new UsuarioEntity(atualizado);
  }

  @Patch('me/modo')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Troca o modo da conta: COMPRADOR (dá lances) <-> VENDEDOR (cria leilões)',
    description:
      'Um clique, sem completar perfil. Modo vendedor: cria leilões e NAO da lances. Modo comprador: da lances e ' +
      'NAO cria leilões. Ninguém da lance no próprio leilão, seja qual for o modo. ADMIN não troca de modo. Efeito imediato.',
  })
  @ApiOkResponse({ description: 'Conta no novo modo', type: UsuarioEntity, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'modo diferente de BIDDER/SELLER', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'ADMIN não troca de modo', type: ErroResposta })
  @ApiConflictResponse({ description: 'A conta já está nesse modo', type: ErroResposta })
  async trocarModo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: TrocarModoDto,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<UsuarioEntity> {
    const atualizado = await this.usersService.trocarModo(usuario.id, dto.modo);
    await this.auditLogService.registrar({
      usuarioId: usuario.id,
      papel: dto.modo as Role,
      acao: 'USUARIO_TROCOU_MODO',
      entidade: 'User',
      entidadeId: usuario.id,
      resultado: AuditResult.SUCCESS,
      statusHttp: 200,
      ...contexto,
    });
    return new UsuarioEntity(atualizado);
  }

  // LGPD: a propria pessoa encerra a conta. Os dados pessoais sao anonimizados; o historico (imutavel) fica
  @Post('me/encerrar-conta')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Encerra a própria conta e anonimiza os dados pessoais (LGPD)',
    description:
      'Exige a senha atual. Nome, e-mail, telefone, CPF, endereço e avatar são anonimizados; a conta fica inativa e sem sessões. ' +
      'O histórico (lances, leilões, pedidos, auditoria) é imutável e permanece, com o nome "Usuário removido". ' +
      'Não é possível com pendências: peça em disputa, leilão aberto/agendado ou pedido não finalizado (409). ADMIN não encerra por aqui (403).',
  })
  @ApiNoContentResponse({ description: 'Conta encerrada e dados anonimizados', headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Senha atual ausente ou incorreta', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'ADMIN não encerra a própria conta por aqui', type: ErroResposta })
  @ApiConflictResponse({ description: 'Há pendências: disputa, leilão em andamento ou pedido não finalizado', type: ErroResposta })
  async encerrarConta(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: EncerrarContaDto,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<void> {
    await this.usersService.encerrarConta(usuario.id, dto.senhaAtual);
    await this.auditLogService.registrar({
      usuarioId: usuario.id,
      papel: usuario.papel as Role,
      acao: 'CONTA_ENCERRADA',
      entidade: 'User',
      entidadeId: usuario.id,
      resultado: AuditResult.SUCCESS,
      statusHttp: 204,
      ...contexto,
    });
  }

  @Patch('me/senha')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Troca a própria senha',
    description: 'Exige a senha atual. A nova senha segue a mesma regra de força do registro.',
  })
  @ApiNoContentResponse({ description: 'Senha alterada', headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Nova senha fora do padrão exigido', type: ErroResposta })
  async alterarMinhaSenha(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: AlterarSenhaDto,
  ): Promise<void> {
    await this.usersService.alterarSenha(usuario.id, dto);
    // Trocou a senha: os outros aparelhos/sessoes sao derrubados; so esta continua
    await this.sessaoService.revogarTodas(usuario.id, usuario.sessaoId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Cria um usuário já com o papel escolhido (só ADMIN)',
    description: 'Diferente do cadastro público (sempre BIDDER), aqui o ADMIN escolhe BIDDER (comprador) ou SELLER (vendedor). A senha segue a mesma regra do cadastro.',
  })
  @ApiCreatedResponse({ description: 'Usuário criado (sem a senha na resposta)', type: UsuarioEntity, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Corpo inválido (nome curto, e-mail inválido, senha fora do padrão, papel diferente de BIDDER/SELLER)', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas não é ADMIN', type: ErroResposta })
  @ApiConflictResponse({ description: 'Já existe uma conta com este e-mail', type: ErroResposta })
  async criar(
    @Body() dto: CriarUsuarioAdminDto,
    @CurrentUser() admin: UsuarioAutenticado,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<UsuarioEntity> {
    const usuario = await this.usersService.criarPeloAdmin(dto);
    await this.auditLogService.registrar({
      usuarioId: admin.id,
      papel: admin.papel as Role,
      acao: 'USUARIO_CRIADO_PELO_ADMIN',
      entidade: 'User',
      entidadeId: usuario.id,
      resultado: AuditResult.SUCCESS,
      statusHttp: 201,
      ...contexto,
    });
    return new UsuarioEntity(usuario);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Lista todos os usuários, paginado (gestão pelo ADMIN)',
    description: 'Os dois filtros são opcionais e podem ser combinados. E-mail, telefone, CPF e endereço saem MASCARADOS; o dado completo só em GET /users/:id.',
  })
  @ApiPaginacaoQuery()
  @ApiQuery({ name: 'papel', enum: Role, required: false, description: 'Filtra por papel' })
  @ApiQuery({ name: 'ativo', type: 'boolean', required: false, description: 'Filtra por conta ativa/desativada' })
  @ApiQuery({ name: 'busca', required: false, description: 'Trecho do nome ou do e-mail' })
  @ApiRespostaPaginada(UsuarioEntity)
  @ApiForbiddenResponse({ description: 'Autenticado, mas não é ADMIN', type: ErroResposta })
  async listarTodos(
    @Query() query: ListarUsuariosQueryDto,
  ): Promise<RespostaPaginada<UsuarioEntity>> {
    const resultado = await this.usersService.listarTodos({
      pagina: query.pagina,
      limite: query.limite,
      papel: query.papel,
      ativo: query.ativo === undefined ? undefined : query.ativo === 'true',
      busca: query.busca?.trim() || undefined,
    });
    return {
      ...resultado,
      // Dados sensiveis saem MASCARADOS na listagem; o real so por GET /users/:id
      dados: resultado.dados.map(mascarado),
    };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Detalhe COMPLETO de um usuário, com dados sensíveis (só ADMIN)',
    description: 'Cada consulta fica registrada na auditoria (USUARIO_DADOS_VISTOS).',
  })
  @ApiParam({ name: 'id', description: 'Id (uuid) do usuário', example: '8902e525-e1a7-46ad-bfd1-c0793761faab' })
  @ApiOkResponse({ description: 'Usuário com dados completos (sem a senha)', type: UsuarioEntity, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Id não é um uuid válido', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas não é ADMIN', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Usuário inexistente', type: ErroResposta })
  async detalhe(
    @Param('id', ParseUuidPipePt) id: string,
    @CurrentUser() admin: UsuarioAutenticado,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<UsuarioEntity> {
    const usuario = await this.usersService.buscarPorIdOuFalhar(id);
    await this.auditLogService.registrar({
      usuarioId: admin.id,
      papel: admin.papel as Role,
      acao: 'USUARIO_DADOS_VISTOS',
      entidade: 'User',
      entidadeId: id,
      resultado: AuditResult.SUCCESS,
      statusHttp: 200,
      ...contexto,
    });
    return new UsuarioEntity(usuario);
  }

  @Patch(':id/desativar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Desativa um usuário (gestão pelo ADMIN)',
    description:
      'Bloqueia (409) quem está disputando peça ou e dono de leilão em andamento (aberto/agendado). Em emergencia (ex.: fraude), o ADMIN pode usar ' +
      '?forcar=true: a ação fica na auditoria e, no fechamento, os lances dessa conta são pulados (vence o próximo maior lance de uma conta ativa).',
  })
  @ApiQuery({ name: 'forcar', required: false, description: 'true = desativa mesmo com disputa em andamento (auditado)' })
  @ApiParam({ name: 'id', description: 'Id (uuid) do usuário', example: '8902e525-e1a7-46ad-bfd1-c0793761faab' })
  @ApiOkResponse({ description: 'Usuário desativado (ativo=false)', type: UsuarioEntity, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Id não é um uuid válido', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas não é ADMIN', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Usuário inexistente', type: ErroResposta })
  @ApiConflictResponse({ description: 'O ADMIN está tentando desativar a própria conta, ou o usuário está disputando peça em leilão em andamento (sem forcar=true)', type: ErroResposta })
  async desativar(
    @Param('id', ParseUuidPipePt) id: string,
    @CurrentUser() usuarioLogado: UsuarioAutenticado,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
    @Query('forcar') forcar?: string,
  ): Promise<UsuarioEntity> {
    const forcado = forcar === 'true';
    const atualizado = await this.usersService.desativar(id, usuarioLogado, forcado);
    if (forcado) {
      // Desativacao forcada (mesmo com disputa em andamento) fica registrada na auditoria
      await this.auditLogService.registrar({
        usuarioId: usuarioLogado.id,
        papel: usuarioLogado.papel as Role,
        acao: 'USUARIO_DESATIVADO_FORCADO',
        entidade: 'User',
        entidadeId: id,
        resultado: AuditResult.SUCCESS,
        statusHttp: 200,
        ...contexto,
      });
    }
    return mascarado(atualizado);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove um usuário SEM histórico (só ADMIN)',
    description: 'Quem já tem leilões, lances ou arquivos não pode ser apagado (o banco protege): use PATCH /users/:id/desativar.',
  })
  @ApiParam({ name: 'id', description: 'Id (uuid) do usuário', example: '8902e525-e1a7-46ad-bfd1-c0793761faab' })
  @ApiNoContentResponse({ description: 'Usuário removido' })
  @ApiBadRequestResponse({ description: 'Id não é um uuid válido', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas não é ADMIN', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Usuário inexistente', type: ErroResposta })
  @ApiConflictResponse({ description: 'O usuário tem histórico (ou é o próprio ADMIN): desative em vez de remover', type: ErroResposta })
  async remover(
    @Param('id', ParseUuidPipePt) id: string,
    @CurrentUser() admin: UsuarioAutenticado,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<void> {
    await this.usersService.remover(id, admin);
    await this.auditLogService.registrar({
      usuarioId: admin.id,
      papel: admin.papel as Role,
      acao: 'USUARIO_REMOVIDO',
      entidade: 'User',
      entidadeId: id,
      resultado: AuditResult.SUCCESS,
      statusHttp: 204,
      ...contexto,
    });
  }

  @Patch(':id/reativar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Reativa um usuário (gestão pelo ADMIN)' })
  @ApiParam({ name: 'id', description: 'Id (uuid) do usuário', example: '8902e525-e1a7-46ad-bfd1-c0793761faab' })
  @ApiOkResponse({ description: 'Usuário reativado (ativo=true)', type: UsuarioEntity, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Id não é um uuid válido', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas não é ADMIN', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Usuário inexistente', type: ErroResposta })
  async reativar(
    @Param('id', ParseUuidPipePt) id: string,
  ): Promise<UsuarioEntity> {
    const atualizado = await this.usersService.reativar(id);
    return mascarado(atualizado);
  }
}
