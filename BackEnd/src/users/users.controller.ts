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
import { CriarUsuarioAdminDto } from './dto/criar-usuario-admin.dto';
import { RequisitosVendedorResposta } from './dto/requisitos-vendedor-resposta.dto';
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

  @Get('me/vendedor')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'O que falta para eu virar vendedor? (a lista de requisitos e decidida pelo servidor)',
  })
  @ApiOkResponse({ type: RequisitosVendedorResposta })
  async requisitosVendedor(@CurrentUser() usuario: UsuarioAutenticado): Promise<RequisitosVendedorResposta> {
    const eu = await this.usersService.buscarPorIdOuFalhar(usuario.id);
    const r = await this.usersService.avaliarRequisitosVendedor(eu);
    const requisitos = [
      { campo: 'telefone', rotulo: 'Telefone', ok: !r.faltando.includes('telefone'), ajuda: 'Informe seu telefone no perfil' },
      {
        campo: 'cpf',
        rotulo: 'CPF válido',
        ok: !r.faltando.includes('CPF') && !r.cpfInvalido && !r.cpfEmOutraConta,
        ajuda: r.cpfInvalido ? 'O CPF informado é inválido' : r.cpfEmOutraConta ? 'Este CPF já está em outra conta de vendedor' : 'Informe seu CPF no perfil',
      },
      { campo: 'endereco', rotulo: 'Endereço', ok: !r.faltando.includes('endereco'), ajuda: 'Informe seu endereço no perfil' },
    ];
    return {
      jaEVendedor: eu.papel === 'SELLER',
      podeSolicitar: eu.papel === 'BIDDER' && requisitos.every((x) => x.ok),
      requisitos,
    };
  }

  @Post('me/vendedor')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Quero vender: o proprio COMPRADOR passa a VENDEDOR (perfil completo exigido)',
    description:
      'Exige telefone, CPF valido e endereco no perfil; o CPF nao pode estar em outra conta de vendedor. ' +
      'Depois disso a mesma conta continua podendo comprar (nunca no proprio leilao). Efeito imediato.',
  })
  @ApiOkResponse({ description: 'Conta agora e SELLER', type: UsuarioEntity, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Perfil incompleto ou CPF invalido', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'ADMIN nao vira vendedor', type: ErroResposta })
  @ApiConflictResponse({ description: 'Ja e vendedor, ou o CPF ja esta em outra conta de vendedor', type: ErroResposta })
  async tornarVendedor(
    @CurrentUser() usuario: UsuarioAutenticado,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<UsuarioEntity> {
    const atualizado = await this.usersService.tornarVendedor(usuario.id);
    await this.auditLogService.registrar({
      usuarioId: usuario.id,
      papel: 'SELLER' as Role,
      acao: 'USUARIO_TORNOU_VENDEDOR',
      entidade: 'User',
      entidadeId: usuario.id,
      resultado: AuditResult.SUCCESS,
      statusHttp: 200,
      ...contexto,
    });
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

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Cria um usuario ja com o papel escolhido (so ADMIN)',
    description: 'Diferente do cadastro publico (sempre BIDDER), aqui o ADMIN escolhe BIDDER (comprador) ou SELLER (vendedor). A senha segue a mesma regra do cadastro.',
  })
  @ApiCreatedResponse({ description: 'Usuario criado (sem a senha na resposta)', type: UsuarioEntity, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Corpo invalido (nome curto, e-mail invalido, senha fora do padrao, papel diferente de BIDDER/SELLER)', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas nao e ADMIN', type: ErroResposta })
  @ApiConflictResponse({ description: 'Ja existe uma conta com este e-mail', type: ErroResposta })
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
    summary: 'Lista todos os usuarios, paginado (gestao pelo ADMIN)',
    description: 'Os dois filtros sao opcionais e podem ser combinados. E-mail, telefone, CPF e endereco saem MASCARADOS; o dado completo so em GET /users/:id.',
  })
  @ApiPaginacaoQuery()
  @ApiQuery({ name: 'papel', enum: Role, required: false, description: 'Filtra por papel' })
  @ApiQuery({ name: 'ativo', type: 'boolean', required: false, description: 'Filtra por conta ativa/desativada' })
  @ApiQuery({ name: 'busca', required: false, description: 'Trecho do nome ou do e-mail' })
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

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove um usuario SEM historico (so ADMIN)',
    description: 'Quem ja tem leiloes, lances ou arquivos nao pode ser apagado (o banco protege): use PATCH /users/:id/desativar.',
  })
  @ApiParam({ name: 'id', description: 'Id (uuid) do usuario', example: '8902e525-e1a7-46ad-bfd1-c0793761faab' })
  @ApiNoContentResponse({ description: 'Usuario removido' })
  @ApiBadRequestResponse({ description: 'Id nao e um uuid valido', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas nao e ADMIN', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Usuario inexistente', type: ErroResposta })
  @ApiConflictResponse({ description: 'O usuario tem historico (ou e o proprio ADMIN): desative em vez de remover', type: ErroResposta })
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
