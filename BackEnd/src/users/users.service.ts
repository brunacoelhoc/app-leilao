import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { User } from '../generated/prisma/client';

// Dados exigidos do banco. So fala com a tabela User; regras de negocio ficam no AuthService
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
}
