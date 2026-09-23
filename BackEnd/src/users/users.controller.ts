import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { ParseUuidPipePt } from '../common/pipes/parse-uuid.pipe';
import { HEADER_REQUEST_ID } from '../common/swagger-headers';
import { ErroResposta } from '../common/dto/erro-resposta.dto';
import type { RespostaPaginada } from '../common/utils/paginacao.util';
import { Role } from '../generated/prisma/client';
import { ListarUsuariosQueryDto } from './dto/listar-usuarios-query.dto';
import { UsersService } from './users.service';
import { UsuarioEntity } from './usuario.entity';

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
  constructor(private readonly usersService: UsersService) {}

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

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Lista todos os usuarios, paginado (gestao pelo ADMIN)',
    description: 'Os dois filtros sao opcionais e podem ser combinados.',
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
      dados: resultado.dados.map((usuario) => new UsuarioEntity(usuario)),
    };
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
    return new UsuarioEntity(atualizado);
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
    return new UsuarioEntity(atualizado);
  }
}
