import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
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
import { AuditLogService } from '../audit/audit-log.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContextoDaRequisicao } from '../common/decorators/contexto-requisicao.decorator';
import type { ContextoRequisicao } from '../common/interfaces/contexto-requisicao.interface';
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
  });
}

// Qualquer autenticado ve o proprio perfil (/me); listar todos e
// (des)ativar sao so do ADMIN. Registrado no AuthModule (nao no
// UsersModule) para nao criar dependencia circular: o AuthModule ja
// importa o UsersModule para usar o UsersService
@ApiTags('Users')
@ApiSecurity('api-key')
@ApiBearerAuth('jwt') // toda rota deste controller exige login
@ApiUnauthorizedResponse({ description: 'Sem token, token invalido/expirado, ou X-API-KEY ausente/errada', type: ErroResposta })
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Perfil do proprio usuario logado' })
  @ApiOkResponse({ description: 'Perfil do usuario (sem a senha)', type: UsuarioEntity, headers: HEADER_REQUEST_ID })
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
    summary: 'Edita o proprio perfil (nome, e-mail, telefone, endereco, cpf, avatar)',
    description: 'Todos os campos sao opcionais. Nao altera papel, ativo nem senha. Trocar o e-mail exige a senha atual em "senhaAtual".',
  })
  @ApiOkResponse({ description: 'Perfil atualizado', type: UsuarioEntity, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Corpo invalido (telefone/cpf com formato errado, campo desconhecido)', type: ErroResposta })
  async atualizarMeuPerfil(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: AtualizarPerfilDto,
  ): Promise<UsuarioEntity> {
    const atualizado = await this.usersService.atualizarPerfil(usuario.id, dto);
    return new UsuarioEntity(atualizado);
  }

  @Patch('me/senha')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Troca a propria senha',
    description: 'Exige a senha atual. A nova senha segue a mesma regra de forca do registro.',
  })
  @ApiNoContentResponse({ description: 'Senha alterada', headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Nova senha fora do padrao exigido', type: ErroResposta })
  async alterarMinhaSenha(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: AlterarSenhaDto,
  ): Promise<void> {
    await this.usersService.alterarSenha(usuario.id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Lista todos os usuarios, paginado (gestao pelo ADMIN)',
    description: 'Os dois filtros sao opcionais e podem ser combinados. E-mail, telefone, CPF e endereco saem MASCARADOS; o dado completo so em GET /users/:id.',
  })
  @ApiPaginacaoQuery()
  @ApiQuery({ name: 'papel', enum: Role, required: false, description: 'Filtra por papel' })
  @ApiQuery({ name: 'ativo', type: 'boolean', required: false, description: 'Filtra por conta ativa/desativada' })
  @ApiRespostaPaginada(UsuarioEntity)
  @ApiForbiddenResponse({ description: 'Autenticado, mas nao e ADMIN', type: ErroResposta })
  async listarTodos(
    @Query() query: ListarUsuariosQueryDto,
  ): Promise<RespostaPaginada<UsuarioEntity>> {
    const resultado = await this.usersService.listarTodos({
      pagina: query.pagina,
      limite: query.limite,
      papel: query.papel,
      ativo: query.ativo === undefined ? undefined : query.ativo === 'true',
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
    summary: 'Detalhe COMPLETO de um usuario, com dados sensiveis (so ADMIN)',
    description: 'Cada consulta fica registrada na auditoria (USUARIO_DADOS_VISTOS).',
  })
  @ApiParam({ name: 'id', description: 'Id (uuid) do usuario', example: '8902e525-e1a7-46ad-bfd1-c0793761faab' })
  @ApiOkResponse({ description: 'Usuario com dados completos (sem a senha)', type: UsuarioEntity, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Id nao e um uuid valido', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas nao e ADMIN', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Usuario inexistente', type: ErroResposta })
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
  @ApiOperation({ summary: 'Desativa um usuario (gestao pelo ADMIN)' })
  @ApiParam({ name: 'id', description: 'Id (uuid) do usuario', example: '8902e525-e1a7-46ad-bfd1-c0793761faab' })
  @ApiOkResponse({ description: 'Usuario desativado (ativo=false)', type: UsuarioEntity, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Id nao e um uuid valido', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas nao e ADMIN', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Usuario inexistente', type: ErroResposta })
  @ApiConflictResponse({ description: 'O ADMIN esta tentando desativar a propria conta', type: ErroResposta })
  async desativar(
    @Param('id', ParseUuidPipePt) id: string,
    @CurrentUser() usuarioLogado: UsuarioAutenticado,
  ): Promise<UsuarioEntity> {
    const atualizado = await this.usersService.desativar(id, usuarioLogado);
    return mascarado(atualizado);
  }

  @Patch(':id/reativar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Reativa um usuario (gestao pelo ADMIN)' })
  @ApiParam({ name: 'id', description: 'Id (uuid) do usuario', example: '8902e525-e1a7-46ad-bfd1-c0793761faab' })
  @ApiOkResponse({ description: 'Usuario reativado (ativo=true)', type: UsuarioEntity, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Id nao e um uuid valido', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas nao e ADMIN', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Usuario inexistente', type: ErroResposta })
  async reativar(
    @Param('id', ParseUuidPipePt) id: string,
  ): Promise<UsuarioEntity> {
    const atualizado = await this.usersService.reativar(id);
    return mascarado(atualizado);
  }
}
