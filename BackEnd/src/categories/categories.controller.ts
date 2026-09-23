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
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiRespostaPaginada } from '../common/dto/api-resposta-paginada.decorator';
import { ContextoDaRequisicao } from '../common/decorators/contexto-requisicao.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { ContextoRequisicao } from '../common/interfaces/contexto-requisicao.interface';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { PaginacaoQueryDto } from '../common/dto/paginacao-query.dto';
import { ParseUuidPipePt } from '../common/pipes/parse-uuid.pipe';
import { HEADER_REQUEST_ID } from '../common/swagger-headers';
import { ErroResposta } from '../common/dto/erro-resposta.dto';
import type { RespostaPaginada } from '../common/utils/paginacao.util';
import type { Category } from '../generated/prisma/client';
import { CategoriesService } from './categories.service';
import { AtualizarCategoriaDto } from './dto/atualizar-categoria.dto';
import { CategoriaResposta } from './dto/categoria-resposta.dto';
import { CriarCategoriaDto } from './dto/criar-categoria.dto';

const PARAM_ID = {
  name: 'id',
  description: 'Id (uuid) da categoria',
  example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
};

// Leitura (GET) e livre para qualquer requisicao com a X-API-KEY (sem exigir login).
// Escrever (POST/PATCH/DELETE) exige estar logado E ser ADMIN
@ApiTags('Categories')
@ApiSecurity('api-key')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Cria uma categoria (ADMIN)' })
  @ApiCreatedResponse({ description: 'Categoria criada', type: CategoriaResposta, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Corpo invalido (nome ausente/curto/longo demais)', type: ErroResposta })
  @ApiUnauthorizedResponse({ description: 'Sem token, token invalido, ou X-API-KEY ausente/errada', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas nao e ADMIN', type: ErroResposta })
  criar(
    @Body() dto: CriarCategoriaDto,
    @CurrentUser() usuario: UsuarioAutenticado,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<Category> {
    return this.categoriesService.criar(dto, usuario, contexto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista todas as categorias, paginado (livre, sem login)' })
  @ApiRespostaPaginada(CategoriaResposta)
  listarTodos(
    @Query() query: PaginacaoQueryDto,
  ): Promise<RespostaPaginada<Category>> {
    return this.categoriesService.listarTodos(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca uma categoria pelo id (livre, sem login)' })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ description: 'Categoria encontrada', type: CategoriaResposta, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Id nao e um uuid valido', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Categoria inexistente', type: ErroResposta })
  buscarPorId(@Param('id', ParseUuidPipePt) id: string): Promise<Category> {
    return this.categoriesService.buscarPorId(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Atualiza uma categoria (ADMIN)' })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ description: 'Categoria atualizada', type: CategoriaResposta, headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Id invalido ou corpo invalido', type: ErroResposta })
  @ApiUnauthorizedResponse({ description: 'Sem token, token invalido, ou X-API-KEY ausente/errada', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas nao e ADMIN', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Categoria inexistente', type: ErroResposta })
  atualizar(
    @Param('id', ParseUuidPipePt) id: string,
    @Body() dto: AtualizarCategoriaDto,
    @CurrentUser() usuario: UsuarioAutenticado,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<Category> {
    return this.categoriesService.atualizar(id, dto, usuario, contexto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Remove uma categoria (ADMIN)' })
  @ApiParam(PARAM_ID)
  @ApiNoContentResponse({ description: 'Categoria removida', headers: HEADER_REQUEST_ID })
  @ApiBadRequestResponse({ description: 'Id nao e um uuid valido', type: ErroResposta })
  @ApiUnauthorizedResponse({ description: 'Sem token, token invalido, ou X-API-KEY ausente/errada', type: ErroResposta })
  @ApiForbiddenResponse({ description: 'Autenticado, mas nao e ADMIN', type: ErroResposta })
  @ApiNotFoundResponse({ description: 'Categoria inexistente', type: ErroResposta })
  @ApiConflictResponse({ description: 'Categoria em uso por algum item (onDelete: Restrict)', type: ErroResposta })
  remover(
    @Param('id', ParseUuidPipePt) id: string,
    @CurrentUser() usuario: UsuarioAutenticado,
    @ContextoDaRequisicao() contexto: ContextoRequisicao,
  ): Promise<void> {
    return this.categoriesService.remover(id, usuario, contexto);
  }
}
