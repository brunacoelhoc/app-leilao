import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Category } from '../generated/prisma/client';
import type { AtualizarCategoriaDto } from './dto/atualizar-categoria.dto';
import type { CriarCategoriaDto } from './dto/criar-categoria.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  criar(dto: CriarCategoriaDto): Promise<Category> {
    return this.prisma.category.create({ data: dto });
  }

  listarTodos(): Promise<Category[]> {
    return this.prisma.category.findMany({ orderBy: { nome: 'asc' } });
  }

  async buscarPorId(id: string): Promise<Category> {
    const categoria = await this.prisma.category.findUnique({ where: { id } });
    if (!categoria) {
      throw new NotFoundException('Categoria nao encontrada');
    }
    return categoria;
  }

  async atualizar(id: string, dto: AtualizarCategoriaDto): Promise<Category> {
    await this.buscarPorId(id); // garante o 404 com mensagem propria antes de tentar atualizar
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async remover(id: string): Promise<void> {
    await this.buscarPorId(id);
    // Se a categoria tiver itens, o banco recusa (Restrict) e o filtro global traduz para 409
    await this.prisma.category.delete({ where: { id } });
  }
}
