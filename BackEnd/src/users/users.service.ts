import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import {
  calcularPaginacao,
  paginar,
  type ParametrosPaginacao,
  type RespostaPaginada,
} from '../common/utils/paginacao.util';
import type { Role, User } from '../generated/prisma/client';

interface FiltrosListagemUsuarios extends ParametrosPaginacao {
  papel?: Role;
  ativo?: boolean;
}

// Fala com a tabela User. A maior parte e so acesso ao banco (usado pelo
// AuthService no login/registro); (des)ativar e gestao pelo ADMIN moram aqui
// tambem, por serem regras sobre o USUARIO em si, nao sobre autenticacao
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // Cria o usuario. O papel e o ativo usam o padrao do schema (BIDDER e true)
  criar(dados: { nome: string; email: string; senha: string }): Promise<User> {
    return this.prisma.user.create({ data: dados });
  }

  // Usado no login, para achar a conta pelo e-mail
  buscarPorEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  // Usado a cada requisicao autenticada, para confirmar que o usuario ainda existe e esta ativo
  buscarPorId(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async buscarPorIdOuFalhar(id: string): Promise<User> {
    const usuario = await this.buscarPorId(id);
    if (!usuario) {
      throw new NotFoundException('Usuario nao encontrado');
    }
    return usuario;
  }

  // Gestao pelo ADMIN: lista todo mundo, paginado, do mais recente pro mais
  // antigo. Os dois filtros sao opcionais (Prisma ignora um "where" com undefined)
  async listarTodos(
    filtros: FiltrosListagemUsuarios = {},
  ): Promise<RespostaPaginada<User>> {
    const paginacao = calcularPaginacao(filtros);
    const where = {
      papel: filtros.papel,
      ativo: filtros.ativo,
    };
    const [usuarios, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip: paginacao.skip,
        take: paginacao.take,
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginar(usuarios, total, paginacao);
  }

  async desativar(
    id: string,
    usuarioLogado: UsuarioAutenticado,
  ): Promise<User> {
    await this.buscarPorIdOuFalhar(id);

    // Um ADMIN nao pode se autodesativar: ninguem mais poderia reativa-lo
    // (nao existe outra forma de virar ADMIN a nao ser ja sendo um)
    if (id === usuarioLogado.id) {
      throw new ConflictException('Voce nao pode desativar a sua propria conta');
    }

    return this.prisma.user.update({ where: { id }, data: { ativo: false } });
  }

  async reativar(id: string): Promise<User> {
    await this.buscarPorIdOuFalhar(id);
    return this.prisma.user.update({ where: { id }, data: { ativo: true } });
  }
}
