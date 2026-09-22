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
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ParseUuidPipePt } from '../common/pipes/parse-uuid.pipe';
import type { Category } from '../generated/prisma/client';
import { CategoriesService } from './categories.service';
import { AtualizarCategoriaDto } from './dto/atualizar-categoria.dto';
import { CriarCategoriaDto } from './dto/criar-categoria.dto';

// Leitura (GET) e livre para qualquer requisicao com a X-API-KEY (sem exigir login).
// Escrever (POST/PATCH/DELETE) exige estar logado E ser ADMIN
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  criar(@Body() dto: CriarCategoriaDto): Promise<Category> {
    return this.categoriesService.criar(dto);
  }

  @Get()
  listarTodos(): Promise<Category[]> {
    return this.categoriesService.listarTodos();
  }

  @Get(':id')
  buscarPorId(@Param('id', ParseUuidPipePt) id: string): Promise<Category> {
    return this.categoriesService.buscarPorId(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  atualizar(
    @Param('id', ParseUuidPipePt) id: string,
    @Body() dto: AtualizarCategoriaDto,
  ): Promise<Category> {
    return this.categoriesService.atualizar(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  remover(@Param('id', ParseUuidPipePt) id: string): Promise<void> {
    return this.categoriesService.remover(id);
  }
}
