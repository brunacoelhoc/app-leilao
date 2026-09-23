import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogService } from '../audit/audit-log.service';
import type { ContextoRequisicao } from '../common/interfaces/contexto-requisicao.interface';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import {
  calcularPaginacao,
  paginar,
  type ParametrosPaginacao,
  type RespostaPaginada,
} from '../common/utils/paginacao.util';
import { AuditResult, type Category, type Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AtualizarCategoriaDto } from './dto/atualizar-categoria.dto';
import type { CriarCategoriaDto } from './dto/criar-categoria.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async criar(
    dto: CriarCategoriaDto,
    usuario: UsuarioAutenticado,
    contexto: ContextoRequisicao,
  ): Promise<Category> {
    try {
      const categoria = await this.prisma.category.create({ data: dto });
      await this.registrarAuditoria(
        'CATEGORIA_CRIADA',
        categoria.id,
        usuario,
        contexto,
        AuditResult.SUCCESS,
        201,
      );
      return categoria;
    } catch (erro) {
      await this.registrarAuditoria(
        'CATEGORIA_CRIADA',
        undefined,
        usuario,
        contexto,
        AuditResult.REJECTED,
        this.statusDoErro(erro),
        this.motivoDoErro(erro),
      );
      throw erro;
    }
  }

  async listarTodos(
    params: ParametrosPaginacao,
  ): Promise<RespostaPaginada<Category>> {
    const paginacao = calcularPaginacao(params);
    const [dados, total] = await Promise.all([
      this.prisma.category.findMany({
        orderBy: { nome: 'asc' },
        skip: paginacao.skip,
        take: paginacao.take,
      }),
      this.prisma.category.count(),
    ]);
    return paginar(dados, total, paginacao);
  }

  async buscarPorId(id: string): Promise<Category> {
    const categoria = await this.prisma.category.findUnique({ where: { id } });
    if (!categoria) {
      throw new NotFoundException('Categoria não encontrada');
    }
    return categoria;
  }

  async atualizar(
    id: string,
    dto: AtualizarCategoriaDto,
    usuario: UsuarioAutenticado,
    contexto: ContextoRequisicao,
  ): Promise<Category> {
    try {
      await this.buscarPorId(id); // garante o 404 com mensagem propria antes de tentar atualizar
      const categoria = await this.prisma.category.update({
        where: { id },
        data: dto,
      });
      await this.registrarAuditoria(
        'CATEGORIA_ATUALIZADA',
        id,
        usuario,
        contexto,
        AuditResult.SUCCESS,
        200,
      );
      return categoria;
    } catch (erro) {
      await this.registrarAuditoria(
        'CATEGORIA_ATUALIZADA',
        id,
        usuario,
        contexto,
        AuditResult.REJECTED,
        this.statusDoErro(erro),
        this.motivoDoErro(erro),
      );
      throw erro;
    }
  }

  async remover(
    id: string,
    usuario: UsuarioAutenticado,
    contexto: ContextoRequisicao,
  ): Promise<void> {
    try {
      await this.buscarPorId(id);
      // Se a categoria tiver itens, o banco recusa (Restrict) e o filtro global traduz para 409
      await this.prisma.category.delete({ where: { id } });
      await this.registrarAuditoria(
        'CATEGORIA_REMOVIDA',
        id,
        usuario,
        contexto,
        AuditResult.SUCCESS,
        204,
      );
    } catch (erro) {
      await this.registrarAuditoria(
        'CATEGORIA_REMOVIDA',
        id,
        usuario,
        contexto,
        AuditResult.REJECTED,
        this.statusDoErro(erro),
        this.motivoDoErro(erro),
      );
      throw erro;
    }
  }

  private statusDoErro(erro: unknown): number {
    return erro instanceof HttpException ? erro.getStatus() : 500;
  }

  private motivoDoErro(erro: unknown): string {
    return erro instanceof HttpException
      ? erro.message
      : 'Erro interno ao processar a categoria';
  }

  private registrarAuditoria(
    acao: string,
    categoriaId: string | undefined,
    usuario: UsuarioAutenticado,
    contexto: ContextoRequisicao,
    resultado: AuditResult,
    statusHttp: number,
    motivo?: string,
  ): Promise<void> {
    return this.auditLogService.registrar({
      usuarioId: usuario.id,
      papel: usuario.papel as Role,
      acao,
      entidade: 'Category',
      entidadeId: categoriaId,
      resultado,
      motivo,
      statusHttp,
      ...contexto,
    });
  }
}
